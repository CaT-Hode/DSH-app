import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redact, StartupLog } from './startup-log.mjs'
import { startupPage } from './startup-page.mjs'
import { applyStartupTheme } from './startup-theme.mjs'
import { APPLY_PLUGIN_UPDATES } from './parent-ipc.mjs'
import { beginPluginUpdate, completePluginRollback, completePluginUpdateBatch, completePluginUpdates, hasPendingPluginOperations, pendingPluginUpdates, pluginUpdateInstalled, pluginUpdateRecovery, preparePluginRollback, recordPluginUpdateFailure, verifyPluginRollback } from './pending-updates.mjs'
import { applyMarketOperations, completeMarketOperations, marketOperationInstalled, readMarketOperations, recordMarketFailure, recordMarketResults } from './market-operations.mjs'
import { enforcePluginQuarantine, quarantineFailedPluginActivation } from './plugin-activation-recovery.mjs'
import { checkCoreUpdate, readDshVersion, releaseUrl } from './core-update.mjs'
import { isCurrentCoreUpdateCheck } from './core-update-order.mjs'
import { backupCoreProfileMetadata, coreRollbackTarget, finishCoreRuntime, installCoreRuntime, readActiveCore, restoreCoreProfileMetadata, rollbackCoreRuntime, switchCoreRuntime } from './core-runtime.mjs'
import { checkCoreCompatibility } from './core-compatibility.mjs'
import { inspectRenderer, isFatalRendererMessage, observeRendererHealth } from './renderer-health.mjs'
import { maintenanceWindow } from './maintenance-window.mjs'
import { MaintenanceController } from './maintenance-controller.mjs'
import { captureCapabilities, compareCapabilities, runFunctionalCheck } from '../lib/functional-check.mjs'
import { readModelConfiguration, compareModelConfiguration } from '../lib/model-audit.mjs'
import { configurationRevision } from '../lib/configuration-snapshot.mjs'
import { writeJson } from '../lib/files.mjs'

const appId = 'app.cat-hode.dsh-app'
const WINDOW_CONTROLS_HEIGHT = 30
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
  const managed = readActiveCore(desktopLink)?.active
  const cli = process.env.DSH_APP_CLI || managed?.cli || saved.cli
  const node = process.env.DSH_APP_NODE || managed?.node || saved.node
  if (!cli || !existsSync(cli)) throw new Error('找不到 DSH CLI。请先安装 DSH App 插件并运行一次 dsh web，或设置 DSH_APP_CLI。')
  if (!node || !existsSync(node)) throw new Error('找不到启动 DSH 的 Node.js。请设置 DSH_APP_NODE。')
  const cwd = (managed?.cli === cli ? managed.cwd : saved.cwd) && existsSync(managed?.cli === cli ? managed.cwd : saved.cwd)
    ? (managed?.cli === cli ? managed.cwd : saved.cwd) : dirname(cli)
  const selectedArgv = managed?.cli === cli ? managed.execArgv : saved.execArgv
  const execArgv = Array.isArray(selectedArgv) && selectedArgv.every(value => typeof value === 'string') ? selectedArgv : []
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
let rendererProbeTimer
let coreUpdateTimer
let coreUpdateInitialTimer
let coreUpdateCheck
let coreUpdating = false
let maintenance
let diagnostics
let upgradeAbort
let coreUpdateOperation
let coreUpdateState = { phase: 'idle', revision: 0 }
let rendererFailureHandled = false
let pendingRendererFailure
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

function publishCoreUpdate(state) {
  coreUpdateState = { ...state, revision: coreUpdateState.revision + 1 }
  if (window && !window.isDestroyed()) window.webContents.send('dsh:core-update-state', coreUpdateState)
  return coreUpdateState
}

function currentCoreVersion() {
  // A separately launched Web service may still use its original CLI.
  if (instance && !ownsInstance()) {
    const recorded = JSON.parse(readFileSync(runtimeFile, 'utf8'))
    return readDshVersion(recorded.cli)
  }
  return readDshVersion(cliRuntime().cli)
}

function checkForCoreUpdate() {
  if (quitAllowed || coreUpdating) return Promise.resolve(coreUpdateState)
  if (coreUpdateCheck) return coreUpdateCheck
  coreUpdateCheck = (async () => {
    let currentVersion
    const revisionAtStart = coreUpdateState.revision
    try {
      currentVersion = currentCoreVersion()
      const state = await checkCoreUpdate(currentVersion)
      if (quitAllowed || coreUpdating || coreUpdateState.revision !== revisionAtStart) return coreUpdateState
      if (!isCurrentCoreUpdateCheck(revisionAtStart, currentVersion, coreUpdateState.revision, currentCoreVersion(), coreUpdating)) return coreUpdateState
      log(`DSH update check: current=${currentVersion ?? 'unknown'}; phase=${state.phase}; latest=${state.version ?? 'none'}`)
      return publishCoreUpdate(state)
    } catch (error) {
      log(`DSH update check failed: ${String(error)}`)
      if (quitAllowed || coreUpdating || coreUpdateState.revision !== revisionAtStart) return coreUpdateState
      try { if (!isCurrentCoreUpdateCheck(revisionAtStart, currentVersion, coreUpdateState.revision, currentCoreVersion(), coreUpdating)) return coreUpdateState }
      catch { return coreUpdateState }
      if (coreUpdateState.phase === 'available' && coreUpdateState.currentVersion === currentVersion) return coreUpdateState
      return publishCoreUpdate({ phase: 'error' })
    }
  })().finally(() => { coreUpdateCheck = undefined })
  return coreUpdateCheck
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

function availableRecoveryActions() {
  let pluginUpdate = false
  try { pluginUpdate = !!pluginUpdateRecovery(profile, pluginBackups) }
  catch (error) { log(`Could not inspect plugin rollback: ${String(error)}`) }
  let coreRollbackVersion
  try {
    const core = coreRollbackTarget(desktopLink)
    if (core) coreRollbackVersion = readDshVersion(core.previous.cli)
  } catch (error) { log(`Could not inspect DSH core rollback: ${String(error)}`) }
  return {
    pluginUpdate,
    coreRollbackVersion,
  }
}

function updateStartupRecovery() {
  try {
    const actions = availableRecoveryActions()
    startup.recovery(actions.pluginUpdate, actions.coreRollbackVersion)
  } catch (error) {
    log(`Could not inspect recovery actions: ${String(error)}`)
    startup.recovery(false)
  }
}

function isCurrentDesktopPage() {
  if (!instance || !window || window.isDestroyed()) return false
  try { return new URL(window.webContents.getURL()).origin === instance.origin }
  catch { return false }
}

function reportRendererFailure(message) {
  if (rendererFailureHandled || quitAllowed || restarting || connecting || coreUpdating || stopping || !isCurrentDesktopPage()) return
  rendererFailureHandled = true
  const error = new Error(message)
  log(`DSH frontend failed: ${message}`)
  showFailure(error)
}

function scheduleRendererProbe() {
  clearTimeout(rendererProbeTimer)
  if (!isCurrentDesktopPage()) return
  rendererProbeTimer = setTimeout(async () => {
    rendererProbeTimer = undefined
    if (!isCurrentDesktopPage() || restarting || connecting || coreUpdating || stopping || quitAllowed) return
    try {
      const state = await inspectRenderer(window.webContents)
      if (state.origin !== instance.origin || state.ready && !state.overlay) return
      reportRendererFailure('DSH 前端已加载，但应用界面没有正常显示。')
    } catch (error) {
      reportRendererFailure(`DSH 前端无响应：${String(error.message || error)}`)
    }
  }, 20000)
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
  if (coreUpdating && (recover || recovery || hasPendingPluginOperations(profile))) throw new Error('插件变更尚未完成，不能同时切换 DSH 核心。')
  let rollback
  let applied = { legacy: [], market: [] }
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
  for (const operation of applied.market) {
    if (!marketOperationInstalled(profile, operation, { enabled: operation.activated })) throw new Error(`插件 ${operation.packageName} 的启用状态未能保持；隔离保护已保留，请检查诊断或恢复。`)
  }
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
  } else if (applied.legacy.length + applied.market.length > 0) {
    if (applied.legacy.length) completePluginUpdates(profile, applied.legacy)
    if (applied.market.length) {
      recordMarketResults(profile, applied.market.map(operation => ({ ...operation, status: 'succeeded', finishedAt: Date.now() })))
      completeMarketOperations(profile, applied.market)
    }
    completePluginUpdateBatch(profile)
    startup.line('system', `${applied.legacy.length + applied.market.length} 项插件变更已核验安装版本和启用配置，共享服务已就绪。`)
  }
  return ready
}

function applyRequestedUpdates() {
  if (!pendingPluginUpdate || coreUpdating || connecting || restarting || stopping || quitAllowed || maintenance?.operation) return
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
  const market = readMarketOperations(profile)
  if (pending.length === 0 && market.length === 0) return { legacy: [], market: [] }
  if (pending.some(target => market.some(operation => operation.packageName === target.packageName))) throw new Error('同一插件同时存在旧更新和市场待办，请取消其中一项后重试。')
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
  if (market.length) {
    startup.status('loading', `正在应用 ${market.length} 项插件市场变更…`)
    startup.line('system', `已备份插件配置：${recovery.backup}`)
  }
  const appliedMarket = await applyMarketOperations(profile, market, runPluginCommand)
  startup.status('loading', '插件安装完成，正在加载共享服务…')
  return { legacy: pending, market: appliedMarket }
}

async function runPluginCommand(args) {
  if (quitAllowed) throw new Error('客户端正在退出，插件待办已保留。')
  if (backend?.exitCode === null || instance) throw new Error('共享服务尚未停止，不能修改当前配置的插件文件。')
  // Profiles can have their manifest/lockfile rewritten by plugins or rollback. pnpm 11's
  // optimistic fast path can otherwise report success while retaining different package files.
  args = [...args, '--config.optimistic-repeat-install=false']
  const { node, cli, cwd, execArgv } = cliRuntime()
  const env = { ...process.env, DSH_HOME: dshHome }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  delete env.DSH_APP_OWNER
  for (const key of Object.keys(env)) if (/KEY|SECRET|TOKEN|PASSWORD/i.test(key)) delete env[key]
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
  try { recordPluginUpdateFailure(profile, pluginBackups, startup.text()) }
  catch (backupError) { log(`Could not record update failure: ${String(backupError)}`) }
  try { if (pluginUpdateRecovery(profile, pluginBackups)) recordMarketFailure(profile, redact(String(error))) }
  catch (resultError) { log(`Could not record marketplace failure: ${String(resultError)}`) }
  updateStartupRecovery()
  if (window && !window.isDestroyed()) {
    void showStartup('请查看启动日志，或点击下方按钮重新尝试。', true, 'error')
  } else {
    void dialog.showMessageBox({ type: 'error', title: 'DSH 启动失败', message: redact(String(error)), buttons: ['确定'] })
  }
}

async function showStartup(message = '正在加载共享插件与会话…', retry = false, phase = 'stopped') {
  applyStartupTheme(nativeTheme, profile, window, WINDOW_CONTROLS_HEIGHT)
  startup.status(retry ? phase : 'loading', message)
  if (!startupUrl) {
    const whale = readFileSync(asset('DSH.png')).toString('base64')
    startupUrl = `data:text/html;charset=utf-8,${encodeURIComponent(startupPage(whale))}`
  }
  if (window.webContents.getURL() !== startupUrl) await window.loadURL(startupUrl)
}

async function connect(recover = false, { allowPluginQuarantine = true } = {}) {
  connecting = true
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { instance = await startBackend(recover); break }
      catch (error) {
        startup.line('error', String(error))
        try { saveStartupFailure(error) }
        catch (logError) { log(`Could not save startup transcript: ${String(logError)}`) }
        if (quitAllowed || recover || !allowPluginQuarantine || !(error.dshSharedFatal || /^共享服务退出（\d+）/.test(String(error.message)))
          || pluginUpdateRecovery(profile, pluginBackups) || hasPendingPluginOperations(profile) || attempt === 4) throw error
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
    if (!quitAllowed && window && !window.isDestroyed()) {
      pendingRendererFailure = undefined
      rendererFailureHandled = false
      await window.loadURL(instance.url)
      if (pendingRendererFailure) {
        const message = pendingRendererFailure
        pendingRendererFailure = undefined
        throw new Error(`DSH 前端启动失败：${message}`)
      }
    }
  } finally { connecting = false; applyRequestedUpdates() }
}

async function restart(recover = false, { fromMaintenance = false } = {}) {
  if (coreUpdating || restarting || connecting || installer || maintenance?.operation && !fromMaintenance) return
  if (instance && !ownsInstance()) {
    await dialog.showMessageBox(window, { message: '当前服务由 Web 启动命令运行，请在原入口重启。' })
    return
  }
  if (recover) {
    if (!pluginUpdateRecovery(profile, pluginBackups)) throw new Error('没有可恢复的插件更新备份。')
    if (!fromMaintenance) {
      const result = await dialog.showMessageBox(window, {
        type: 'warning', title: '恢复插件更新',
        message: '将恢复更新前的插件版本和启用配置，然后重启共享服务。',
        detail: '运行中的任务会中断；会话和模型配置不会回退。',
        buttons: ['恢复并重启', '取消'], defaultId: 0, cancelId: 1,
      })
      if (result.response !== 0) return false
    }
    if (coreUpdating || restarting || connecting || installer || maintenance?.operation && !fromMaintenance) return
    if (!pluginUpdateRecovery(profile, pluginBackups)) throw new Error('插件更新恢复记录已变化，请刷新诊断后重试。')
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

async function recoverPreviousCore({ fromMaintenance = false } = {}) {
  if (quitAllowed || coreUpdating || restarting || connecting || installer || maintenance?.operation && !fromMaintenance)
    throw new Error('请先完成当前启动或更新操作。')
  if (instance && !ownsInstance()) throw new Error('当前共享服务由外部命令启动，请从原入口停止后重试。')
  const target = coreRollbackTarget(desktopLink)
  if (!target) throw new Error('没有可用的上一个 DSH 版本及其配置备份。')
  const targetVersion = readDshVersion(target.previous.cli)
  if (!targetVersion) throw new Error('无法识别上一个 DSH 版本，已保留当前运行版本。')
  if (!fromMaintenance) {
    const result = await dialog.showMessageBox(window, {
      type: 'warning', title: '恢复上一个 DSH 版本',
      message: `将切换到 DSH ${targetVersion} 并恢复该版本对应的配置备份。`,
      detail: '共享服务会停止；当前插件和会话文件不会删除。',
      buttons: ['恢复并重启', '取消'], defaultId: 0, cancelId: 1,
    })
    if (result.response !== 0) return false
  }
  if (quitAllowed || coreUpdating || restarting || connecting || installer || maintenance?.operation && !fromMaintenance)
    throw new Error('恢复期间启动状态已变化，请刷新诊断后重试。')
  const currentTarget = coreRollbackTarget(desktopLink)
  if (!currentTarget || currentTarget.active.cli !== target.active.cli
    || currentTarget.previous.cli !== target.previous.cli || currentTarget.backup !== target.backup)
    throw new Error('DSH 核心或配置备份已变化，请刷新诊断后重试。')

  coreUpdating = true
  restarting = true
  let safetyBackup
  let switched = false
  let rendererHealth
  try {
    startup.reset()
    await showStartup(`正在恢复 DSH ${targetVersion}…`)
    await stopBackend()
    instance = undefined
    safetyBackup = await backupCoreProfileMetadata(profile, pluginBackups, dshHome)
    await writeJson(join(desktopLink, 'model-operation.json'), { kind:'recovery' })
    switchCoreRuntime(desktopLink, target.previous, target.active, safetyBackup, target.backup)
    switched = true
    await restoreCoreProfileMetadata(profile, pluginBackups, target.backup, dshHome)
    rendererHealth = observeRendererHealth(window.webContents)
    await connect(false, { allowPluginQuarantine: false })
    const running = JSON.parse(readFileSync(runtimeFile, 'utf8'))
    if (!ownsInstance() || readDshVersion(running.cli) !== targetVersion)
      throw new Error(`共享服务未能使用 DSH ${targetVersion} 启动。`)
    await rendererHealth.verify(new URL(instance.url).origin)
    finishCoreRuntime(desktopLink)
    startup.line('system', `已恢复 DSH ${targetVersion} 和对应配置。`)
    log(`Manual DSH core recovery succeeded: ${targetVersion}; backup=${target.backup}`)
    return true
  } catch (error) {
    rendererHealth?.dispose()
    if (switched && safetyBackup && !quitAllowed) {
      let rollbackError
      try {
        await stopBackend()
        rollbackCoreRuntime(desktopLink, target.backup)
        await restoreCoreProfileMetadata(profile, pluginBackups, safetyBackup, dshHome)
        instance = undefined
        await connect(false, { allowPluginQuarantine: false })
      } catch (failure) { rollbackError = failure }
      const failure = rollbackError
        ? new Error(`恢复 DSH ${targetVersion} 失败，重新接回原核心版本也未完成：${String(rollbackError)}`, { cause: error })
        : new Error(`恢复 DSH ${targetVersion} 未成功；已还原原核心版本。请查看启动日志，或再次尝试恢复。`, { cause: error })
      showFailure(failure)
      throw failure
    }
    showFailure(error)
    throw error
  } finally {
    rendererHealth?.dispose()
    try { await writeJson(join(desktopLink, 'model-operation.json'), { kind:'idle' }) }
    catch (error) { log(`Could not finish the recovery record: ${String(error)}`) }
    coreUpdating = false
    restarting = false
    applyRequestedUpdates()
  }
}

async function updateCoreRuntime(target) {
  if (coreUpdateOperation) return coreUpdateOperation
  coreUpdateOperation = doUpdateCoreRuntime(target).finally(() => { coreUpdateOperation = undefined })
  return coreUpdateOperation
}

async function doUpdateCoreRuntime(target) {
  if (quitAllowed || coreUpdating || restarting || connecting || installer || maintenance?.operation) return
  if (!ownsInstance()) throw new Error('当前共享服务由外部 Web 命令启动。请先从该入口停止服务，再由 DSH App 启动后执行一键更新。')
  if (pendingPluginUpdate || hasPendingPluginOperations(profile) || pluginUpdateRecovery(profile, pluginBackups)) {
    throw new Error('有待完成或待恢复的插件更新。请先处理插件更新，再升级 DSH 核心。')
  }
  const previous = cliRuntime()
  if (readDshVersion(previous.cli) !== target.currentVersion) throw new Error('当前 DSH 版本已变化，请等待重新检查更新。')
  coreUpdating = true
  upgradeAbort = new AbortController()
  restarting = true
  publishCoreUpdate({ phase: 'checking', currentVersion: target.currentVersion })
  let switched = false
  let stopped = false
  let backup
  let rendererHealth
  try {
    const before = await captureCapabilities(instance, { signal: upgradeAbort.signal })
    const configBefore = await readModelConfiguration(dshHome, profile)
    const revisionBefore = await configurationRevision({ home:dshHome, profile })
    startup.reset()
    await showStartup(`正在安装 DSH ${target.version}…`)
    startup.line('system', `正在使用 pnpm 从官方 npm 安装 DSH ${target.version} 到独立目录…`)
    const active = await installCoreRuntime({
      directory: desktopLink, version: target.version, node: previous.node, cwd: previous.cwd,
      onOutput: (stream, chunk) => startup.append(stream, chunk),
      onSpawn: child => { installer = child },
      onExit: child => { if (installer === child) installer = undefined },
    })
    if (quitAllowed) return
    startup.status('loading', '正在检查已启用插件与新版 DSH 的兼容性…')
    await checkCoreCompatibility({ node: active.node, cli: active.cli, profile, version: target.version })
    startup.status('loading', '正在独立验证新建对话、模式切换、模型和归档…')
    const functional = await runFunctionalCheck({ home:dshHome, profile, directory:desktopLink, runtime:active, expected:before,
      runner:asset('backend-runner.mjs'),
      signal:upgradeAbort.signal, onProgress:value => startup.line('system', `${value.kind}: ${value.subject} · ${value.status}`) })
    if (functional.status !== 'passed') throw new Error(`新版 DSH 功能检查未通过：${functional.message}`)
    if (await configurationRevision({ home:dshHome, profile }) !== revisionBefore) throw new Error('检查期间共享配置已变化，请重新执行更新。')
    if (pendingPluginUpdate || hasPendingPluginOperations(profile) || pluginUpdateRecovery(profile, pluginBackups)) {
      throw new Error('安装期间出现插件更新请求；本次核心切换已取消，请先完成插件更新。')
    }
    await stopBackend()
    stopped = true
    instance = undefined
    if (await configurationRevision({ home:dshHome, profile }) !== revisionBefore) throw new Error('停止服务时共享配置已变化，请重新执行更新。')
    backup = await backupCoreProfileMetadata(profile, pluginBackups, dshHome)
    await writeJson(join(desktopLink, 'model-operation.json'), { kind:'upgrade' })
    startup.line('system', `已备份插件配置元数据：${backup}`)
    if (quitAllowed) return
    switchCoreRuntime(desktopLink, active, previous, backup)
    switched = true
    startup.status('loading', `DSH ${target.version} 已安装，正在重启共享服务…`)
    if (quitAllowed) return
    rendererHealth = observeRendererHealth(window.webContents)
    await connect(false, { allowPluginQuarantine: false })
    const running = JSON.parse(readFileSync(runtimeFile, 'utf8'))
    if (!ownsInstance() || readDshVersion(running.cli) !== target.version) {
      throw new Error('新版共享服务未使用目标 DSH 版本，请检查 DSH_APP_CLI 覆盖配置。')
    }
    await rendererHealth.verify(new URL(instance.url).origin)
    compareCapabilities(before, await captureCapabilities(instance, { signal:upgradeAbort.signal }))
    compareModelConfiguration(configBefore, await readModelConfiguration(dshHome, profile))
    if (quitAllowed) return
    finishCoreRuntime(desktopLink)
    publishCoreUpdate({ phase: 'idle', currentVersion: target.version })
    log(`DSH core updated: ${target.currentVersion} -> ${target.version}; backup=${backup}`)
  } catch (error) {
    rendererHealth?.dispose()
    log(`DSH core update failed: ${String(error)}`)
    if (quitAllowed) {
      log(`DSH app is quitting; ${switched ? 'pending core update will roll back on next startup' : 'core installation left inactive'}`)
      return
    }
    if (switched) {
      startup.line('error', `DSH ${target.version} 启动失败：${String(error)}`)
      try {
        await stopBackend()
        rollbackCoreRuntime(desktopLink, null)
        await writeJson(join(desktopLink, 'model-operation.json'), { kind:'recovery' })
        await restoreCoreProfileMetadata(profile, pluginBackups, backup, dshHome)
        instance = undefined
        startup.status('loading', '正在恢复更新前的 DSH…')
        await connect(false, { allowPluginQuarantine: false })
        log(`DSH core rollback succeeded: ${target.currentVersion}`)
        await dialog.showMessageBox(window, { type: 'warning', title: 'DSH 更新未完成',
          message: `新版本启动失败，已恢复 DSH ${target.currentVersion}。`, detail: redact(String(error)), buttons: ['确定'] })
      } catch (rollbackError) {
        showFailure(new Error(`DSH 更新失败，恢复旧版本也失败：${String(rollbackError)}`, { cause: error }))
      }
    } else {
      if (stopped && !quitAllowed) await connect(false, { allowPluginQuarantine: false })
      if (!stopped && instance && window && !window.isDestroyed()) await window.loadURL(instance.url)
      await dialog.showMessageBox(window, { type: 'error', title: 'DSH 更新未完成',
        message: '新版本安装或校验失败，现有 DSH 未被替换。', detail: redact(String(error)), buttons: ['确定'] })
    }
  } finally {
    rendererHealth?.dispose()
    coreUpdating = false
    upgradeAbort = undefined
    await writeJson(join(desktopLink, 'model-operation.json'), { kind:'idle' })
    restarting = false
    applyRequestedUpdates()
    if (!quitAllowed) void checkForCoreUpdate()
  }
}

async function main() {
  Menu.setApplicationMenu(null)
  const palette = applyStartupTheme(nativeTheme, profile, undefined, WINDOW_CONTROLS_HEIGHT)
  window = new BrowserWindow({
    title: 'DSH', width: 1440, height: 920, minWidth: 880, minHeight: 600,
    show: !process.argv.includes('--open-web'),
    icon: asset('DSH.ico'), backgroundColor: palette.background,
    titleBarStyle: 'hidden', titleBarOverlay: { color: palette.caption, symbolColor: palette.foreground, height: WINDOW_CONTROLS_HEIGHT },
    webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  })
  const refreshStartupTheme = () => {
    if (window && !window.isDestroyed() && window.webContents.getURL() === startupUrl) applyStartupTheme(nativeTheme, profile, window, WINDOW_CONTROLS_HEIGHT)
  }
  nativeTheme.on('updated', refreshStartupTheme)
  app.once('will-quit', () => nativeTheme.off('updated', refreshStartupTheme))
  const requireStartupFrame = event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== startupUrl) throw new Error('当前页面不能请求此操作。')
  }
  maintenance = new MaintenanceController({ home:dshHome, profile, directory:desktopLink, runtime:cliRuntime, instance:() => instance,
    recoveryState:availableRecoveryActions,
    recoverPluginUpdate:() => restart(true, { fromMaintenance:true }),
    recoverCore:() => recoverPreviousCore({ fromMaintenance:true }),
    runner:asset('backend-runner.mjs'),
    canChange:kind => {
      const rollback = kind === 'plugin-update'
      const updateRecovery = pluginUpdateRecovery(profile, pluginBackups)
      if (quitAllowed || coreUpdating || restarting || connecting || installer
        || !rollback && (hasPendingPluginOperations(profile) || updateRecovery)) throw new Error('请先完成当前启动或更新操作。')
      if (rollback && !updateRecovery) throw new Error('没有可恢复的插件更新备份。')
      if (kind === 'core' && !coreRollbackTarget(desktopLink)) throw new Error('没有可用的上一个 DSH 版本及其配置备份。')
      if (['plugin', 'plugin-update', 'core'].includes(kind) && instance && !ownsInstance())
        throw new Error('当前服务由外部命令启动，请从原入口停止后重试。')
    },
    progress:value => diagnostics?.progress(value),
    onIdle:applyRequestedUpdates,
    recover:async change => {
      restarting = true
      try {
        startup.reset()
        await showStartup('正在应用插件恢复操作…')
        await stopBackend()
        instance = undefined
        const result = await change()
        await connect()
        return result
      } catch (error) {
        if (!instance && !quitAllowed) await connect()
        throw error
      } finally { restarting = false }
    },
  })
  diagnostics = maintenanceWindow({ parent:window, read:() => maintenance.read(), action:request => maintenance.action(request) })
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
  ipcMain.handle('dsh:recover-core', event => {
    requireStartupFrame(event)
    return recoverPreviousCore()
  })
  ipcMain.handle('dsh:show-diagnostics', event => {
    requireStartupFrame(event)
    return diagnostics.show()
  })
  ipcMain.handle('dsh:startup-state', event => {
    requireStartupFrame(event)
    return startup.snapshot()
  })
  ipcMain.handle('dsh:copy-startup-log', event => {
    requireStartupFrame(event)
    clipboard.writeText(startup.text())
  })
  ipcMain.handle('dsh:core-update-state', event => {
    requireDesktopFrame(event)
    return coreUpdateState
  })
  ipcMain.handle('dsh:core-update-action', async event => {
    requireDesktopFrame(event)
    const state = coreUpdateState
    if (state.phase !== 'available') return
    const candidate = state.channel === 'next' ? '候选版（next）' : 'latest 通道'
    if (!ownsInstance()) {
      const external = await dialog.showMessageBox(window, {
        type: 'info', title: 'DSH 更新', message: `发现 DSH ${state.version} ${candidate}（当前 Web 服务由外部命令启动）`,
        detail: '请从原入口停止 Web 服务，再由 DSH App 启动共享服务以使用一键更新。',
        buttons: ['查看发布页', '稍后'], defaultId: 0, cancelId: 1,
      })
      if (external.response === 0) await shell.openExternal(releaseUrl(state.version))
      return
    }
    const result = await dialog.showMessageBox(window, {
      type: 'info', title: 'DSH 更新',
      message: `发现 DSH ${state.version} ${candidate}（当前 ${state.currentVersion}）`,
      detail: '一键更新会将官方 npm 版本安装到 DSH App 的独立目录，备份插件配置元数据，并在后端启动失败时恢复原来的 DSH。',
      buttons: ['安装并重启', '查看发布页', '稍后'], defaultId: 0, cancelId: 2,
    })
    if (result.response === 0) {
      try { await updateCoreRuntime(state) }
      catch (error) { await dialog.showMessageBox(window, { type: 'warning', title: '暂不能一键更新', message: redact(String(error)), buttons: ['确定'] }) }
    } else if (result.response === 1) await shell.openExternal(releaseUrl(state.version))
  })
  ipcMain.on('dsh:desktop-theme', (event, state) => {
    try { requireDesktopFrame(event) } catch { return }
    const scheme = typeof state === 'string' ? state : state?.scheme
    const source = typeof state === 'string' ? undefined : state?.source
    if (!['light', 'dark'].includes(scheme) || source !== undefined && !['system', 'light', 'dark'].includes(source)) return
    applyStartupTheme(nativeTheme, profile, window, WINDOW_CONTROLS_HEIGHT, scheme, source)
  })
  ipcMain.handle('dsh:desktop-action', async (event, action) => {
    requireDesktopFrame(event)
    if (typeof action !== 'string') throw new Error('桌面操作无效。')
    if (action === 'web') return openWeb()
    if (action === 'diagnostics') return diagnostics.show()
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
    { label: '诊断与恢复', click: () => void diagnostics.show() },
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
    if (isFatalRendererMessage(message) && isCurrentDesktopPage()) {
      if (connecting && !coreUpdating) pendingRendererFailure = message
      else reportRendererFailure(`DSH 前端发生启动错误：${message}`)
    }
  })
  window.webContents.on('did-finish-load', () => {
    log(`Page loaded; title=${window.webContents.getTitle()}; visible=${window.isVisible()}; minimized=${window.isMinimized()}; menuBarVisible=${window.isMenuBarVisible()}`)
    if (isCurrentDesktopPage()) {
      rendererFailureHandled = false
      scheduleRendererProbe()
    } else clearTimeout(rendererProbeTimer)
  })
  window.on('page-title-updated', (_event, title) => log(`Page title updated: ${title}`))
  window.webContents.on('render-process-gone', (_event, details) => {
    log(`Renderer stopped: ${details.reason} (${details.exitCode})`)
    if (isCurrentDesktopPage()) {
      if (connecting && !coreUpdating) pendingRendererFailure = `渲染进程退出（${details.reason}，${details.exitCode}）。`
      else reportRendererFailure(`DSH 前端进程意外退出（${details.reason}，${details.exitCode}）。`)
    }
  })
  window.webContents.on('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
    log(`Load failed: ${code} ${description} (${failedUrl})`)
    if (code === -3 || !isMainFrame || !instance) return
    try {
      if (new URL(failedUrl).origin !== instance.origin) return
    } catch { return }
    const message = `DSH 前端加载失败（${code} ${description}）。`
    if (connecting && !coreUpdating) pendingRendererFailure = message
    else reportRendererFailure(message)
  })
  window.on('unresponsive', () => {
    log('DSH window stopped responding')
    reportRendererFailure('DSH 前端无响应。')
  })
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
  const pendingCore = readActiveCore(desktopLink)
  if (pendingCore?.phase === 'pending') {
    rollbackCoreRuntime(desktopLink, pendingCore.recoveryBackup ?? null)
    await restoreCoreProfileMetadata(profile, pluginBackups, pendingCore.backup, dshHome)
    log('Recovered interrupted DSH core update and profile metadata before startup')
  }
  await showStartup()
  await connect()
  coreUpdateInitialTimer = setTimeout(() => { void checkForCoreUpdate() }, 10000)
  coreUpdateTimer = setInterval(() => { void checkForCoreUpdate() }, 6 * 60 * 60 * 1000)
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
    upgradeAbort?.abort(new Error('Application is closing'))
    instanceWatcher?.close()
    clearTimeout(followTimer)
    clearInterval(healthTimer)
    clearTimeout(startupTimer)
    clearTimeout(rendererProbeTimer)
    clearTimeout(coreUpdateInitialTimer)
    clearInterval(coreUpdateTimer)
    pendingPluginUpdate = undefined
    if (!ownsInstance() && !installer && !maintenance?.operation && !coreUpdateOperation) return
    event.preventDefault()
    void (async () => {
      await maintenance?.dispose()
      await stopInstaller()
      await coreUpdateOperation?.catch(error => log(`Update stopped during exit: ${String(error)}`))
      diagnostics?.dispose()
      await stopBackend()
    })()
      .catch(error => log(`Service shutdown failed: ${String(error)}`)).finally(() => app.quit())
  })
  if (process.argv.includes('--quit')) app.quit()
  else void app.whenReady().then(main).catch(showFailure)
}
