import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STATE_FILE = 'plugin-quarantine.json'
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const LOADER_ENTRY = /failed to apply loader entry [^()\r\n]+ \(([^()\r\n]+)\):/g

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }

function readState(desktopLink) {
  let state
  try { state = readJson(join(desktopLink, STATE_FILE)) }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, plugins: [] }; throw error }
  if (state?.schemaVersion !== 1 || !Array.isArray(state.plugins)
    || state.plugins.some(item => !PACKAGE_NAME.test(item?.packageName) || typeof item.version !== 'string')) {
    throw new Error('插件隔离记录格式无效。')
  }
  return state
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n')
  renameSync(temporary, path)
}

function installedVersion(profile, packageName) {
  let manifest
  try { manifest = readJson(join(profile, 'node_modules', packageName, 'package.json')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  return manifest.name === packageName && typeof manifest.version === 'string' ? manifest.version : undefined
}

/** Keep a failed plugin disabled until its installed version changes. The dependency and data stay in place. */
export function enforcePluginQuarantine(profile, desktopLink) {
  const state = readState(desktopLink)
  if (state.plugins.length === 0) return []
  const manifest = readJson(join(profile, 'package.json'))
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) throw new Error('插件启用配置格式无效。')
  const retained = state.plugins.filter(item => installedVersion(profile, item.packageName) === item.version
    && Object.hasOwn(manifest.dependencies ?? {}, item.packageName))
  const blocked = new Set(retained.map(item => item.packageName))
  const filtered = bundles.filter(name => !blocked.has(name))
  if (retained.length !== state.plugins.length) writeJsonAtomic(join(desktopLink, STATE_FILE), { ...state, plugins: retained })
  if (filtered.length !== bundles.length) {
    manifest.dsh.profile.bundles = filtered
    writeJsonAtomic(join(profile, 'package.json'), manifest)
  }
  return retained
}

/** Only a loader error naming an active, installed, non-core bundle may change the profile. */
export function quarantineFailedPluginActivation(profile, desktopLink, backupRoot, transcript) {
  const diagnostic = String(transcript).split(/\r?\n/).filter(line => line.includes('Error: dsh: plugin tree failed to load:')
    || line.includes('Error: Error: failed to apply loader entry')).at(-1)
  if (!diagnostic) return
  const matches = [...diagnostic.matchAll(LOADER_ENTRY)]
  const packageName = matches.at(-1)?.[1]
  if (!packageName || !PACKAGE_NAME.test(packageName) || packageName === 'dsh-app' || packageName.startsWith('@deepseek-ai/')) return
  const manifest = readJson(join(profile, 'package.json'))
  const bundles = manifest.dsh?.profile?.bundles
  if (!Object.hasOwn(manifest.dependencies ?? {}, packageName) || !Array.isArray(bundles) || !bundles.includes(packageName)) return
  const version = installedVersion(profile, packageName)
  if (!version) return

  mkdirSync(backupRoot, { recursive: true })
  const backup = mkdtempSync(join(backupRoot, 'plugin-activation-'))
  copyFileSync(join(profile, 'package.json'), join(backup, 'package.json'))
  writeFileSync(join(backup, 'startup-error.log'), String(transcript).slice(-128 * 1024) + '\n')
  mkdirSync(desktopLink, { recursive: true })
  const state = readState(desktopLink)
  state.plugins = [...state.plugins.filter(item => item.packageName !== packageName), { packageName, version, backup }]
  writeJsonAtomic(join(desktopLink, STATE_FILE), state)
  manifest.dsh.profile.bundles = bundles.filter(name => name !== packageName)
  writeJsonAtomic(join(profile, 'package.json'), manifest)
  return { packageName, version, backup }
}
