import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redact, StartupLog } from './startup-log.mjs'
import { startupPage } from './startup-page.mjs'
import { APPLY_PLUGIN_UPDATES } from './parent-ipc.mjs'
import { beginPluginUpdate, completePluginRollback, completePluginUpdates, pendingPluginUpdates, pluginUpdateInstalled, pluginUpdateRecovery, preparePluginRollback, recordPluginUpdateFailure, verifyPluginRollback } from './pending-updates.mjs'
import { enforcePluginQuarantine, quarantineFailedPluginActivation } from './plugin-activation-recovery.mjs'

const appId = 'app.cat-hode.dsh-app'
app.setName('DSH App')
app.setAppUserModelId(appId)
const dshHome = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'))
const profile = join(dshHome, 'profiles', 'web')
const desktopLink = join(dshHome, 'dsh-app')
const pluginBackups = join(desktopLink, 'backups')
const instanceFile = join(desktopLink, 'web.json')
const runtimeFile = join(desktopLink, 'runtime.json')
const requestedPort = process.env.DSH_APP_PORT || '0'
if (!/^\d{1,5}$/.test(requestedPort) || Number(requestedPort) > 65535) throw new Error('DSH_APP_PORT 必须是 0–65535 的端口号。')
const asset = name => app.isPackaged ? join(process.resourcesPath, name) : fileURLToPath(new URL(name, import.meta.url))
const cliRuntime = () => {
  let saved = {}
  try { saved = JSON.parse(readFileSync(runtimeFile, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const cli = process.env.DSH_APP_CLI || saved.cli
  const node = process.env.DSH_APP_NODE || saved.node
  if (!cli || !existsSync(cli)) throw new Error('找不到 DSH CLI。请先安装 DSH App 插件并运行一次 dsh web，或设置 DSH_APP_CLI。')
  if (!node || !existsSync(node)) throw new Error('找不到启动 DSH 的 Node.js。请设置 DSH_APP_NODE。')
  const cwd = saved.cwd && existsSync(saved.cwd) ? saved.cwd : dirname(cli)
  const execArgv = Array.isArray(saved.execArgv) && saved.execArgv.every(value => typeof value === 'string') ? saved.execArgv : []
  return { cli, node, cwd, execArgv }
}
const ownerId = randomUUID()
let window
let tray
let backend
let installer
let pendingPluginUpdate
let instance
let stopping = false
let restarting = false
let quitAllowed = false
let connecting = false
let following = false
let instanceWatcher
let followTimer
let healthTimer
let followPending = false
let replacementReadyUntil = 0
let startupUrl
let startupTimer
const startup = new StartupLog(() => {
  if (quitAllowed || startupTimer) return
  startupTimer = setTimeout(() => {
    startupTimer = undefined
    if (window && !window.isDestroyed() && window.webContents.getURL() === startupUrl) {
      window.webContents.send('dsh:startup-state', startup.snapshot())
    }
  }, 50)
})
function log(message) {
  mkdirSync(desktopLink, { recursive: true })
  appendFileSync(join(desktopLink, 'desktop.log'), `${new Date().toISOString()} ${redact(message)}\n`)
}

function saveStartupFailure(error) {
  mkdirSync(desktopLink, { recursive: true })
  const path = join(desktopLink, 'last-startup-failure.log')
  writeFileSync(path, `${new Date().toISOString()} ${redact(String(error))}\n${startup.text()}\n`)
  log(`Startup transcript saved: ${path}`)
}

function saveStartupSuccess() {
  mkdirSync(desktopLink, { recursive: true })
  const path = join(desktopLink, 'last-startup.log')
  writeFileSync(path, `${new Date().toISOString()} ready after ${Date.now() - startup.startedAt}ms\n${startup.text()}\n`, { mode: 0o600 })
}

function validInstance(record) {
  if (record?.schemaVersion !== 1 || record.profile !== 'web' || !Number.isSafeInteger(record.pid) || record.pid < 1) return false
  try {
    const url = new URL(record.url)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.origin === record.origin
      && url.pathname === '/' && !url.username && !url.password
  } catch { return false }
}

async function sharedInstance() {
  let record
  try { record = JSON.parse(readFileSync(instanceFile, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  if (!validInstance(record)) throw new Error('共享服务的连接记录无效。')
  try { process.kill(record.pid, 0) }
  catch (error) { if (error.code === 'ESRCH') return; throw error }
  try {
    const response = await fetch(record.url, { redirect: 'manual', signal: AbortSignal.timeout(2500) })
    if (response.ok || response.status === 302 || response.status === 303) return record
  } catch (error) {
    if (error.name !== 'TimeoutError' && error.cause?.code !== 'ECONNREFUSED') throw error
  }
}

const ownsInstance = () => !!backend || (instance?.ownerId === ownerId)

async function instanceRequest(record, path) {
  const auth = await fetch(record.url, { redirect: 'manual', signal: AbortSignal.timeout(2500) })
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  return fetch(record.origin + path, {
    method: 'POST', headers: { cookie, origin: record.origin, 'x-dsh-app-owner': ownerId },
    signal: AbortSignal.timeout(5000),
  })
}

async function followReplacement() {
  if (quitAllowed || stopping || restarting || connecting) return
  if (following) { followPending = true; return }
  following = true
  try {
    const record = await sharedInstance()
    if (!record) {
      if (instance && !backend) {
        instance = undefined
        await showStartup('共享服务已停止。可直接重新启动，继续使用当前插件和会话。', true)
      }
      return
    }
    if (quitAllowed || stopping || restarting || connecting || record.pid === instance?.pid) return
    instance = record
    // dshmarket monitors the replacement for eight seconds before releasing it.
    // Early intentional shutdown would otherwise launch its failure recovery server.
    replacementReadyUntil = Date.now() + 10000
    log(`Reconnected after service restart; backend=${record.pid}; owned=${ownsInstance()}`)
    if (window && !window.isDestroyed()) await window.loadURL(record.url)
  } catch (error) { log(`Waiting for shared service replacement: ${String(error)}`) }
  finally {
    following = false
    if (followPending) {
      followPending = false
      void followReplacement()
    }
  }
}

async function startBackend(recover = false) {
  startup.line('system', '正在检查已有的共享服务…')
  const existing = await sharedInstance()
  if (existing) {
    startup.line('system', `连接已有服务 · PID ${existing.pid} · ${existing.origin}`)
    return existing
  }
  const recovery = pluginUpdateRecovery(profile, pluginBackups)
  let rollback
  let applied = []
  if (recover || recovery?.recovering) {
    startup.status('loading', '正在恢复更新前的插件版本和启用配置…')
    rollback = preparePluginRollback(profile, pluginBackups)
    await runPluginCommand(['install', '--force', '--no-frozen-lockfile', '--config.minimum-release-age=0'])
    verifyPluginRollback(profile, rollback)
  } else {
    applied = await installPendingPlugins()
  }
  const quarantined = enforcePluginQuarantine(profile, desktopLink)
  for (const item of quarantined) startup.line('system', `已隔离不兼容插件 ${item.packageName}@${item.version}；安装新版后会重新尝试加载。`)
  if (quitAllowed) throw new Error('启动已取消。')
  const { node, cli, cwd, execArgv } = cliRuntime()
  const runner = asset('backend-runner.mjs')
  const env = { ...process.env, DSH_HOME: dshHome, DSH_APP_OWNER: ownerId }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  delete env.DSH_APP_CLI
  delete env.DSH_APP_NODE
  startup.line('system', `启动后端：dsh --profile web --no-open --host 127.0.0.1 --port ${requestedPort}`)
  const child = spawn(node, [...execArgv, '--use-system-ca', runner, cli, requestedPort], {
    cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  backend = child
  child.on('message', value => {
    if (value !== APPLY_PLUGIN_UPDATES && value?.type !== APPLY_PLUGIN_UPDATES) return
    if (backend !== child || quitAllowed) return
    pendingPluginUpdate = child
    applyRequestedUpdates()
  })
  const run = startup.run
  for (const [stream, output] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
    output.setEncoding('utf8')
    output.on('data', chunk => { if (startup.run === run) startup.append(stream, chunk) })
    output.once('end', () => { if (startup.run === run) startup.flush(stream) })
  }
  child.once('exit', () => {
    if (backend === child) backend = undefined
    if (instance?.pid === child.pid && !stopping && !restarting && window && !window.isDestroyed()) {
      instance = undefined
      void showStartup('共享服务已停止。可直接重新启动，继续使用当前插件和会话。', true)
    }
  })
  const ready = await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => finish(new Error('共享服务启动超时（90 秒）。请检查上方启动日志。')), 90000)
    const message = value => {
      if (value?.type === 'dsh-app-ready' && validInstance(value.instance) && value.instance.pid === child.pid) finish(null, value.instance)
      else if (value?.type === 'dsh-app-fatal') {
        const error = new Error(redact(String(value.message)))
        error.dshSharedFatal = true
        finish(error)
      }
    }
    const exited = code => finish(new Error(`共享服务退出（${code}）。`))
    const failed = error => finish(error)
    function finish(error, result) {
      clearTimeout(timer)
      child.off('message', message)
      child.off('close', exited)
      child.off('error', failed)
      if (error) reject(error)
      else resolveReady(result)
    }
    child.on('message', message)
    child.once('close', exited)
    child.once('error', failed)
  })
  if (rollback) {
    completePluginRollback(profile)
    startup.line('system', '已恢复更新前的插件配置；失败批次及日志已保存在备份目录。')
    log(`Plugin update recovered; backup=${rollback.backup}`)
  } else if (applied.length > 0) {
    completePluginUpdates(profile, applied)
    startup.line('system', `${applied.length} 项插件变更已核验安装版本和启用配置，共享服务已就绪。`)
  }
  return ready
}

function applyRequestedUpdates() {
  if (!pendingPluginUpdate || connecting || restarting || stopping || quitAllowed) return
  const source = pendingPluginUpdate
  pendingPluginUpdate = undefined
  if (backend !== source) return
  log(`Plugin update requested by backend=${source.pid}; applying after shutdown`)
  void restart()
}

async function stopInstaller(child = installer) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  await new Promise(resolveStop => {
    child.once('close', resolveStop)
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.once('error', () => child.kill())
    killer.once('exit', code => { if (code !== 0 && child.exitCode === null) child.kill() })
  })
}

async function installPendingPlugins() {
  const pending = pendingPluginUpdates(profile)
  if (pending.length === 0) return []
  const recovery = beginPluginUpdate(profile, pluginBackups)
  const targets = pending.filter(target => !pluginUpdateInstalled(profile, target))
  if (targets.length > 0) {
    startup.status('loading', `正在安装 ${targets.length} 项插件变更，完成后自动启动…`)
    startup.line('system', `已备份插件配置：${recovery.backup}`)
    const specs = targets.map(target => `${target.packageName}@${target.version}`)
    const args = ['add', '--save-exact', '--config.minimum-release-age=0', ...specs]
    await runPluginCommand(args)
    if (targets.some(target => !pluginUpdateInstalled(profile, target))) {
      startup.line('system', '包管理器已结束，但实际版本或启用配置未匹配；正在强制重建一次。')
      await runPluginCommand([...args, '--force'])
    }
  }
  for (const target of pending) {
    if (!pluginUpdateInstalled(profile, target)) throw new Error(`插件安装校验失败：${target.packageName}@${target.version}`)
  }
  startup.status('loading', '插件安装完成，正在加载共享服务…')
  return pending
}

async function runPluginCommand(args) {
  // Profiles can have their manifest/lockfile rewritten by plugins or rollback. pnpm 11's
  // optimistic fast path can otherwise report success while retaining different package files.
  args = [...args, '--config.optimistic-repeat-install=false']
  const { node, cli, cwd, execArgv } = cliRuntime()
  const env = { ...process.env, DSH_HOME: dshHome }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  delete env.DSH_APP_OWNER
  startup.line('system', `执行插件管理：dsh plugin --profile web ${args.join(' ')}`)
  const child = spawn(node, [
    ...execArgv, '--use-system-ca', cli, 'plugin', '--profile', 'web', ...args,
  ], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  installer = child
  const run = startup.run
  for (const [stream, output] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
    output.setEncoding('utf8')
    output.on('data', chunk => { if (startup.run === run) startup.append(stream, chunk) })
    output.once('end', () => { if (startup.run === run) startup.flush(stream) })
  }
  try {
    await new Promise((resolveInstall, reject) => {
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; void stopInstaller(child) }, 600000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        if (timedOut || code !== 0) reject(new Error(`插件安装${timedOut ? '超时' : '失败'}（退出码 ${code}，信号 ${signal ?? '无'}）。待处理记录已保留，可重新启动重试或恢复更新前版本。`))
        else resolveInstall()
      })
    })
  } finally { if (installer === child) installer = undefined }
}

async function stopBackend() {
  const child = backend
  if (!child) {
    if (instance?.ownerId !== ownerId) return
    stopping = true
    try {
      const record = instance
      const settleDelay = replacementReadyUntil - Date.now()
      if (settleDelay > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, settleDelay))
      const response = await instanceRequest(record, '/dsh-app/shutdown')
      if (!response.ok) throw new Error(`共享服务停止失败（HTTP ${response.status}）。`)
      const deadline = Date.now() + 12000
      while (Date.now() < deadline) {
        try { process.kill(record.pid, 0) }
        catch (error) { if (error.code === 'ESRCH') return; throw error }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
      }
      throw new Error('共享服务未能在退出期限内停止。')
    } finally { stopping = false }
    return
  }
  if (child.exitCode !== null) return
  stopping = true
  await new Promise(resolveStop => {
    const timer = setTimeout(() => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('error', () => child.kill())
    }, 12000)
    child.once('exit', () => { clearTimeout(timer); resolveStop() })
    if (child.connected) child.send({ type: 'shutdown' }, error => { if (error) child.kill() })
    else child.kill()
  })
  stopping = false
}

async function openWeb() { if (instance) await shell.openExternal(instance.url) }

function showWindow() {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function showFailure(error) {
  log(`Startup failed: ${String(error)}`)
  if (quitAllowed) return
  startup.line('error', String(error.stack || error))
  try { saveStartupFailure(error) }
  catch (logError) { log(`Could not save startup transcript: ${String(logError)}`) }
  try { startup.recovery(recordPluginUpdateFailure(profile, pluginBackups, startup.text())) }
  catch (backupError) { log(`Could not record update failure: ${String(backupError)}`) }
  if (window && !window.isDestroyed()) {
    void showStartup('请查看启动日志，或点击下方按钮重新尝试。', true, 'error')
  } else {
    void dialog.showMessageBox({ type: 'error', title: 'DSH 启动失败', message: redact(String(error)), buttons: ['确定'] })
  }
}

async function showStartup(message = '正在加载共享插件与会话…', retry = false, phase = 'stopped') {
  startup.status(retry ? phase : 'loading', message)
  if (!startupUrl) {
    const whale = readFileSync(asset('DSH.png')).toString('base64')
    startupUrl = `data:text/html;charset=utf-8,${encodeURIComponent(startupPage(whale))}`
  }
  if (window.webContents.getURL() !== startupUrl) await window.loadURL(startupUrl)
}

async function connect(recover = false) {
  connecting = true
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { instance = await startBackend(recover); break }
      catch (error) {
        startup.line('error', String(error))
        try { saveStartupFailure(error) }
        catch (logError) { log(`Could not save startup transcript: ${String(logError)}`) }
        if (quitAllowed || recover || !(error.dshSharedFatal || /^共享服务退出（\d+）/.test(String(error.message)))
          || pluginUpdateRecovery(profile, pluginBackups) || pendingPluginUpdates(profile).length > 0 || attempt === 4) throw error
        if (backend) await stopBackend()
        const quarantined = quarantineFailedPluginActivation(profile, desktopLink, pluginBackups, startup.text())
        if (!quarantined) throw error
        log(`Quarantined failed plugin ${quarantined.packageName}@${quarantined.version}; backup=${quarantined.backup}`)
        startup.line('system', `插件 ${quarantined.packageName}@${quarantined.version} 加载失败，已备份启用配置并暂时隔离；正在重试其余插件。`)
        startup.status('loading', '已隔离启动失败的插件，正在重试共享服务…')
      }
    }
    startup.line('system', `后端已就绪 · PID ${instance.pid} · 正在打开 DSH`)
    startup.status('loading', '后端已就绪，正在打开界面…')
    log(`Connected to ${instance.origin}; backend=${instance.pid}; owned=${ownsInstance()}`)
    try { saveStartupSuccess() }
    catch (error) { log(`Could not save successful startup transcript: ${String(error)}`) }
    if (!quitAllowed && window && !window.isDestroyed()) await window.loadURL(instance.url)
  } finally { connecting = false; applyRequestedUpdates() }
}

async function restart(recover = false) {
  if (restarting || connecting || installer) return
  if (instance && !ownsInstance()) {
    await dialog.showMessageBox(window, { message: '当前服务由 Web 启动命令运行，请在原入口重启。' })
    return
  }
  restarting = true
  try {
    startup.reset()
    await showStartup('正在重启共享服务…')
    await stopBackend()
    instance = undefined
    await connect(recover)
  } catch (error) { showFailure(error) }
  finally { restarting = false; applyRequestedUpdates() }
}

async function main() {
  Menu.setApplicationMenu(null)
  window = new BrowserWindow({
    title: 'DSH', width: 1440, height: 920, minWidth: 880, minHeight: 600,
    show: !process.argv.includes('--open-web'),
    icon: asset('DSH.ico'), backgroundColor: '#f7f8fc',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#253039', height: 38 },
    webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  })
  const requireStartupFrame = event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== startupUrl) throw new Error('当前页面不能请求此操作。')
  }
  const requireDesktopFrame = event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !instance) throw new Error('当前页面不能请求桌面操作。')
    let origin
    try { origin = new URL(event.senderFrame.url).origin } catch { throw new Error('当前页面地址无效。') }
    if (origin !== instance.origin) throw new Error('当前页面不能请求桌面操作。')
  }
  ipcMain.handle('dsh:restart-shared-service', event => {
    requireStartupFrame(event)
    return restart()
  })
  ipcMain.handle('dsh:recover-plugin-update', event => {
    requireStartupFrame(event)
    return restart(true)
  })
  ipcMain.handle('dsh:startup-state', event => {
    requireStartupFrame(event)
    return startup.snapshot()
  })
  ipcMain.handle('dsh:copy-startup-log', event => {
    requireStartupFrame(event)
    clipboard.writeText(startup.text())
  })
  ipcMain.on('dsh:desktop-theme', (event, scheme) => {
    try { requireDesktopFrame(event) } catch { return }
    if (scheme !== 'light' && scheme !== 'dark') return
    window.setTitleBarOverlay({ color: scheme === 'dark' ? '#191919' : '#ffffff', symbolColor: scheme === 'dark' ? '#dce0df' : '#253039', height: 38 })
  })
  ipcMain.handle('dsh:desktop-action', async (event, action) => {
    requireDesktopFrame(event)
    if (typeof action !== 'string') throw new Error('桌面操作无效。')
    if (action === 'web') return openWeb()
    if (action === 'restart') return restart()
    if (action === 'reload') return window.reload()
    if (action === 'full') return window.setFullScreen(!window.isFullScreen())
    if (action === 'devtools') return window.webContents.toggleDevTools()
    if (action === 'zoomIn' || action === 'zoomOut' || action === 'zoomReset') {
      const current = window.webContents.getZoomFactor()
      const next = action === 'zoomReset' ? 1 : Math.max(0.5, Math.min(2, Math.round((current + (action === 'zoomIn' ? 0.1 : -0.1)) * 10) / 10))
      window.webContents.setZoomFactor(next)
      return next
    }
    if (action === 'about') return dialog.showMessageBox(window, { title: '关于 DSH', message: `DSH 客户端 ${app.getVersion()}`, detail: '客户端与浏览器共用 web 配置、插件和会话。', buttons: ['确定'] })
    if (action === 'quit') return app.quit()
    throw new Error('未知桌面操作。')
  })
  mkdirSync(desktopLink, { recursive: true })
  instanceWatcher = watch(desktopLink, (_event, filename) => {
    if (String(filename) !== 'web.json') return
    clearTimeout(followTimer)
    followTimer = setTimeout(() => void followReplacement(), 250)
  })
  healthTimer = setInterval(() => {
    if (!instance || backend || quitAllowed || stopping || restarting || connecting) return
    try { process.kill(instance.pid, 0) }
    catch (error) {
      if (error.code === 'ESRCH') void followReplacement()
      else log(`Shared service health check failed: ${String(error)}`)
    }
  }, 2000)
  window.setAppDetails({ appId, appIconPath: asset('DSH.ico'), relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: 'DSH App' })
  tray = new Tray(asset('DSH.ico'))
  tray.setToolTip('DSH App · 客户端与 Web 共享服务')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DSH 客户端', click: showWindow },
    { label: '在浏览器打开', click: () => void openWeb() },
    { label: '刷新界面', click: () => window?.reload() },
    { label: '重启共享服务', click: () => void restart() },
    { type: 'separator' },
    { label: '退出 DSH App', click: () => app.quit() },
  ]))
  tray.on('double-click', showWindow)
  window.on('close', event => {
    if (quitAllowed) return
    event.preventDefault()
    window.hide()
    log('Window hidden; shared service retained')
  })
  const rendererLogTimes = new Map()
  window.webContents.on('console-message', details => {
    if (details.level !== 'error' && details.level !== 'warning') return
    const source = String(details.sourceId || '').split(/[?#]/, 1)[0].slice(0, 256)
    const message = String(details.message).slice(0, 1024)
    const key = `${details.level}:${source}:${message.slice(0, 256)}`
    const now = Date.now()
    if (now - (rendererLogTimes.get(key) || 0) < 30000) return
    if (rendererLogTimes.size >= 100) rendererLogTimes.clear()
    rendererLogTimes.set(key, now)
    log(`Renderer ${details.level}: ${message} (${source}:${details.lineNumber})`)
  })
  window.webContents.on('did-finish-load', () => log(`Page loaded; title=${window.webContents.getTitle()}; visible=${window.isVisible()}; minimized=${window.isMinimized()}; menuBarVisible=${window.isMenuBarVisible()}`))
  window.on('page-title-updated', (_event, title) => log(`Page title updated: ${title}`))
  window.webContents.on('render-process-gone', (_event, details) => log(`Renderer stopped: ${details.reason} (${details.exitCode})`))
  window.webContents.on('did-fail-load', (_event, code, description) => log(`Load failed: ${code} ${description}`))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (instance && new URL(url).origin === instance.origin) return { action: 'allow' }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (instance && new URL(url).origin !== instance.origin) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta || input.isAutoRepeat) return
    if (input.shift && input.key.toLowerCase() === 'b') {
      event.preventDefault()
      void openWeb()
    } else if (!input.shift && input.key.toLowerCase() === 'r') {
      event.preventDefault()
      window.reload()
    }
  })
  await showStartup()
  await connect()
  if (process.argv.includes('--open-web')) await openWeb()
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quit')) app.quit()
    else if (argv.includes('--open-web')) void openWeb()
    else if (argv.includes('--hide')) window?.close()
    else showWindow()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', event => {
    if (quitAllowed) return
    quitAllowed = true
    instanceWatcher?.close()
    clearTimeout(followTimer)
    clearInterval(healthTimer)
    clearTimeout(startupTimer)
    pendingPluginUpdate = undefined
    if (!ownsInstance() && !installer) return
    event.preventDefault()
    void (async () => { await stopInstaller(); await stopBackend() })()
      .catch(error => log(`Service shutdown failed: ${String(error)}`)).finally(() => app.quit())
  })
  if (process.argv.includes('--quit')) app.quit()
  else void app.whenReady().then(main).catch(showFailure)
}
