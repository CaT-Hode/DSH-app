import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

const PENDING_FILE = '.dsh-pending-updates.json'
const UPDATE_STATE = '.dsh-app-update.json'
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

/** Read the plugin-authored update queue, accepting only package names and exact versions. */
export function pendingPluginUpdates(profile) {
  let data
  try { data = JSON.parse(readFileSync(join(profile, PENDING_FILE), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  if (!Array.isArray(data?.packages)) throw new Error('插件待更新记录格式无效。')
  const targets = new Map()
  for (const item of data.packages) {
    if (typeof item?.packageName !== 'string' || !PACKAGE_NAME.test(item.packageName)
      || typeof item.version !== 'string' || !EXACT_VERSION.test(item.version)) {
      throw new Error('插件待更新记录包含无效包名或版本。')
    }
    if (item.packageName === '@deepseek-ai/dsh') {
      throw new Error('请单独升级 DSH 核心，再处理插件更新。')
    }
    targets.set(item.packageName, { packageName: item.packageName, version: item.version })
  }
  return [...targets.values()]
}

/** Require both the on-disk version and the active bundle entry, not just a declared dependency. */
export function pluginUpdateInstalled(profile, target) {
  let manifest
  try { manifest = JSON.parse(readFileSync(join(profile, 'node_modules', target.packageName, 'package.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
  if (manifest.name !== target.packageName || manifest.version !== target.version) return false
  const profileManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  if (profileManifest.dependencies?.[target.packageName] !== target.version) return false
  const bundles = profileManifest.dsh?.profile?.bundles
  const activated = Array.isArray(bundles) && bundles.includes(target.packageName)
  return manifest.dsh?.bundle?.patch !== undefined ? activated : !activated
}

/** Retain installation metadata before the package manager changes a stopped Web profile. */
export function backupPluginUpdate(profile, backupRoot) {
  mkdirSync(backupRoot, { recursive: true })
  const folder = mkdtempSync(join(backupRoot, 'plugin-update-'))
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', PENDING_FILE]) {
    try { copyFileSync(join(profile, file), join(folder, file)) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  const installed = Object.entries(manifest.dependencies ?? {}).map(([packageName, declaredVersion]) => {
    let version = null
    try { version = JSON.parse(readFileSync(join(profile, 'node_modules', packageName, 'package.json'), 'utf8')).version ?? null }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    return { packageName, version: declaredVersion, installedVersion: version }
  })
  writeFileSync(join(folder, 'installed-versions.json'), JSON.stringify(installed, null, 2) + '\n')
  return folder
}

/** Keep the first pre-update snapshot through retries and interrupted installations. */
export function beginPluginUpdate(profile, backupRoot) {
  const previous = pluginUpdateRecovery(profile, backupRoot)
  if (previous) return previous
  const state = { schemaVersion: 1, backup: backupPluginUpdate(profile, backupRoot) }
  writeFileSync(join(profile, UPDATE_STATE), JSON.stringify(state, null, 2) + '\n')
  return state
}

/** Recovery can only read a desktop-created snapshot within the configured backup directory. */
export function pluginUpdateRecovery(profile, backupRoot) {
  let state
  try { state = JSON.parse(readFileSync(join(profile, UPDATE_STATE), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  const path = typeof state?.backup === 'string' ? relative(backupRoot, state.backup) : ''
  if (state?.schemaVersion !== 1 || !path || isAbsolute(path) || path === '..' || path.startsWith('..\\') || path.startsWith('../')) {
    throw new Error('插件恢复记录不在有效备份目录中。')
  }
  return state
}

/** Save diagnostics before a retry replaces the visible startup transcript. */
export function recordPluginUpdateFailure(profile, backupRoot, transcript) {
  const state = pluginUpdateRecovery(profile, backupRoot)
  if (state) writeFileSync(join(state.backup, 'last-error.log'), transcript + '\n')
  return !!state
}

/** Prepare the previous installed dependency set; user data and plugin settings are untouched. */
export function preparePluginRollback(profile, backupRoot) {
  const state = pluginUpdateRecovery(profile, backupRoot)
  if (!state) throw new Error('没有可恢复的插件更新备份。')
  const manifest = JSON.parse(readFileSync(join(state.backup, 'package.json'), 'utf8'))
  const installed = JSON.parse(readFileSync(join(state.backup, 'installed-versions.json'), 'utf8'))
  for (const item of installed) {
    if (!PACKAGE_NAME.test(item.packageName) || (item.installedVersion !== null && !EXACT_VERSION.test(item.installedVersion))) {
      throw new Error('插件恢复备份包含无效包名或版本。')
    }
    if (item.installedVersion === null) {
      delete manifest.dependencies[item.packageName]
      const bundles = manifest.dsh?.profile?.bundles
      if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter(name => name !== item.packageName)
    } else if (!/^(?:file:|link:|workspace:|git\+|github:|https?:|npm:)/.test(item.version)) {
      manifest.dependencies[item.packageName] = item.installedVersion
    }
  }
  // Archive the request first. If recovery is interrupted, it remains available for retry.
  try { copyFileSync(join(profile, PENDING_FILE), join(state.backup, 'failed-pending-updates.json')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    try { copyFileSync(join(state.backup, file), join(profile, file)) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  writeFileSync(join(profile, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  // Persist the recovery phase so an interrupted recovery resumes instead of reinstalling the failed batch.
  writeFileSync(join(profile, UPDATE_STATE), JSON.stringify({ ...state, recovering: true }, null, 2) + '\n')
  return { ...state, manifest, installed }
}

/** Restore the exact activation list after the CLI has reconciled installed dependencies. */
export function verifyPluginRollback(profile, rollback) {
  for (const item of rollback.installed) {
    if (item.installedVersion === null) continue
    const actual = JSON.parse(readFileSync(join(profile, 'node_modules', item.packageName, 'package.json'), 'utf8'))
    if (actual.version !== item.installedVersion) throw new Error(`插件恢复校验失败：${item.packageName}`)
  }
  writeFileSync(join(profile, 'package.json'), JSON.stringify(rollback.manifest, null, 2) + '\n')
}

/** Archive, rather than automatically retry, a rejected batch after the recovered backend is ready. */
export function completePluginRollback(profile) {
  for (const file of [PENDING_FILE, UPDATE_STATE]) {
    try { unlinkSync(join(profile, file)) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

/** Clear verified entries in the stopped profile, retaining requests for other versions. */
export function completePluginUpdates(profile, applied) {
  for (const target of applied) {
    if (!pluginUpdateInstalled(profile, target)) throw new Error(`插件安装校验失败：${target.packageName}@${target.version}`)
  }
  const current = pendingPluginUpdates(profile)
  const remaining = current.filter(target => !applied.some(done => done.packageName === target.packageName && done.version === target.version))
  if (remaining.length === 0) {
    completePluginRollback(profile)
  } else {
    const temporary = join(profile, `${PENDING_FILE}.${process.pid}.tmp`)
    writeFileSync(temporary, JSON.stringify({ packages: remaining }, null, 2) + '\n')
    renameSync(temporary, join(profile, PENDING_FILE))
  }
}
