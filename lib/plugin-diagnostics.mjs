/** Package activation diagnostics and narrowly scoped, reversible recovery actions. */
import { mkdir, mkdtemp, copyFile, open } from 'node:fs/promises'
import { join } from 'node:path'
import { optionalText, readJson, writeJson, digest } from './files.mjs'
import { redact } from '../desktop/startup-log.mjs'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const mutable = (name) => PACKAGE_NAME.test(name) && name !== 'dsh-app' && !name.startsWith('@deepseek-ai/')

/** Read a bounded suffix of a local log without loading the full transcript. */
export async function logTail(path, bytes = 128 * 1024) {
  let file
  try {
    file = await open(path, 'r')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
  try {
    const size = (await file.stat()).size
    const buffer = Buffer.alloc(Math.min(size, bytes))
    await file.read(buffer, 0, buffer.length, Math.max(0, size - bytes))
    return redact(buffer.toString('utf8'))
  } finally {
    await file.close()
  }
}

/** Inventory installed, enabled, pending and quarantined packages without claiming their features work. */
export async function pluginDiagnostics(profile, directory) {
  const manifestText = await optionalText(join(profile, 'package.json'))
  if (manifestText === null) throw new Error('Web profile manifest is missing')
  const manifest = JSON.parse(manifestText)
  const quarantineText = await optionalText(join(directory, 'plugin-quarantine.json'))
  const quarantine = quarantineText === null ? { plugins: [] } : JSON.parse(quarantineText)
  if (!Array.isArray(quarantine.plugins)) throw new Error('Invalid plugin quarantine record')
  const bundles = manifest.dsh?.profile?.bundles || []
  if (!Array.isArray(bundles) || bundles.some((name) => typeof name !== 'string' || !PACKAGE_NAME.test(name)))
    throw new Error('Invalid profile activation list')
  const pending = await optionalText(join(profile, '.dsh-pending-updates.json'))
  const failure = await logTail(join(directory, 'last-startup-failure.log'))
  const recent = await logTail(join(directory, 'desktop.log'), 32 * 1024)
  const names = [...new Set([...Object.keys(manifest.dependencies || {}), ...bundles])].sort()
  const plugins = []
  for (const name of names) {
    if (!PACKAGE_NAME.test(name)) continue
    const installed = await readJson(join(profile, 'node_modules', name, 'package.json'), null)
    const blocked = quarantine.plugins.find((item) => item.packageName === name)
    const enabled = bundles.includes(name)
    const evidence = [...failure.split(/\r?\n/), ...recent.split(/\r?\n/)]
      .filter((line) => line.includes(name) && /error|failed|unavailable|crash/i.test(line))
      .slice(-3)
      .map((line) => line.slice(0, 1000))
    const status = blocked
      ? 'quarantined'
      : !installed && mutable(name)
        ? 'missing'
        : enabled
          ? 'enabled'
          : 'disabled'
    plugins.push({
      name,
      version: installed?.version ?? null,
      enabled,
      status,
      mutable: mutable(name) && !!installed?.dsh?.bundle,
      pending: !!pending?.includes(`"${name}"`),
      evidence,
      quarantine: blocked ? { version: blocked.version, backup: blocked.backup } : undefined
    })
  }
  return { revision: digest(manifestText + '\0' + (quarantineText || '')), plugins }
}

/** Change only one installed community bundle, rejecting stale UI state and preserving its dependency and data. */
export async function changePluginActivation({ profile, directory, name, action, revision }) {
  if (!mutable(name) || !['disable', 'retry'].includes(action))
    throw new Error('Unsupported plugin recovery action')
  const before = await pluginDiagnostics(profile, directory)
  if (before.revision !== revision) throw new Error('Plugin configuration changed; refresh before retrying')
  const plugin = before.plugins.find((row) => row.name === name)
  if (!plugin?.mutable) throw new Error('Plugin is not an installed community bundle')
  if (action === 'disable' && !plugin.enabled) throw new Error('Plugin is already disabled')
  if (action === 'retry' && plugin.enabled && !plugin.quarantine) throw new Error('Plugin is already enabled')
  const root = join(directory, 'backups')
  await mkdir(root, { recursive: true })
  const backup = await mkdtemp(join(root, 'plugin-recovery-'))
  await copyFile(join(profile, 'package.json'), join(backup, 'package.json'))
  const state = await readJson(join(directory, 'plugin-quarantine.json'), { schemaVersion: 1, plugins: [] })
  await writeJson(join(backup, 'plugin-quarantine.json'), state)
  const manifest = await readJson(join(profile, 'package.json'))
  const bundles = manifest.dsh.profile.bundles
  if (action === 'disable') {
    state.plugins = [
      ...state.plugins.filter((row) => row.packageName !== name),
      {
        packageName: name,
        version: plugin.version,
        backup,
        reason: 'user-disabled',
        index: bundles.indexOf(name)
      }
    ]
    manifest.dsh.profile.bundles = bundles.filter((bundle) => bundle !== name)
  } else {
    const position = state.plugins.find((row) => row.packageName === name)?.index
    state.plugins = state.plugins.filter((row) => row.packageName !== name)
    if (!bundles.includes(name))
      bundles.splice(
        Number.isInteger(position) ? Math.min(position, bundles.length) : bundles.length,
        0,
        name
      )
  }
  if ((await pluginDiagnostics(profile, directory)).revision !== revision)
    throw new Error('Plugin configuration changed during recovery; no changes applied')
  await writeJson(join(directory, 'plugin-quarantine.json'), state)
  await writeJson(join(profile, 'package.json'), manifest)
  return { name, action, backup }
}
