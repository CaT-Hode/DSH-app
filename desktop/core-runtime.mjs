import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const PACKAGE = '@deepseek-ai/dsh'
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const STATE_FILE = 'active-core.json'
const PROFILE_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dsh-pending-updates.json', '.dsh-app-update.json']

function exactVersion(version) {
  if (typeof version !== 'string' || !VERSION.test(version)) throw new Error('DSH 更新版本无效。')
  return version
}

function assertOwnedChild(root, target) {
  const base = realpathSync(root)
  const path = existsSync(target) ? realpathSync(target) : join(realpathSync(dirname(target)), target.split(/[\\/]/).at(-1))
  const segment = relative(base, path)
  if (!segment || segment === '..' || segment.startsWith('..\\') || segment.startsWith('../') || isAbsolute(segment)) {
    throw new Error('DSH 核心安装目录超出了应用管理范围。')
  }
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(temporary, path)
}

function validRuntime(runtime) {
  return runtime && typeof runtime.cli === 'string' && isAbsolute(runtime.cli)
    && typeof runtime.node === 'string' && isAbsolute(runtime.node)
    && typeof runtime.cwd === 'string' && isAbsolute(runtime.cwd)
    && Array.isArray(runtime.execArgv) && runtime.execArgv.every(value => typeof value === 'string')
}

export function readActiveCore(directory) {
  let state
  try { state = JSON.parse(readFileSync(join(directory, STATE_FILE), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  if (state?.schemaVersion !== 1 || !['pending', 'ready'].includes(state.phase)
    || !validRuntime(state.active) || !validRuntime(state.previous)
    || typeof state.backup !== 'string' || (state.phase === 'pending' && !existsSync(state.backup))) {
    throw new Error('DSH 核心更新记录格式无效。')
  }
  if (state.phase === 'pending') assertOwnedChild(join(directory, 'backups'), state.backup)
  const managedRoot = join(directory, 'core-runtimes')
  const candidates = [state.active.cli, state.previous.cli]
  if (!candidates.some(cli => {
    try { assertOwnedChild(managedRoot, cli); return true } catch { return false }
  })) throw new Error('DSH 核心更新记录没有有效的独立安装路径。')
  return state
}

export function switchCoreRuntime(directory, active, previous, backup) {
  if (!validRuntime(active) || !validRuntime(previous)) throw new Error('DSH 核心运行时路径无效。')
  const state = { schemaVersion: 1, phase: 'pending', active, previous, backup }
  writeAtomic(join(directory, STATE_FILE), state)
  return state
}

export function finishCoreRuntime(directory) {
  const state = readActiveCore(directory)
  if (!state || state.phase !== 'pending') throw new Error('没有待完成的 DSH 核心更新。')
  writeAtomic(join(directory, STATE_FILE), { ...state, phase: 'ready' })
}

export function rollbackCoreRuntime(directory) {
  const state = readActiveCore(directory)
  if (!state || state.phase !== 'pending') return false
  writeAtomic(join(directory, STATE_FILE), {
    ...state, phase: 'ready', active: state.previous, previous: state.active,
  })
  return true
}

export function backupCoreProfileMetadata(profile, backupRoot) {
  mkdirSync(backupRoot, { recursive: true })
  const folder = mkdtempSync(join(backupRoot, 'core-update-'))
  const present = []
  for (const filename of PROFILE_FILES) {
    try { copyFileSync(join(profile, filename), join(folder, filename)) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (existsSync(join(folder, filename))) present.push(filename)
  }
  writeFileSync(join(folder, 'snapshot.json'), JSON.stringify({ schemaVersion: 1, present }, null, 2) + '\n')
  return folder
}

export function restoreCoreProfileMetadata(profile, backupRoot, folder) {
  if (typeof folder !== 'string' || !existsSync(folder)) throw new Error('DSH 核心更新备份不存在。')
  assertOwnedChild(backupRoot, folder)
  const snapshot = JSON.parse(readFileSync(join(folder, 'snapshot.json'), 'utf8'))
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.present)
    || snapshot.present.some(filename => !PROFILE_FILES.includes(filename))) throw new Error('DSH 核心更新备份格式无效。')
  for (const filename of PROFILE_FILES) {
    const target = join(profile, filename)
    if (snapshot.present.includes(filename)) copyFileSync(join(folder, filename), target)
    else rmSync(target, { force: true })
  }
}

export function findPnpmCli(node, cwd, override = process.env.DSH_APP_PNPM_CLI) {
  const candidates = [override,
    resolve(dirname(node), '..', 'pnpm', 'bin', 'pnpm.cjs'),
    join(cwd, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')]
  const pnpmCli = candidates.find(path => path && existsSync(path))
  if (!pnpmCli) throw new Error('找不到 pnpm CLI。请安装 pnpm 11，或设置 DSH_APP_PNPM_CLI。')
  return pnpmCli
}

async function run(node, args, { cwd, timeout, onOutput, onSpawn, onExit, env }, spawnChild = spawn) {
  const child = spawnChild(node, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  onSpawn?.(child)
  let output = ''
  let stdout = ''
  for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
    stream.setEncoding('utf8')
    stream.on('data', chunk => {
      output = (output + chunk).slice(-8192)
      if (name === 'stdout') stdout = (stdout + chunk).slice(-8192)
      onOutput?.(name, chunk)
    })
  }
  try {
    await new Promise((resolveDone, reject) => {
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        if (process.platform === 'win32' && child.pid) {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.once('error', () => child.kill())
        } else child.kill()
      }, timeout)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        if (timedOut) reject(new Error(`命令执行超时（${Math.ceil(timeout / 1000)} 秒）。`))
        else if (code === 0) resolveDone()
        else reject(new Error(`命令退出（${code}，信号 ${signal ?? '无'}）。${output.slice(-1200)}`))
      })
    })
    return stdout
  } finally { onExit?.(child) }
}

function verifyInstalledPackage(folder, version) {
  const root = join(folder, 'node_modules', '@deepseek-ai', 'dsh')
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (manifest.name !== PACKAGE || manifest.version !== version || manifest.bin?.dsh !== 'lib/bin.js') {
    throw new Error('已安装的 DSH 包名、版本或命令入口与请求不符。')
  }
  const cli = join(root, 'lib', 'bin.js')
  if (!existsSync(cli)) throw new Error('已安装的 DSH 缺少命令入口。')
  return cli
}

/** Install the exact official package beside the old CLI, leaving the shared profile untouched. */
export async function installCoreRuntime({ directory, version, node, cwd = dirname(node), pnpmCli = findPnpmCli(node, cwd), onOutput, onSpawn, onExit, spawnChild = spawn }) {
  exactVersion(version)
  const root = join(directory, 'core-runtimes')
  mkdirSync(root, { recursive: true })
  const final = join(root, version)
  const env = { ...process.env, PATH: `${dirname(node)};${process.env.PATH || ''}`, NODE_USE_SYSTEM_CA: '1' }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  delete env.DSH_APP_OWNER
  const pnpmVersion = await run(node, ['--use-system-ca', pnpmCli, '--version'],
    { cwd: root, timeout: 15000, onSpawn, onExit, env }, spawnChild)
  if (!/^11\.\d+\.\d+\s*$/.test(pnpmVersion)) throw new Error(`需要 pnpm 11，当前为 ${pnpmVersion.trim().slice(0, 40)}。`)
  assertOwnedChild(root, final)
  const install = async () => {
    mkdirSync(final, { recursive: true })
    writeFileSync(join(final, 'package.json'), JSON.stringify({ private: true, dependencies: { [PACKAGE]: version } }, null, 2) + '\n')
    writeFileSync(join(final, 'pnpm-workspace.yaml'), `allowBuilds:\n  '@deepseek-ai/dsh-subprocess-local': true\n  '@google/genai': false\n  koffi: true\n  node-pty: true\n  protobufjs: false\n`)
    await run(node, ['--use-system-ca', pnpmCli, 'install', '--config.registry=https://registry.npmjs.org/', '--config.minimum-release-age=0', '--config.optimistic-repeat-install=false'],
      { cwd: final, timeout: 600000, onOutput, onSpawn, onExit, env }, spawnChild)
  }
  let installed = false
  try { verifyInstalledPackage(final, version) }
  catch { await install(); installed = true }
  const check = async () => {
    const cli = verifyInstalledPackage(final, version)
    const output = await run(node, ['--use-system-ca', cli, '--version'],
      { cwd: final, timeout: 30000, onOutput, onSpawn, onExit, env }, spawnChild)
    if (output.trim() !== version) throw new Error(`DSH 命令版本校验失败：预期 ${version}，实际 ${output.trim().slice(0, 80)}。`)
    return { cli, node, cwd: final, execArgv: [] }
  }
  try { return await check() }
  catch (error) {
    if (installed) throw error
    await install()
    return check()
  }
}
