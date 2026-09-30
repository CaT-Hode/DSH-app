/** Local skill management backed by DSH's provider registry and recoverable filesystem writes. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isMap, parseDocument } from 'yaml'
import { stageSkillImport } from './skill-import.mjs'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const SOURCES = [
  ['ccswitch', '.cc-switch', 'CC Switch'], ['codex', '.codex', 'Codex'], ['claude', '.claude', 'Claude'],
  ['gemini', '.gemini', 'Gemini'], ['opencode', '.config/opencode', 'OpenCode'], ['cursor', '.cursor', 'Cursor'],
  ['copilot', '.copilot', 'Copilot'], ['windsurf', '.codeium/windsurf', 'Windsurf'], ['windsurf-user', '.windsurf', 'Windsurf'],
  ['trae', '.trae', 'Trae'], ['trae-cn', '.trae-cn', 'Trae CN'], ['openclaw', '.openclaw', 'OpenClaw'],
  ['clawdbot', '.clawdbot', 'OpenClaw'], ['roo', '.roo', 'Roo'], ['codebuddy', '.codebuddy', 'CodeBuddy'],
]
const PROJECT_SOURCES = [['dsh', '.dsh', 100], ['agents', '.agents', 200], ['codex', '.codex', 220],
  ['claude', '.claude', 230], ['gemini', '.gemini', 240], ['opencode', '.opencode', 250],
  ['cursor', '.cursor', 260], ['copilot', '.github', 270], ['windsurf', '.windsurf', 280],
  ['trae', '.trae', 290], ['trae-cn', '.trae-cn', 300], ['openclaw', '', 320], ['roo', '.roo', 330], ['codebuddy', '.codebuddy', 340]]
const defaults = { maxContentBytes: 1048576, maxArchiveBytes: 33554432, maxExpandedBytes: 67108864, maxFiles: 1000, scanMaxDepth: 6, scanMaxEntries: 20000, cacheMs: 2000, requestTimeoutMs: 15000 }
const identity = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
const hash = value => createHash('sha256').update(value).digest('hex')
const inside = (parent, path) => { const local = relative(parent, path); return !isAbsolute(local) && local !== '..' && !local.startsWith('..' + sep) }

function failure(message, status = 400) { return Object.assign(new Error(message), { status }) }
function validPath(value) { return typeof value === 'string' && isAbsolute(value) && !/[\x00-\x1f\x7f]/.test(value) }
function validEntry(value) { return typeof value === 'string' && value.length <= 1024 && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\:*?"<>|\x00-\x1f]/.test(part) && !/[. ]$/.test(part) && !DEVICE.test(part)) }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function bounded(pending, signals) {
  const live = signals.filter(Boolean)
  const aborted = live.find(signal => signal.aborted)
  if (aborted) { Promise.resolve(pending).catch(() => undefined); return Promise.reject(aborted.reason) }
  return new Promise((resolve, reject) => {
    const listeners = []
    const finish = (callback, value) => { for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener); callback(value) }
    for (const signal of live) {
      const listener = () => finish(reject, signal.reason)
      listeners.push([signal, listener]); signal.addEventListener('abort', listener, { once: true })
    }
    Promise.resolve(pending).then(value => finish(resolve, value), error => finish(reject, error))
  })
}

function optionsOf(input = {}) {
  const value = { ...defaults, ...input }
  for (const field of Object.keys(defaults)) if (!Number.isSafeInteger(value[field]) || value[field] < 1) throw failure(`Invalid skills.${field}`)
  if (value.maxContentBytes > 8388608 || value.maxArchiveBytes > 134217728 || value.maxExpandedBytes > 268435456
    || value.maxFiles > 10000 || value.scanMaxDepth > 12 || value.scanMaxEntries > 100000 || value.cacheMs > 60000
    || value.requestTimeoutMs < 1000 || value.requestTimeoutMs > 60000) throw failure('Skill limits exceed supported bounds')
  if (value.customSkillDirs !== undefined && (!Array.isArray(value.customSkillDirs) || value.customSkillDirs.some(path => !validPath(path)))) throw failure('skills.customSkillDirs requires absolute local paths')
  return value
}

async function readJson(path, fallback) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}

async function writeAtomic(path, value, mode = 0o600) {
  const temporary = join(dirname(path), '.' + basename(path) + '.' + randomUUID() + '.tmp')
  try { await fs.writeFile(temporary, value, { flag: 'wx', mode }); await fs.rename(temporary, path) }
  finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}

function bool(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || /^(?:true|yes|on)$/i.test(String(value))) return true
  if (value === 0 || value === '0' || /^(?:false|no|off)$/i.test(String(value))) return false
  throw failure('Skill invocation flags must be boolean')
}

/** Parse a local SKILL.md without executing YAML tags; keep its full document for editing.
 * @param raw Full UTF-8 skill document.
 * @param fallback Name inferred from its directory or flat Markdown filename.
 * @returns Parsed catalog fields, invocation policy and raw/body text.
 */
export function parseSkillDocument(raw, fallback) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(raw)
  if (!match) throw failure('SKILL.md requires YAML frontmatter')
  const document = parseDocument(match[1], { logLevel: 'silent', uniqueKeys: true })
  if (document.errors.length || !isMap(document.contents)) throw failure('Skill frontmatter is invalid')
  const data = document.toJS({ maxAliasCount: 20 })
  const name = data.name ?? fallback
  if (typeof name !== 'string' || !NAME.test(name) || DEVICE.test(name)) throw failure('Skill name must be kebab-case')
  if (typeof data.description !== 'string' || !data.description.trim()) throw failure('Skill description is required')
  if (['disableModelInvocation', 'modelInvocable', 'userInvocable'].some(key => Object.hasOwn(data, key))) throw failure('Use disable-model-invocation and user-invocable in skill frontmatter')
  return { name, description: data.description.trim(), whenToUse: typeof data.when_to_use === 'string' ? data.when_to_use : typeof data.whenToUse === 'string' ? data.whenToUse : undefined,
    invocation: { modelInvocable: !bool(data['disable-model-invocation'], false), userInvocable: bool(data['user-invocable'], true) },
    metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? data.metadata : undefined,
    document, raw, body: match[2], revision: hash(raw) }
}

function toggleDocument(skill, enabled) {
  skill.document.set('disable-model-invocation', !enabled)
  return '---\n' + skill.document.toString() + '---\n' + skill.body
}

/** Own management state and provide custom/external skill policy through ctx.skills.
 * @param ctx DSH Host context with skill, session and connection services.
 * @param options Active directories and validated deployment limits.
 */
export class SkillsManager {
  constructor(ctx, { home, profile, directory, skills }, dependencies = {}) {
    this.ctx = ctx
    this.home = resolve(home)
    this.profile = resolve(profile)
    this.directory = join(this.home, 'dsh-app', 'skills')
    this.options = optionsOf(skills)
    this.userHome = dependencies.userHome || homedir()
    this.environment = dependencies.environment || process.env
    this.stageImport = dependencies.stageImport || stageSkillImport
    this.stateFile = join(this.directory, 'state.json')
    this.legacyFile = join(this.home, 'skills-manager', 'state.json')
    this.trashRoot = join(this.directory, 'trash')
    this.abort = new AbortController()
    this.controls = new Set()
    this.scans = new Map()
    this.mutations = Promise.resolve()
    this.closed = false
  }

  async policies() {
    try {
    const own = await readJson(this.stateFile, { schemaVersion: 1, libraries: [], overrides: {} })
    if (own?.schemaVersion !== 1 || !Array.isArray(own.libraries) || !own.overrides || typeof own.overrides !== 'object' || Array.isArray(own.overrides)
      || own.libraries.some(item => !item || typeof item.id !== 'string' || !validPath(item.path) || typeof item.enabled !== 'boolean')
      || Object.entries(own.overrides).some(([uri, flag]) => !/^[a-f0-9]{64}$/.test(uri) || typeof flag !== 'boolean')) throw failure('DSH App skill state is invalid; it has been left unchanged')
    const legacy = await readJson(this.legacyFile, null)
    if (legacy !== null && (legacy.version !== 1 || !object(legacy.sources)
      || !object(legacy.disabledSkills) || legacy.enabledSkills !== undefined && !object(legacy.enabledSkills)
      || Object.values(legacy.sources).some(flag => typeof flag !== 'boolean')
      || Object.values(legacy.disabledSkills).some(list => !Array.isArray(list) || list.some(name => !validEntry(name)))
      || legacy.enabledSkills !== undefined && Object.values(legacy.enabledSkills).some(list => !Array.isArray(list) || list.some(name => !validEntry(name))))) throw failure('Previous skill policy is invalid; the file has been preserved and skill management is locked')
    return { own, legacy }
    } catch (error) {
      return { own: { schemaVersion: 1, libraries: [], overrides: {} }, legacy: null, locked: String(error.message) }
    }
  }

  async officialDirectories() {
    const inventory = this.ctx.get?.('pluginInventory')
    if (!inventory || typeof this.ctx.settings?.describe !== 'function') return []
    const snapshot = await inventory.list()
    const rows = [...snapshot.entries, ...(snapshot.agentPresets || []).flatMap(group => group.rows)]
    const addresses = new Set(rows.filter(row => row.enabled === true && row.fiberPhase === 'active'
      && row.moduleName === '@deepseek-ai/dsh-skill-filesystem').map(row => row.entryId))
    const directories = []
    for (const descriptor of this.ctx.settings.describe({ redactSecrets: true })) {
      if (!addresses.has(descriptor.ns)) continue
      const paths = descriptor.value?.customSkillDirs
      if (paths === undefined) continue
      if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || /[\x00-\x1f\x7f]/.test(path))) throw failure('Official custom skill directories are invalid')
      directories.push(...paths.map(path => resolve(path)))
    }
    return directories
  }

  async previousManagerActive() {
    const inventory = this.ctx.get?.('pluginInventory')
    if (!inventory) return false
    const { entries } = await inventory.list()
    return entries.some(entry => entry.enabled && entry.fiberPhase === 'active' && entry.moduleName === '@michengai/dsh-skills-manager')
  }

  defaultCwd() {
    return this.ctx.sessions?.list().find(session => validPath(session.header?.cwd))?.header.cwd || process.cwd()
  }

  async projectRoot(cwd) {
    if (!validPath(cwd)) throw failure('Workspace must be an absolute directory')
    let path = await fs.realpath(cwd)
    if (!(await fs.stat(path)).isDirectory()) throw failure('Workspace is not a directory')
    const start = path
    while (true) {
      if (existsSync(join(path, '.git'))) return path
      const parent = dirname(path)
      if (parent === path) return start
      path = parent
    }
  }

  async libraries(cwd, policy) {
    const agentsHome = this.environment.DSH_AGENTS_HOME || join(this.userHome, '.agents')
    const roots = [{ id: 'dsh', label: 'DSH', path: join(this.home, 'skills'), source: 'user-dsh', writable: true, rank: 400 },
      { id: 'agents', label: 'Agent', path: join(agentsHome, 'skills'), source: 'user-agents', writable: false, rank: 450 }]
    for (const [index, [id, path, label]] of SOURCES.entries()) {
      const variable = 'DSH_' + id.replaceAll('-', '_').toUpperCase() + '_HOME'
      roots.push({ id, label, path: join(this.environment[variable] || join(this.userHome, path), 'skills'), source: 'agent-' + id, writable: false, rank: 500 + index * 10 })
    }
    const custom = [...await this.officialDirectories(), ...(this.options.customSkillDirs ?? []), ...policy.own.libraries.map(item => item.path)]
    for (const path of new Set(custom.map(path => resolve(path)))) roots.push({ id: 'custom:' + hash(identity(path)).slice(0, 16), label: basename(path), path, source: 'custom', writable: false, rank: 300 })
    const project = await this.projectRoot(cwd)
    const projectId = hash(identity(project)).slice(0, 16)
    for (const [id, path, rank] of PROJECT_SOURCES) roots.push({ id: `project-${id}:${projectId}`, label: basename(project) + ' / ' + (id === 'dsh' ? 'DSH' : id),
      path: join(project, path, 'skills'), source: 'project-' + id, writable: id === 'dsh', rank })
    for (const root of roots) {
      root.path = resolve(root.path)
      const override = policy.own.libraries.find(item => item.id === root.id || identity(item.path) === identity(root.path))
      root.enabled = override?.enabled ?? policy.legacy?.sources?.[root.id] !== false
      root.toggleable = true
      if (policy.locked) { root.enabled = false; root.toggleable = false; root.writable = false }
      try {
        const info = await fs.lstat(root.path)
        root.exists = (await fs.stat(root.path)).isDirectory()
        if (info.isSymbolicLink() || identity(await fs.realpath(root.path)) !== identity(root.path)) root.writable = false
      } catch (error) { if (error.code !== 'ENOENT') root.error = String(error.message); root.exists = false }
    }
    return roots.sort((a, b) => a.rank - b.rank)
  }

  async scanRoot(library, policy, budget) {
    if (!library.exists) return []
    const output = []
    const queue = [{ path: library.path, depth: 0, ancestors: new Set() }]
    for (let cursor = 0; cursor < queue.length; cursor++) {
      this.abort.signal.throwIfAborted()
      const current = queue[cursor]
      if (budget.remaining <= 0) break
      try {
        const realDirectory = await fs.realpath(current.path)
        if (current.ancestors.has(identity(realDirectory))) continue
        const ancestors = new Set(current.ancestors).add(identity(realDirectory))
        const items = await fs.readdir(current.path, { withFileTypes: true })
        const instruction = items.find(item => item.name === 'SKILL.md' && item.isFile())
        const add = async (file, entryPath, entryName, kind) => {
          const info = await fs.stat(file)
          if (!info.isFile() || info.size > this.options.maxContentBytes) throw failure('Skill document exceeds the configured size limit')
          const raw = await fs.readFile(file, 'utf8')
          const parsed = parseSkillDocument(raw, kind === 'bundle' ? basename(entryPath) : basename(file, '.md'))
          const realPath = await fs.realpath(file)
          const uri = hash(library.id + '\0' + relative(library.path, file))
          const invocation = this.invocationFor(parsed, library, policy, entryName, uri)
          const managerEnabled = !policy.locked && library.enabled && this.legacyOverride(parsed, library, policy, entryName) !== false
          const policyBlocked = !library.enabled || policy.own.overrides[uri] === false
            || !(policy.legacy?.enabledSkills?.[library.id] || []).some(name => name === entryName || name === parsed.name)
              && (policy.legacy?.disabledSkills?.[library.id] || []).some(name => name === entryName || name === parsed.name)
          const linked = identity(file) !== identity(realPath)
          output.push({ ...parsed, uri, libraryId: library.id, path: file, realPath, entryPath, entryName, kind,
            source: library.source, rank: library.rank, invocation, enabled: invocation.modelInvocable, managerEnabled, policyBlocked,
            canEdit: library.writable && !linked, canDelete: library.writable && !linked, canToggle: library.toggleable })
        }
        if (instruction && current.depth > 0) {
          budget.remaining--
          await add(join(current.path, 'SKILL.md'), current.path, relative(library.path, current.path).split(sep).join('/'), 'bundle')
          continue
        }
        for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
          if (budget.remaining-- <= 0) break
          if (item.name.startsWith('.') || item.name === 'node_modules') continue
          const path = join(current.path, item.name)
          const entryName = relative(library.path, path).split(sep).join('/')
          if (!validEntry(entryName)) continue
          if (item.isDirectory() || item.isSymbolicLink()) {
            if (current.depth < this.options.scanMaxDepth) queue.push({ path, depth: current.depth + 1, ancestors })
          } else if (item.isFile() && item.name.endsWith('.md')) {
            try { await add(path, path, entryName, 'flat') }
            catch (error) { this.abort.signal.throwIfAborted(); budget.warnings.push({ path, error: String(error.message) }) }
          }
        }
      } catch (error) { this.abort.signal.throwIfAborted(); budget.warnings.push({ path: current.path, error: String(error.message) }) }
    }
    return output
  }

  scan(cwd = this.defaultCwd(), fresh = false) {
    if (this.closed) return Promise.reject(failure('Skill management is closing'))
    cwd = cwd || this.defaultCwd()
    const cached = this.scans.get(cwd)
    if (!fresh && cached && Date.now() - cached.createdAt < this.options.cacheMs) return cached.pending
    const pending = (async () => {
      const policy = await this.policies()
      const libraries = await this.libraries(cwd, policy)
      const budget = { remaining: this.options.scanMaxEntries, warnings: libraries.filter(root => root.error).map(root => ({ path: root.path, error: root.error })) }
      if (policy.locked) budget.warnings.push({ error: policy.locked + '; model invocation and management are locked until the preserved policy is repaired' })
      const skills = []
      for (const library of libraries) skills.push(...await this.scanRoot(library, policy, budget))
      if (budget.remaining <= 0) budget.warnings.push({ error: 'Skill discovery reached its configured entry limit' })
      return { cwd, policy, libraries, skills, warnings: budget.warnings }
    })()
    this.scans.set(cwd, { createdAt: Date.now(), pending })
    if (this.scans.size > 16) this.scans.delete(this.scans.keys().next().value)
    return pending
  }

  invalidation() {
    this.scans.clear()
    for (const control of this.controls) control.invalidate()
    this.ctx.emit?.('commands/change')
  }

  legacyOverride(parsed, library, policy, entryName) {
    const disabled = policy.legacy?.disabledSkills?.[library.id] ?? []
    const enabled = policy.legacy?.enabledSkills?.[library.id] ?? []
    return enabled.includes(entryName) || enabled.includes(parsed.name) ? true : disabled.includes(entryName) || disabled.includes(parsed.name) ? false : undefined
  }

  invocationFor(parsed, library, policy, entryName, uri) {
    const oldOverride = this.legacyOverride(parsed, library, policy, entryName)
    const invocation = oldOverride === undefined ? { ...parsed.invocation } : { modelInvocable: oldOverride, userInvocable: oldOverride }
    if (Object.hasOwn(policy.own.overrides, uri)) invocation.modelInvocable = policy.own.overrides[uri]
    if (!library.enabled) invocation.modelInvocable = invocation.userInvocable = false
    return invocation
  }

  provider(control) {
    this.controls.add(control)
    control.signal.addEventListener('abort', () => this.controls.delete(control), { once: true })
    const wait = (pending, options) => bounded(pending, [options.signal, control.signal, this.abort.signal])
    return { name: 'dsh-app-skills', list: async options => {
      if (await wait(this.previousManagerActive(), options)) return []
      const snapshot = await wait(this.scan(options.cwd), options)
      const winners = new Map()
      const ranks = new Map()
      for (const skill of snapshot.skills) {
        ranks.set(skill.name, Math.min(ranks.get(skill.name) ?? Infinity, skill.rank))
        if (!winners.has(skill.name) || winners.get(skill.name).policyBlocked && !skill.policyBlocked) winners.set(skill.name, skill)
      }
      return [...winners.values()].map(skill => ({ name: skill.name, description: skill.description, whenToUse: skill.whenToUse,
        invocation: skill.invocation, provider: 'dsh-app-skills', source: skill.source, rank: ranks.get(skill.name) - 1,
        locator: { uri: skill.uri, cwd: snapshot.cwd, realPath: skill.realPath }, path: skill.path,
        resourceBase: { kind: 'directory', path: dirname(skill.realPath) }, metadata: skill.metadata }))
    }, get: async (candidate, options) => {
      const snapshot = await wait(this.scan(options.cwd || candidate.locator.cwd), options)
      const skill = snapshot.skills.find(item => item.uri === candidate.locator.uri && item.realPath === candidate.locator.realPath)
      if (!skill || skill.name !== candidate.name) return undefined
      if (identity(await wait(fs.realpath(skill.path), options)) !== identity(skill.realPath) || (await wait(fs.stat(skill.path), options)).size > this.options.maxContentBytes) return undefined
      const parsed = parseSkillDocument(await wait(fs.readFile(skill.path, 'utf8'), options), skill.name)
      if (parsed.name !== candidate.name) return undefined
      const library = snapshot.libraries.find(item => item.id === skill.libraryId)
      return { name: parsed.name, description: parsed.description, whenToUse: parsed.whenToUse, invocation: this.invocationFor(parsed, library, snapshot.policy, skill.entryName, skill.uri),
        provider: 'dsh-app-skills', source: skill.source, path: skill.path, resourceBase: { kind: 'directory', path: dirname(skill.realPath) }, metadata: parsed.metadata, content: parsed.body.trim() }
    } }
  }

  publicSkill(skill) {
    const { uri, name, description, libraryId, path, enabled, managerEnabled, source, canEdit, canDelete, canToggle, revision } = skill
    return { uri, name, description, libraryId, path, enabled, managerEnabled, modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable, source, canEdit, canDelete, canToggle, revision }
  }

  async trash() {
    let entries
    try { entries = await fs.readdir(this.trashRoot, { withFileTypes: true }) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
    const output = []
    for (const entry of entries.slice(0, this.options.maxFiles)) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue
      const record = await readJson(join(this.trashRoot, entry.name, 'metadata.json'), null)
      if (record && record.schemaVersion === 1 && record.id === entry.name && record.complete === true) output.push({ id: record.id, name: record.name, deletedAt: record.deletedAt, libraryId: record.libraryId })
    }
    return output.sort((a, b) => b.deletedAt - a.deletedAt)
  }

  async state(cwd) {
    const snapshot = await this.scan(cwd, true)
    for (const control of this.controls) control.invalidate()
    const skills = snapshot.skills.map(skill => this.publicSkill(skill))
    const registry = await this.ctx.skills.snapshot({ cwd: snapshot.cwd, signal: this.abort.signal })
    if (!registry.complete) snapshot.warnings.push({ error: 'The official skill registry reported incomplete discovery; model and command availability may require another refresh' })
    for (const skill of registry.skills) if (skill.provider !== 'dsh-app-skills' && !snapshot.skills.some(local => local.name === skill.name && skill.path && identity(skill.path) === identity(local.path))) skills.push({ uri: 'runtime:' + skill.name, name: skill.name, description: skill.description,
      libraryId: 'runtime', path: skill.path ?? null, enabled: skill.invocation.modelInvocable, modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable, source: skill.source, canEdit: false, canDelete: false, canToggle: false, revision: null })
    const libraries = snapshot.libraries.map(({ rank, ...library }) => library)
    if (await this.previousManagerActive()) {
      for (const skill of skills) skill.canToggle = false
      for (const library of libraries) library.toggleable = false
      snapshot.warnings.push({ error: 'The previous Skills Manager still owns model discovery. Remove it and restart to use the integrated library and invocation controls.' })
    }
    if (skills.some(skill => skill.libraryId === 'runtime')) libraries.push({ id: 'runtime', label: 'DSH', path: null, enabled: true, exists: true, writable: false, toggleable: false, source: 'runtime' })
    return { cwd: snapshot.cwd, libraries, skills, trash: await this.trash(), warnings: snapshot.warnings,
      discovery: { complete: registry.complete, count: registry.skills.length, owned: registry.skills.filter(skill => skill.provider === 'dsh-app-skills').length },
      limits: { maxContentBytes: this.options.maxContentBytes, maxUploadBytes: this.options.maxArchiveBytes } }
  }

  async detail(uri, cwd) {
    if (typeof uri !== 'string') throw failure('Skill identifier is required')
    if (uri.startsWith('runtime:')) {
      const name = uri.slice(8)
      if (!NAME.test(name)) throw failure('Skill identifier is invalid')
      const skill = await this.ctx.skills.get(name, { cwd: cwd || this.defaultCwd(), signal: this.abort.signal })
      if (!skill || skill.provider === 'dsh-app-skills') throw failure('Runtime skill no longer exists', 404)
      return { uri, name, description: skill.description, libraryId: 'runtime', source: skill.source, path: skill.path ?? null, content: skill.content,
        enabled: skill.invocation.modelInvocable, modelInvocable: skill.invocation.modelInvocable, userInvocable: skill.invocation.userInvocable,
        canEdit: false, canDelete: false, canToggle: false, revision: null }
    }
    const snapshot = await this.scan(cwd, true)
    const skill = snapshot.skills.find(item => item.uri === uri)
    if (!skill) throw failure('Skill no longer exists; refresh the list', 404)
    return { ...this.publicSkill(skill), content: skill.raw, canToggle: !snapshot.policy.locked && !await this.previousManagerActive() }
  }

  async writableRoot(library, create = false) {
    if (!library?.writable) throw failure('This library is read-only')
    let current = resolve(library.path)
    const parts = []
    while (true) {
      parts.push(current)
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    for (const path of parts.reverse()) {
      try { const info = await fs.lstat(path); if (info.isSymbolicLink() || !info.isDirectory()) throw failure('Writable skill paths cannot contain links or files') }
      catch (error) { if (error.code !== 'ENOENT') throw error; if (create) await fs.mkdir(path); else throw failure('Skill library is missing') }
    }
    return await fs.realpath(library.path)
  }

  async writableSkill(skill, library) {
    const root = await this.writableRoot(library)
    if (!inside(root, skill.path) || !inside(root, skill.entryPath)) throw failure('Skill path leaves its library')
    let current = root
    for (const part of relative(root, skill.path).split(sep)) {
      current = join(current, part)
      if ((await fs.lstat(current)).isSymbolicLink()) throw failure('Linked skills are read-only')
    }
    if (identity(await fs.realpath(skill.path)) !== identity(skill.realPath)) throw failure('Skill path changed; refresh the list', 409)
  }

  async destination(root, entry, create = false) {
    if (!validEntry(entry.split(sep).join('/'))) throw failure('Skill destination is invalid')
    let current = root
    for (const part of dirname(entry).split(sep).filter(part => part !== '.')) {
      current = join(current, part)
      try { const info = await fs.lstat(current); if (info.isSymbolicLink() || !info.isDirectory()) throw failure('Skill destinations cannot contain links or files') }
      catch (error) { if (error.code !== 'ENOENT' || !create) throw error; await fs.mkdir(current) }
      if (!inside(root, await fs.realpath(current))) throw failure('Skill destination leaves its library')
    }
    return join(root, entry)
  }

  async savePolicy(own) {
    await fs.mkdir(this.directory, { recursive: true })
    if ((await fs.lstat(this.directory)).isSymbolicLink()) throw failure('Skill state directory cannot be a link')
    await writeAtomic(this.stateFile, JSON.stringify(own, null, 2) + '\n')
    this.invalidation()
  }

  action(request) {
    if (this.closed) return Promise.reject(failure('Skill management is closing'))
    const pending = this.mutations.then(() => this.perform(request))
    this.mutations = pending.catch(() => undefined)
    return pending
  }

  async perform(request) {
    this.abort.signal.throwIfAborted()
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw failure('Skill action must be an object')
    const snapshot = await this.scan(request.cwd, true)
    if (snapshot.policy.locked) throw failure(snapshot.policy.locked)
    const library = snapshot.libraries.find(item => item.id === (request.libraryId || 'dsh'))
    const skill = snapshot.skills.find(item => item.uri === request.uri)
    const result = { action: request.action }
    switch (request.action) {
      case 'set-library': {
        if (await this.previousManagerActive()) throw failure('Remove the previous Skills Manager and restart before changing integrated library policy')
        if (typeof request.enabled !== 'boolean') throw failure('Library enabled must be boolean')
        const target = request.libraryId ? snapshot.libraries.find(item => item.id === request.libraryId) : null
        const path = target?.path || request.path
        if (!validPath(path)) throw failure('Library path must be an absolute local directory')
        const id = target?.id || 'custom:' + hash(identity(path)).slice(0, 16)
        snapshot.policy.own.libraries = snapshot.policy.own.libraries.filter(item => item.id !== id && identity(item.path) !== identity(path))
        snapshot.policy.own.libraries.push({ id, path: resolve(path), enabled: request.enabled })
        await this.savePolicy(snapshot.policy.own)
        result.libraryId = id
        break
      }
      case 'set-enabled': {
        if (await this.previousManagerActive()) throw failure('Remove the previous Skills Manager and restart before changing integrated invocation policy')
        if (!skill || typeof request.enabled !== 'boolean') throw failure('Skill and enabled state are required')
        if (skill.canEdit) {
          const root = snapshot.libraries.find(item => item.id === skill.libraryId)
          await this.writableSkill(skill, root)
          await writeAtomic(skill.path, toggleDocument(skill, request.enabled))
        }
        snapshot.policy.own.overrides[skill.uri] = request.enabled
        try { await this.savePolicy(snapshot.policy.own) }
        catch (error) { if (skill.canEdit) await writeAtomic(skill.path, skill.raw); throw error }
        result.uri = skill.uri
        break
      }
      case 'edit': {
        if (!skill?.canEdit || typeof request.content !== 'string') throw failure('This skill cannot be edited')
        if (Buffer.byteLength(request.content) > this.options.maxContentBytes) throw failure('Skill document is too large', 413)
        if (request.revision !== undefined && request.revision !== skill.revision) throw failure('Skill changed since it was opened; reload before saving', 409)
        const parsed = parseSkillDocument(request.content, skill.name)
        if (parsed.name !== skill.name) throw failure('Editing cannot rename a skill; create a separate skill instead')
        const root = snapshot.libraries.find(item => item.id === skill.libraryId)
        await this.writableSkill(skill, root)
        await writeAtomic(skill.path, request.content)
        snapshot.policy.own.overrides[skill.uri] = parsed.invocation.modelInvocable
        try { await this.savePolicy(snapshot.policy.own) }
        catch (error) { await writeAtomic(skill.path, skill.raw); throw error }
        result.uri = skill.uri
        break
      }
      case 'create': {
        if (typeof request.name !== 'string' || !NAME.test(request.name) || DEVICE.test(request.name)
          || typeof request.description !== 'string' || !request.description.trim() || typeof request.content !== 'string' || !request.content.trim()) throw failure('Name, description and skill instructions are required')
        const root = await this.writableRoot(library, true)
        const folder = join(root, request.name)
        if (existsSync(folder) || existsSync(join(root, request.name + '.md'))) throw failure('Skill already exists', 409)
        const raw = '---\nname: ' + request.name + '\ndescription: ' + JSON.stringify(request.description.trim()) + '\n---\n\n' + request.content.trim() + '\n'
        if (Buffer.byteLength(raw) > this.options.maxContentBytes) throw failure('Skill document is too large', 413)
        parseSkillDocument(raw, request.name)
        await fs.mkdir(folder)
        try { await fs.writeFile(join(folder, 'SKILL.md'), raw, { flag: 'wx' }) }
        catch (error) { await fs.rmdir(folder).catch(() => undefined); throw error }
        this.invalidation()
        result.path = join(folder, 'SKILL.md')
        result.uri = hash(library.id + '\0' + relative(library.path, result.path))
        break
      }
      case 'delete': {
        if (!skill?.canDelete) throw failure('This skill cannot be deleted')
        const root = snapshot.libraries.find(item => item.id === skill.libraryId)
        await this.writableSkill(skill, root)
        const id = randomUUID()
        const folder = join(this.trashRoot, id)
        const contentFolder = join(root.path, '.dsh-app-trash', id)
        await fs.mkdir(folder, { recursive: true })
        await fs.mkdir(contentFolder, { recursive: true })
        if ((await fs.lstat(dirname(contentFolder))).isSymbolicLink() || (await fs.lstat(contentFolder)).isSymbolicLink()
          || !inside(await fs.realpath(root.path), await fs.realpath(contentFolder))) throw failure('Skill trash must remain inside its library')
        const metadata = { schemaVersion: 1, id, libraryId: root.id, entry: relative(root.path, skill.entryPath), kind: skill.kind,
          name: skill.name, deletedAt: Date.now(), contentLocation: 'library', complete: false }
        await writeAtomic(join(folder, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n')
        await fs.rename(skill.entryPath, join(contentFolder, 'content'))
        try { await writeAtomic(join(folder, 'metadata.json'), JSON.stringify({ ...metadata, complete: true }, null, 2) + '\n') }
        catch (error) { await fs.rename(join(contentFolder, 'content'), skill.entryPath); throw error }
        this.invalidation()
        result.id = id
        break
      }
      case 'restore': {
        if (typeof request.id !== 'string' || !/^[a-f0-9-]{36}$/.test(request.id)) throw failure('Trash identifier is invalid')
        const folder = join(this.trashRoot, request.id)
        if ((await fs.lstat(folder)).isSymbolicLink()) throw failure('Trash directory cannot be a link')
        const metadata = await readJson(join(folder, 'metadata.json'), null)
        if (metadata?.schemaVersion !== 1 || metadata.id !== request.id || metadata.complete !== true || metadata.contentLocation !== 'library' || !validEntry(String(metadata.entry).split(sep).join('/'))) throw failure('Trash record is invalid')
        const targetLibrary = snapshot.libraries.find(item => item.id === metadata.libraryId)
        const root = await this.writableRoot(targetLibrary, true)
        const target = join(root, metadata.entry)
        if (!inside(root, target) || existsSync(target)) throw failure('Restore target exists or is outside the library', 409)
        const contentFolder = join(root, '.dsh-app-trash', request.id)
        if ((await fs.lstat(dirname(contentFolder))).isSymbolicLink() || (await fs.lstat(contentFolder)).isSymbolicLink()
          || !inside(root, await fs.realpath(contentFolder))) throw failure('Skill trash must remain inside its library')
        await this.destination(root, metadata.entry, true)
        await fs.rename(join(contentFolder, 'content'), target)
        await fs.unlink(join(folder, 'metadata.json'))
        await fs.rmdir(folder)
        await fs.rmdir(contentFolder)
        this.invalidation()
        result.path = target
        break
      }
      case 'import':
      case 'install': {
        if (request.conflict !== undefined && request.conflict !== 'skip') throw failure('Imports preserve existing skills; only skip conflicts is supported')
        if (Array.isArray(request.files) && request.files.reduce((size, row) => size + Buffer.byteLength(row?.base64 || '', 'base64'), 0) > this.options.maxArchiveBytes) throw failure('Uploaded skill files exceed the configured upload limit', 413)
        const root = await this.writableRoot(library, true)
        const stagingRoot = await this.destination(root, '.dsh-app-staging/' + randomUUID(), true)
        await fs.mkdir(stagingRoot)
        try {
          const staged = await this.stageImport({ source: request.source, files: request.files, zip: request.zip, stagingRoot,
            maxArchiveBytes: this.options.maxArchiveBytes, maxExpandedBytes: this.options.maxExpandedBytes, maxFiles: this.options.maxFiles,
            requestTimeoutMs: this.options.requestTimeoutMs, signal: this.abort.signal })
          const imported = [], skipped = [], failed = []
          for (const candidate of staged.candidates) {
            this.abort.signal.throwIfAborted()
            const path = await fs.realpath(candidate.path)
            if (!inside(await fs.realpath(stagingRoot), path)) throw failure('Staged skill leaves its private directory')
            const raw = await fs.readFile(join(path, 'SKILL.md'), 'utf8')
            if (Buffer.byteLength(raw) > this.options.maxContentBytes) throw failure('Imported skill document is too large', 413)
            let parsed
            try { parsed = parseSkillDocument(raw, basename(path)) }
            catch (error) { failed.push({ path: candidate.path, error: String(error.message) }); continue }
            const target = join(root, parsed.name)
            if (existsSync(target) || existsSync(join(root, parsed.name + '.md'))) { skipped.push(parsed.name); continue }
            try { await fs.rename(path, target); imported.push({ name: parsed.name, path: join(target, 'SKILL.md') }) }
            catch (error) { failed.push({ name: parsed.name, error: String(error.message) }) }
          }
          Object.assign(result, { imported, skipped, failed, warnings: staged.warnings || [] })
          this.invalidation()
        } finally { await fs.rm(stagingRoot, { recursive: true, force: true }) }
        break
      }
      default: throw failure('Unknown skill action')
    }
    return { ok: true, result, ...(result.uri ? { uri: result.uri } : {}), ...(result.imported ? { count: result.imported.length } : {}) }
  }

  async close() {
    this.closed = true
    this.abort.abort(new Error('Skill management is closing'))
    await Promise.allSettled([this.mutations, ...[...this.scans.values()].map(value => value.pending)])
    this.scans.clear()
  }
}

/** Mount authenticated management routes and lifecycle-owned global/agent provider contributions.
 * @param ctx DSH Host context.
 * @param options Active profile directories and skills configuration.
 * @returns Installed manager, for diagnostics and isolated verification.
 */
export function installSkills(ctx, options) {
  const manager = new SkillsManager(ctx, options)
  ctx.effect(() => () => manager.close(), 'dsh-app: skill work')
  ctx.effect(() => ctx.skills.registerProvider(control => manager.provider(control)), 'dsh-app: global skills provider')
  const registrations = new Map()
  const register = agent => {
    if (registrations.has(agent.id)) return
    const skills = agent.ctx.get('skills')
    registrations.set(agent.id, skills.registerProvider(control => manager.provider(control)))
  }
  const unregister = agent => { registrations.get(agent.id)?.(); registrations.delete(agent.id) }
  ctx.on('agent/created', ({ agent }) => register(agent))
  ctx.on('agent/disposed', ({ agent }) => unregister(agent))
  ctx.on('loader/config-update', () => manager.invalidation())
  ctx.on('loader/partial-dispose', () => manager.invalidation())
  ctx.on('fs/observed', () => manager.invalidation())
  ctx.effect(() => {
    for (const agent of ctx.get('agents')?.list() || []) register(agent)
    return () => { for (const dispose of registrations.values()) dispose(); registrations.clear() }
  }, 'dsh-app: agent skills providers')
  const handlers = new Map([
    ['GET /dsh-app/skills.json', (_request, url) => manager.state(url.searchParams.get('cwd') || undefined)],
    ['GET /dsh-app/skills/detail.json', (_request, url) => manager.detail(url.searchParams.get('uri'), url.searchParams.get('cwd') || undefined)],
    ['POST /dsh-app/skills/action.json', async request => {
      const chunks = [], limit = Math.ceil(manager.options.maxArchiveBytes * 1.4) + manager.options.maxContentBytes
      let bytes = 0
      for await (const chunk of request) { bytes += chunk.length; if (bytes > limit) throw failure('Skill request is too large', 413); chunks.push(chunk) }
      return manager.action(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
    }],
  ])
  for (const path of ['/dsh-app/skills.json', '/dsh-app/skills/detail.json', '/dsh-app/skills/action.json'])
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, async handler(request, response) {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
      const handler = handlers.get(`${request.method} ${path}`)
      if (!handler) { response.writeHead(405); response.end(); return }
      if (request.method === 'POST') {
        let origin
        try { origin = new URL(request.headers.origin) } catch { response.writeHead(403); response.end(); return }
        if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== request.headers.origin || origin.host !== request.headers.host
          || String(request.headers['content-type']).split(';', 1)[0] !== 'application/json') { response.writeHead(403); response.end(); return }
      }
      try {
        const value = await handler(request, new URL(request.url, `http://127.0.0.1:${ctx.webServer.port}`))
        if (response.destroyed) return
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value))
      } catch (error) {
        if (response.destroyed) return
        response.writeHead(error.status || 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify({ error: String(error.message) }))
      }
    } }), 'dsh-app: skills route ' + path)
  return manager
}
