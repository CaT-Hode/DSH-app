/** Persistent marketplace requests; the desktop applies them only after stopping the profile. */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export const MARKET_OPERATIONS_FILE = '.dsh-app-plugin-operations.json'
const RESULTS_FILE = '.dsh-app-plugin-results.json'
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const KINDS = new Set(['install', 'update', 'uninstall'])
const STATUSES = new Set(['succeeded', 'failed', 'rolled-back'])

function readDocument(profile, name) {
  try { return JSON.parse(readFileSync(join(profile, name), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
}

function writeDocument(profile, name, value) {
  const temporary = join(profile, `${name}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    renameSync(temporary, join(profile, name))
  } finally {
    try { unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

/** Validate a durable operation and its single package-manager argument.
 * @param operation Parsed queued request.
 * @returns A normalized request with no additional input fields.
 */
export function validateMarketOperation(operation) {
  if (!operation || !KINDS.has(operation.kind) || typeof operation.packageName !== 'string' || !PACKAGE_NAME.test(operation.packageName)) throw new Error('插件待办包含无效操作或包名。')
  if (operation.packageName === '@deepseek-ai/dsh' || operation.kind === 'uninstall' && operation.packageName === 'dsh-app') throw new Error('DSH 核心和客户端应通过专用恢复或更新入口管理。')
  if (typeof operation.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(operation.id)
    || !Number.isSafeInteger(operation.queuedAt) || operation.queuedAt < 0) throw new Error('插件待办标识或时间无效。')
  for (const field of ['version', 'beforeVersion']) {
    if (operation[field] !== undefined && operation[field] !== null && (typeof operation[field] !== 'string' || !EXACT_VERSION.test(operation[field]))) throw new Error('插件待办版本无效。')
  }
  if (operation.enabledBefore !== undefined && typeof operation.enabledBefore !== 'boolean') throw new Error('插件原启用状态无效。')
  const { spec } = operation
  if (operation.kind !== 'uninstall') {
    if (typeof spec !== 'string' || !spec || spec.startsWith('-') || /[\x00-\x1f\x7f]/.test(spec)) throw new Error('插件安装来源无效。')
    const npm = spec === `${operation.packageName}@${operation.version}` && EXACT_VERSION.test(operation.version ?? '')
    const git = /^git\+https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_./-]+)?$/.test(spec)
    const local = spec.startsWith('file:') && isAbsolute(spec.slice(5)) && /\.tgz$/i.test(spec)
    if (!npm && !git && !local) throw new Error('仅支持确定版本的 npm 包、GitHub HTTPS 仓库或本地绝对路径 tgz。')
  }
  return { id: operation.id, kind: operation.kind, packageName: operation.packageName,
    ...(operation.kind === 'uninstall' ? {} : { spec }),
    ...(operation.version == null ? {} : { version: operation.version }),
    ...(operation.beforeVersion == null ? {} : { beforeVersion: operation.beforeVersion }),
    ...(operation.enabledBefore === undefined ? {} : { enabledBefore: operation.enabledBefore }), queuedAt: operation.queuedAt }
}

/** Read pending requests without invoking a package manager.
 * @param profile Active profile directory.
 * @returns One validated pending request per package.
 */
export function readMarketOperations(profile) {
  const data = readDocument(profile, MARKET_OPERATIONS_FILE)
  if (data === undefined) return []
  if (data?.schemaVersion !== 1 || !Array.isArray(data.operations)) throw new Error('插件待办记录格式无效。')
  const operations = data.operations.map(validateMarketOperation)
  if (new Set(operations.map(item => item.packageName)).size !== operations.length || new Set(operations.map(item => item.id)).size !== operations.length) throw new Error('插件待办包含重复记录。')
  return operations
}

/** Persist a request, replacing the earlier request for the same package.
 * @param profile Active profile directory.
 * @param operation Request resolved by the Host marketplace.
 * @returns The validated queued request.
 */
export function queueMarketOperation(profile, operation) {
  const target = validateMarketOperation(operation)
  const operations = readMarketOperations(profile).filter(item => item.packageName !== target.packageName)
  operations.push(target)
  writeDocument(profile, MARKET_OPERATIONS_FILE, { schemaVersion: 1, operations })
  return target
}

/** Cancel a pending request without changing installed files.
 * @param profile Active profile directory.
 * @param packageName Package whose pending request should be removed.
 */
export function cancelMarketOperation(profile, packageName) {
  if (typeof packageName !== 'string' || !PACKAGE_NAME.test(packageName)) throw new Error('插件包名无效。')
  const operations = readMarketOperations(profile).filter(item => item.packageName !== packageName)
  writeDocument(profile, MARKET_OPERATIONS_FILE, { schemaVersion: 1, operations })
}

/** Read the last fifty actual execution outcomes, never interpreting pending as installed.
 * @param profile Active profile directory.
 * @returns Persisted execution records in chronological order.
 */
export function readMarketResults(profile) {
  const data = readDocument(profile, RESULTS_FILE)
  if (data === undefined) return []
  if (data?.schemaVersion !== 1 || !Array.isArray(data.records)) throw new Error('插件操作结果格式无效。')
  return data.records.slice(-50).map(validateResult)
}

function validateResult(record) {
  const operation = validateMarketOperation(record)
  if (!STATUSES.has(record.status) || !Number.isSafeInteger(record.finishedAt) || record.finishedAt < 0
    || record.actualVersion != null && (typeof record.actualVersion !== 'string' || !EXACT_VERSION.test(record.actualVersion))
    || record.message !== undefined && typeof record.message !== 'string') throw new Error('插件操作结果字段无效。')
  return { ...operation, status: record.status, finishedAt: record.finishedAt,
    actualVersion: record.actualVersion ?? null, ...(record.message === undefined ? {} : { message: record.message.slice(0, 2048) }) }
}

/** Record execution outcomes, replacing earlier outcomes for the same operation id.
 * @param profile Active profile directory.
 * @param records Actual desktop outcomes.
 */
export function recordMarketResults(profile, records) {
  records = records.map(validateResult)
  const existing = readMarketResults(profile).filter(record => !records.some(item => item.id === record.id))
  writeDocument(profile, RESULTS_FILE, { schemaVersion: 1, records: [...existing, ...records].slice(-50) })
}

/** Capture failed installation or startup outcomes while retaining requests for retry or recovery.
 * @param profile Stopped or failed-startup profile directory.
 * @param message Redacted diagnostic summary from the desktop.
 */
export function recordMarketFailure(profile, message) {
  const operations = readMarketOperations(profile)
  if (!operations.length) return
  recordMarketResults(profile, operations.map(operation => {
    let actualVersion = null
    try {
      const manifest = JSON.parse(readFileSync(join(profile, 'node_modules', operation.packageName, 'package.json'), 'utf8'))
      if (manifest.name === operation.packageName && EXACT_VERSION.test(manifest.version ?? '')) actualVersion = manifest.version
    } catch { actualVersion = null } // Broken installation files still need a readable failure outcome.
    return { ...operation, status: 'failed', finishedAt: Date.now(), actualVersion, message: String(message).slice(0, 2048) }
  }))
}

/** Forget only the applied ids; a newly queued request for the same package is retained.
 * @param profile Active profile directory.
 * @param applied Verified requests.
 */
export function completeMarketOperations(profile, applied) {
  const operations = readMarketOperations(profile).filter(item => !applied.some(done => done.id === item.id))
  writeDocument(profile, MARKET_OPERATIONS_FILE, { schemaVersion: 1, operations })
}

/** Check real package files, profile dependency ownership and bundle selection after the CLI exits.
 * @param profile Stopped profile directory.
 * @param operation Validated pending request.
 * @param options Expected bundle selection; updates preserve their original selection.
 * @returns Installed version and activation, or undefined when installation is incomplete.
 */
export function marketOperationInstalled(profile, operation, { enabled = true } = {}) {
  const target = validateMarketOperation(operation)
  const profileManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  const dependency = profileManifest.dependencies?.[target.packageName]
  const selected = profileManifest.dsh?.profile?.bundles?.includes(target.packageName) === true
  if (target.kind === 'uninstall') return dependency === undefined && !selected ? { actualVersion: null, activated: false } : undefined
  let manifest
  const packageDir = join(profile, 'node_modules', target.packageName)
  try { manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  if (manifest.name !== target.packageName || !EXACT_VERSION.test(manifest.version ?? '') || target.version !== undefined && manifest.version !== target.version
    || typeof dependency !== 'string' || selected !== enabled) return
  if (target.spec === `${target.packageName}@${target.version}` && dependency !== target.version) return
  const patch = manifest.dsh?.bundle?.patch
  const patches = typeof patch === 'string' ? [patch] : Array.isArray(patch) ? patch : []
  if (!patches.length || patches.some(file => {
    if (typeof file !== 'string' || !file) return true
    const path = resolve(packageDir, file)
    const local = relative(packageDir, path)
    return !local || isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\') || !existsSync(path)
  })) return
  return { actualVersion: manifest.version, activated: selected }
}

function reconcileSelection(profile, operation, enabled) {
  if (operation.kind === 'uninstall') return marketOperationInstalled(profile, operation)
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  const selected = manifest.dsh?.profile?.bundles?.includes(operation.packageName) === true
  const installed = marketOperationInstalled(profile, operation, { enabled: selected })
  if (!installed) return
  if (selected !== enabled) {
    const bundles = (manifest.dsh?.profile?.bundles ?? []).filter(name => name !== operation.packageName)
    if (enabled) bundles.push(operation.packageName)
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
    writeDocument(profile, 'package.json', manifest)
  }
  return marketOperationInstalled(profile, operation, { enabled })
}

/** Apply a captured batch through the desktop's stopped-profile CLI runner.
 * @param profile Stopped profile directory.
 * @param operations Validated captured pending requests.
 * @param run Command callback receiving argv without shell interpolation.
 * @returns Captured requests with verified installed versions.
 */
export async function applyMarketOperations(profile, operations, run) {
  const applied = []
  for (const operation of operations.map(validateMarketOperation)) {
    const profileManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
    const enabled = operation.kind === 'update' ? operation.enabledBefore ?? profileManifest.dsh?.profile?.bundles?.includes(operation.packageName) === true : true
    const verify = () => reconcileSelection(profile, operation, enabled)
    let actual = operation.kind !== 'uninstall' && operation.version === undefined ? undefined : verify()
    if (!actual) {
      const args = operation.kind === 'uninstall' ? ['remove', operation.packageName, '--config.minimum-release-age=0']
        : ['add', '--save-exact', '--config.minimum-release-age=0', operation.spec]
      await run(args)
      actual = verify()
      if (!actual && operation.kind !== 'uninstall') {
        await run([...args, '--force'])
        actual = verify()
      }
    }
    if (!actual) throw new Error(`插件操作校验失败：${operation.packageName}`)
    applied.push({ ...operation, ...actual })
  }
  return applied
}
