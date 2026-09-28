/** Exercise public DSH APIs in a disposable Harness home without sending model requests. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, symlink, cp, lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { readJson, writeJson } from './files.mjs'
import { removeProbeTree } from './configuration-snapshot.mjs'
import { redact } from '../desktop/startup-log.mjs'

/** Authenticate only to a recorded loopback Host and unwrap its typed RPC result. */
export async function createRpc(instance, { timeout = 20000, signal } = {}) {
  const url = new URL(instance.url)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.origin !== instance.origin ||
    url.username ||
    url.password
  )
    throw new Error('Invalid local Host address')
  const requestSignal = () =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
  const login = await fetch(url, { redirect: 'manual', signal: requestSignal() })
  if (!(login.ok || login.status === 302 || login.status === 303))
    throw new Error(`Host authentication failed: HTTP ${login.status}`)
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return async (method, args = {}) => {
    const rpcId = randomUUID()
    const response = await fetch(`${url.origin}/api/${method}`, {
      method: 'POST',
      signal: requestSignal(),
      headers: { cookie, origin: url.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } })
    })
    const message = await response.json()
    if (!response.ok || message.rpcId !== rpcId || message.result?.ok !== true)
      throw new Error(
        `${method}: ${redact(JSON.stringify(message.result?.error || { status: response.status }))}`
      )
    return message.result.value
  }
}

/** Capture the route and preset identities that an upgrade must preserve. */
export async function captureCapabilities(instance, options) {
  const rpc = await createRpc(instance, options)
  const [catalog, presetResult] = await Promise.all([rpc('session/modelCatalog'), rpc('agentPresets/list')])
  if (!Array.isArray(catalog?.groups) || !Array.isArray(presetResult?.presets))
    throw new Error('Unsupported DSH model or preset response')
  return {
    models: catalog.groups.flatMap((group) =>
      group.models.map((model) => ({ provider: group.id, model: model.id }))
    ),
    default: catalog.default,
    failures: (catalog.failures || []).map((item) => ({ id: item.id, message: redact(item.message) })),
    presets: presetResult.presets.map((preset) => preset.id).sort()
  }
}

/** Fail an upgrade when a previously available route, default, or preset disappears. */
export function compareCapabilities(before, after) {
  const models = new Set(after.models.map((row) => `${row.provider}\0${row.model}`))
  const missingModels = before.models.filter((row) => !models.has(`${row.provider}\0${row.model}`))
  const missingPresets = before.presets.filter((id) => !after.presets.includes(id))
  if (missingModels.length || missingPresets.length)
    throw new Error(`Capability loss: ${JSON.stringify({ missingModels, missingPresets })}`)
  if (JSON.stringify(before.default) !== JSON.stringify(after.default))
    throw new Error(
      `Default model changed: ${JSON.stringify({ before: before.default, after: after.default })}`
    )
  const previousFailures = new Set((before.failures || []).map((row) => row.id))
  if ((after.failures || []).some((row) => !previousFailures.has(row.id)))
    throw new Error('A model provider failed after the update')
}

/** Execute blank conversation creation, preset recomposition, model selection, and archival. */
export async function exerciseCapabilities(rpc, capabilities, cwd, onProgress = () => {}) {
  const checks = []
  const check = async (kind, subject, operation) => {
    const started = Date.now()
    onProgress({ kind, subject, status: 'running' })
    try {
      await operation()
      const result = { kind, subject, status: 'passed', durationMs: Date.now() - started }
      checks.push(result)
      onProgress(result)
    } catch (error) {
      checks.push({
        kind,
        subject,
        status: 'failed',
        durationMs: Date.now() - started,
        message: redact(String(error))
      })
      const failure = new Error(`${kind} (${subject}): ${redact(String(error))}`, { cause: error })
      failure.checks = checks
      throw failure
    }
  }
  if (!capabilities.presets.length) throw new Error('No registered agent preset is available')
  if (!capabilities.models.length) throw new Error('No selectable model is available')
  for (const preset of capabilities.presets) {
    const sessionId = `dsh-app-check-${randomUUID()}`
    await check('conversation', preset, async () => {
      const value = await rpc('session/create', { request: { sessionId, cwd, agentPreset: preset } })
      if (value.sessionId !== sessionId || value.agentPreset !== preset)
        throw new Error('Created conversation differs from the requested preset')
    })
    for (const target of new Set([capabilities.presets[0], preset])) {
      await check('preset', target, async () => {
        const selected = await rpc('agentPresets/select', { agentId: sessionId, agentPreset: target })
        if (selected !== target) throw new Error('Preset selection was not retained')
      })
    }
    if (preset === capabilities.presets[0]) {
      for (const model of capabilities.models)
        await check('model', `${model.provider}/${model.model}`, async () => {
          const result = await rpc('session/selectModel', { request: { sessionId, ...model } })
          if (result.selected?.provider !== model.provider || result.selected?.model !== model.model)
            throw new Error('Model identity was rewritten')
        })
    }
    await check('archive', preset, async () => {
      const result = await rpc('workspace/archiveSession', { request: { sessionId } })
      if (!result.archivedSessionIds?.includes(sessionId)) throw new Error('Conversation was not archived')
    })
  }
  return checks
}

/** Package-level links let DSH apply the candidate core's resolution to external plugin roots. */
export async function linkProfilePackages(source, target) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('@')) {
      await mkdir(join(target, entry.name))
      for (const child of await readdir(join(source, entry.name), { withFileTypes: true })) {
        if (!child.isDirectory() && !child.isSymbolicLink()) continue
        await symlink(
          join(source, entry.name, child.name),
          join(target, entry.name, child.name),
          process.platform === 'win32' ? 'junction' : 'dir'
        )
      }
    } else
      await symlink(
        join(source, entry.name),
        join(target, entry.name),
        process.platform === 'win32' ? 'junction' : 'dir'
      )
  }
}

/** Copy configuration and custom presets, keeping real session storage out of the probe. */
async function prepareHome(home, profile, temporary) {
  const target = join(temporary, 'profiles', 'web')
  await mkdir(target, { recursive: true })
  for (const name of ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml', 'cordis.yml']) {
    try {
      await copyFile(join(profile, name), join(target, name))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  for (const name of ['settings.yaml', 'settings.yaml.imported', '.credentials.yaml']) {
    try {
      await copyFile(join(home, name), join(temporary, name))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  try {
    const presets = join(home, '.agent-presets')
    await lstat(presets)
    await cp(presets, join(temporary, '.agent-presets'), { recursive: true, dereference: false })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await linkProfilePackages(join(profile, 'node_modules'), join(target, 'node_modules'))
  await mkdir(join(temporary, 'workspace'))
}

async function stopChild(child, exited) {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exited
    return
  }
  if (child.connected)
    child.send({ type: 'shutdown' }, (error) => {
      if (error) child.kill()
    })
  else child.kill()
  let timer
  try {
    await Promise.race([
      exited,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 8000)
      })
    ])
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore'
        })
        await new Promise((resolve) => {
          killer.once('error', resolve)
          killer.once('close', resolve)
        })
      } else child.kill('SIGKILL')
      await exited
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Run one bounded check, stop its child before cleanup, and retain only sanitized results. */
export async function runFunctionalCheck({
  home,
  profile,
  directory,
  runtime,
  expected,
  timeout = 120000,
  onProgress,
  signal,
  runner = fileURLToPath(new URL('../desktop/backend-runner.mjs', import.meta.url))
}) {
  const root = join(directory, 'checks')
  await mkdir(root, { recursive: true })
  const temporary = await mkdtemp(join(root, 'probe-'))
  const report = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    status: 'running',
    checks: [],
    modelRequests: 0
  }
  const deadline = AbortSignal.timeout(timeout)
  const cancelled = signal ? AbortSignal.any([deadline, signal]) : deadline
  let child, exited
  let output = ''
  try {
    await prepareHome(home, profile, temporary)
    cancelled.throwIfAborted()
    const env = { ...process.env, DSH_HOME: temporary, DSH_APP_PROBE: '1' }
    for (const key of [
      'NODE_OPTIONS',
      'ELECTRON_RUN_AS_NODE',
      'DSH_APP_OWNER',
      'DSH_LOCAL_DESKTOP_OWNER',
      'DSH_APP_CLI',
      'DSH_APP_NODE'
    ])
      delete env[key]
    onProgress?.({ kind: 'startup', subject: 'DSH', status: 'running' })
    child = spawn(runtime.node, [...(runtime.execArgv || []), '--use-system-ca', runner, runtime.cli, '0'], {
      env,
      cwd: runtime.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })
    let spawnError
    exited = new Promise((resolve) => {
      child.once('close', resolve)
      child.once('error', (error) => {
        spawnError = error
        resolve()
      })
    })
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        output = (output + chunk.toString()).slice(-128 * 1024)
      })
    let instance
    while (!instance) {
      cancelled.throwIfAborted()
      if (spawnError) throw spawnError
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Probe Host stopped: ${redact(output.slice(-5000))}`)
      for (const name of ['dsh-app', 'desktop-link']) {
        const record = await readJson(join(temporary, name, 'web.json'), null)
        if (record?.pid === child.pid) {
          instance = record
          break
        }
      }
      if (!instance) await delay(150, undefined, { signal: cancelled })
    }
    const capabilities = await captureCapabilities(instance, { signal: cancelled })
    if (expected) compareCapabilities(expected, capabilities)
    report.capabilities = capabilities
    report.checks = await exerciseCapabilities(
      await createRpc(instance, { signal: cancelled }),
      capabilities,
      join(temporary, 'workspace'),
      onProgress
    )
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.message = redact(String(error))
    report.checks = error.checks || report.checks
    report.startupLog = redact(output)
  } finally {
    if (child?.pid) await stopChild(child, exited)
    await removeProbeTree(root, temporary)
  }
  await writeJson(join(directory, 'functional-check.json'), report)
  return report
}
