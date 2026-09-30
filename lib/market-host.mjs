/** On-demand plugin discovery and persistent changes applied by the stopped desktop owner. */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gt, valid } from 'semver'
import { readJson, writeJson } from './files.mjs'
import { redact } from '../desktop/startup-log.mjs'
import { APPLY_PLUGIN_UPDATES } from '../desktop/parent-ipc.mjs'
import { readMarketOperations, queueMarketOperation, cancelMarketOperation, readMarketResults } from '../desktop/market-operations.mjs'
import { pendingPluginUpdates, cancelPendingPluginUpdate } from '../desktop/pending-updates.mjs'

const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const UPDATE_SCHEMA = 'dsh-market/update-api/v1'
const INTEGRATED_PREDECESSORS = new Set(['dshmarket', 'dsh-mcp-connector', 'dsh-better-sidebar', 'dsh-cost-meter', 'dsh-context', '@michengai/dsh-codex-ui', '@linxin666/dsh-client-ui-skill-explorer', '@michengai/dsh-skills-manager'])
const defaults = { catalogUrl: 'https://awesome-dsh-plugin.com/plugins.json', registryUrl: 'https://registry.npmjs.org', cacheMs: 300000, timeoutMs: 30000, maxResponseBytes: 16777216, concurrency: 4 }

function optionsOf(input) {
  const value = { ...defaults, ...input }
  for (const field of ['catalogUrl', 'registryUrl']) {
    const url = new URL(value[field])
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`market.${field} must be a credential-free HTTPS URL`)
  }
  for (const [field, min, max] of [['cacheMs', 1000, 86400000], ['timeoutMs', 1000, 120000], ['maxResponseBytes', 65536, 67108864], ['concurrency', 1, 8]])
    if (!Number.isInteger(value[field]) || value[field] < min || value[field] > max) throw new Error(`Invalid market.${field}`)
  value.registryUrl = value.registryUrl.replace(/\/$/, '')
  return value
}

/** Keep only catalog fields used by the client; reject unusable package sources. */
export function catalogOf(value) {
  if (!value || !Array.isArray(value.plugins) || value.plugins.length > 30000) throw new Error('Invalid plugin catalog')
  const plugins = []
  for (const row of value.plugins) {
    if (!row || typeof row.name !== 'string') continue
    const npmName = row.npm || row.packageName
    const npm = typeof npmName === 'string' && PACKAGE.test(npmName) ? npmName : null
    const source = typeof row.install === 'string' ? row.install : ''
    const github = /^(?:github:|git\+https:\/\/github\.com\/)[\w.-]+\/[\w.-]+(?:\.git)?(?:#[\w./:-]+)?$/.test(source) ? source : null
    if ((!npm && !github) || INTEGRATED_PREDECESSORS.has(npm)) continue
    const categories = (Array.isArray(row.category) ? row.category : [row.category]).filter(item => typeof item === 'string' && item.length <= 100)
    const description = typeof row.description === 'string' ? { en: row.description.slice(0, 5000) } : Object.fromEntries(Object.entries(row.description ?? {}).filter(([key, text]) => /^[a-z-]+$/i.test(key) && typeof text === 'string').map(([key, text]) => [key, text.slice(0, 5000)]))
    let url = null
    try { const parsed = new URL(row.url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href } catch { /* Catalog entries may omit a repository URL. */ }
    plugins.push({ id: npm || github, name: row.name.slice(0, 200), packageName: npm, description, category: categories, version: valid(row.version) ? row.version : null, url, install: npm || github, owner: typeof row.owner === 'string' ? row.owner.slice(0, 200) : '', stars: Number.isSafeInteger(row.stars) && row.stars >= 0 ? row.stars : null, deprecated: row.deprecated === true })
  }
  return { updated: typeof value.updated === 'string' ? value.updated : null, count: plugins.length, categories: value.categories && typeof value.categories === 'object' ? value.categories : {}, plugins }
}

function sourceOf(spec) {
  if (/^(?:git\+|github:|https:\/\/github\.com\/)/.test(spec)) return 'github'
  if (/^(?:file:|link:|workspace:)/.test(spec)) return 'local'
  return 'npm'
}

/** Own lazy catalog/version requests, without installing into a running Node module graph. */
export class PluginMarket {
  constructor(ctx, { home, profile, directory, market }, dependencies = {}) {
    this.ctx = ctx
    this.home = home
    this.profile = profile
    this.directory = directory
    this.options = optionsOf(market)
    this.fetch = dependencies.fetch || globalThis.fetch
    this.now = dependencies.now || Date.now
    this.canRestart = dependencies.canRestart || (() => Boolean((process.env.DSH_APP_OWNER || process.env.DSH_LOCAL_DESKTOP_OWNER) && process.connected && typeof process.send === 'function'))
    this.sendRestart = dependencies.sendRestart || (() => new Promise((resolve, reject) => {
      try { process.send({ type: APPLY_PLUGIN_UPDATES }, error => error ? reject(error) : resolve()) }
      catch (error) { reject(error) }
    }))
    this.controllers = new Set()
    this.inflight = new Set()
    this.versionCache = new Map()
    this.requests = new Map()
    this.lastOperation = null
    this.checking = null
    this.closed = false
    this.restarting = false
    this.cachePath = join(home, 'dsh-app', 'market-catalog.json')
  }

  json(url) {
    if (this.closed) return Promise.reject(new Error('Plugin market is closing'))
    const controller = new AbortController()
    this.controllers.add(controller)
    const timer = setTimeout(() => controller.abort(new Error('Plugin source request timed out')), this.options.timeoutMs)
    const pending = (async () => { try {
      const response = await this.fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, redirect: 'error' })
      if (!response.ok) throw new Error(`Plugin source returned HTTP ${response.status}`)
      const length = Number(response.headers.get('content-length'))
      if (length > this.options.maxResponseBytes) throw new Error('Plugin source response is too large')
      const chunks = []
      let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > this.options.maxResponseBytes) { controller.abort(); throw new Error('Plugin source response is too large') }
        chunks.push(Buffer.from(chunk))
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } finally { clearTimeout(timer); this.controllers.delete(controller) } })()
    this.inflight.add(pending)
    return pending.finally(() => this.inflight.delete(pending))
  }

  async catalog(force = false) {
    if (this.catalogRequest) return this.catalogRequest
    this.catalogRequest = (async () => {
      let cached = null, previous = null
      try { cached = await readJson(this.cachePath, null) }
      catch (error) { if (!(error instanceof SyntaxError)) throw error } // A partial, regenerable cache must not block a fresh catalog request.
      if (cached?.catalog) {
        try { previous = catalogOf(cached.catalog) }
        catch (error) { if (error.message !== 'Invalid plugin catalog') throw error } // Old or corrupt catalog data is replaced after a successful fetch.
      }
      if (!force && previous && this.now() - cached.fetchedAt < this.options.cacheMs) return { ...previous, fetchedAt: cached.fetchedAt, stale: false }
      try {
        const catalog = catalogOf(await this.json(this.options.catalogUrl))
        const fetchedAt = this.now()
        await writeJson(this.cachePath, { fetchedAt, catalog })
        return { ...catalog, fetchedAt, stale: false }
      } catch (error) {
        if (!previous) throw error
        return { ...previous, fetchedAt: cached.fetchedAt, stale: true, error: redact(String(error.message)) }
      }
    })().finally(() => { this.catalogRequest = null })
    return this.catalogRequest
  }

  installed() {
    const manifest = JSON.parse(readFileSync(join(this.profile, 'package.json'), 'utf8'))
    const bundles = manifest.dsh?.profile?.bundles ?? []
    return Object.entries(manifest.dependencies ?? {}).filter(([name]) => PACKAGE.test(name) && name !== '@deepseek-ai/dsh').map(([name, declaredVersion]) => {
      let installed = null
      const path = join(this.profile, 'node_modules', name, 'package.json')
      if (existsSync(path)) installed = JSON.parse(readFileSync(path, 'utf8'))
      const version = typeof installed?.version === 'string' ? installed.version : null
      const info = this.versionCache.get(name)
      const enabled = bundles.includes(name)
      return { name, packageName: name, version, declaredVersion, enabled, latestVersion: info?.version ?? null, updateAvailable: Boolean(valid(version) && info?.version && gt(info.version, version)), source: sourceOf(declaredVersion), phase: installed ? enabled ? 'active' : 'disabled' : 'missing', managed: true, protected: name === 'dsh-app', error: info?.error ?? null, checkedAt: info?.checkedAt ?? null, description: typeof installed?.description === 'string' ? installed.description : '' }
    })
  }

  async latest(name, force = false) {
    if (!PACKAGE.test(name)) throw new Error('Invalid plugin package name')
    const cache = this.versionCache.get(name)
    if (!force && cache && this.now() - cache.checkedAt < this.options.cacheMs) {
      if (cache.error) throw new Error(cache.error)
      return cache
    }
    if (this.requests.has(name)) return this.requests.get(name)
    const operation = (async () => {
      try {
        const metadata = await this.json(`${this.options.registryUrl}/${encodeURIComponent(name)}/latest`)
        if (metadata.name !== name || !valid(metadata.version) || !metadata.dsh?.bundle?.patch) throw new Error('Registry did not return a matching DSH plugin bundle')
        const value = { version: metadata.version, checkedAt: this.now(), metadata }
        this.versionCache.set(name, value)
        return value
      } catch (error) {
        this.versionCache.set(name, { version: null, checkedAt: this.now(), error: redact(String(error.message)) })
        throw error
      }
    })().finally(() => this.requests.delete(name))
    this.requests.set(name, operation)
    return operation
  }

  async checkUpdates() {
    if (this.checking) return this.checking
    const names = this.installed().filter(row => row.source === 'npm').map(row => row.name)
    let index = 0
    this.checkProgress = { done: 0, total: names.length }
    this.checking = Promise.all(Array.from({ length: Math.min(this.options.concurrency, names.length) }, async () => {
      while (index < names.length && !this.closed) {
        const name = names[index++]
        try { await this.latest(name, true) } catch { /* Each installed row reports its own network failure. */ }
        this.checkProgress.done++
      }
    })).finally(() => { this.checking = null })
    await this.checking
    return this.state()
  }

  async state() {
    const installed = this.installed()
    const inventory = this.ctx.get('pluginInventory')
    if (inventory) {
      const { entries } = await inventory.list()
      for (const row of installed) {
        const matched = entries.filter(entry => entry.moduleName === row.name || entry.moduleName.startsWith(`${row.name}/`))
        if (matched.some(entry => entry.fiberPhase === 'failed')) row.phase = 'failed'
      }
    }
    const legacy = pendingPluginUpdates(this.profile).map(item => ({ ...item, id: `legacy:${item.packageName}@${item.version}`, kind: 'update', spec: `${item.packageName}@${item.version}`, legacy: true }))
    const pending = [...legacy, ...readMarketOperations(this.profile)]
    const history = readMarketResults(this.profile)
    const lastPending = pending.at(-1)
    const pendingOutcome = lastPending && history.find(item => item.id === lastPending.id)
    const operation = pendingOutcome || lastPending || this.lastOperation || history.at(-1) || null
    return { installed, pending, history, operation: operation ? { ...operation, operationId: operation.id, state: operation.state || operation.status || 'queued', installedVersion: operation.installedVersion ?? operation.actualVersion ?? null, error: operation.error ?? (operation.status === 'failed' ? operation.message : null), detail: operation.status === 'rolled-back' ? operation.message : operation.detail ?? null } : null, restartRequired: pending.length > 0, pendingCount: pending.length, capabilities: { restart: this.canRestart(), install: true, update: true, uninstall: true }, checking: Boolean(this.checking), checkProgress: this.checkProgress ?? null }
  }

  async queue(request) {
    if (this.restarting) throw new Error('Desktop restart has already been requested')
    if (!request || !['install', 'update', 'uninstall'].includes(request.kind)) throw new Error('Invalid plugin operation')
    let name = request.packageName
    let spec = null
    let version = null
    const installed = this.installed()
    if (request.kind === 'uninstall') {
      if (!PACKAGE.test(name) || !installed.some(row => row.name === name)) throw new Error('Plugin is not installed in this profile')
      if (name === 'dsh-app') throw new Error('DSH App cannot uninstall its own running desktop owner')
    } else {
      if (request.kind === 'install' && typeof request.spec === 'string' && !name) {
        const npm = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@([^\s]+))?$/.exec(request.spec)
        if (npm) {
          name = npm[1]
          if (npm[2] && npm[2] !== 'latest') {
            if (!valid(npm[2])) throw new Error('Enter an exact version or latest')
            const metadata = await this.json(`${this.options.registryUrl}/${encodeURIComponent(name)}/${encodeURIComponent(npm[2])}`)
            if (metadata.name !== name || metadata.version !== npm[2] || !metadata.dsh?.bundle?.patch) throw new Error('Requested plugin bundle version is unavailable')
            version = metadata.version
            spec = `${name}@${version}`
          }
        } else {
          const github = /^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#([\w./-]+))?$/.exec(request.spec)
          if (!github) throw new Error('Use an npm package or a public GitHub repository source')
          const revision = github[3] || 'HEAD'
          const metadata = await this.json(`https://raw.githubusercontent.com/${github[1]}/${github[2]}/${revision}/package.json`)
          if (!PACKAGE.test(metadata.name) || !valid(metadata.version) || !metadata.dsh?.bundle?.patch) throw new Error('GitHub source does not declare a DSH plugin bundle')
          name = metadata.name
          version = metadata.version
          spec = `git+https://github.com/${github[1]}/${github[2]}.git${github[3] ? `#${github[3]}` : ''}`
        }
      }
      if (!PACKAGE.test(name) || name === '@deepseek-ai/dsh') throw new Error('Update the DSH core through the desktop core-update control')
      const before = installed.find(row => row.name === name)
      if (request.kind === 'update' && !before) throw new Error('Plugin is not installed in this profile')
      if (request.kind === 'update' && before.source !== 'npm') {
        const github = /^(?:git\+https:\/\/github\.com\/|github:)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#([\w./-]+))?$/.exec(before.declaredVersion)
        if (!github) throw new Error('This local or archived source must be replaced using Install from source')
        const metadata = await this.json(`https://raw.githubusercontent.com/${github[1]}/${github[2]}/${github[3] || 'HEAD'}/package.json`)
        if (metadata.name !== name || !valid(metadata.version)) throw new Error('GitHub source identity has changed')
        version = metadata.version
        spec = before.declaredVersion
      } else if (!spec) {
        const latest = await this.latest(name)
        version = latest.version
        spec = `${name}@${version}`
      }
      if (before?.version && valid(before.version) && valid(version) && gt(before.version, version)) throw new Error('Plugin changes cannot silently downgrade an installed version')
    }
    if (name === '@deepseek-ai/dsh' || !PACKAGE.test(name)) throw new Error('Invalid plugin package')
    if (INTEGRATED_PREDECESSORS.has(name) && request.kind !== 'uninstall') throw new Error('This functionality is integrated into DSH App; its retired plugin cannot run alongside it')
    if (this.restarting || this.closed) throw new Error('Desktop restart or shutdown began before the change could be queued')
    const before = installed.find(row => row.name === name)
    if (pendingPluginUpdates(this.profile).some(item => item.packageName === name)) throw new Error('An earlier update for this plugin is pending; cancel it in the market before choosing a different change')
    const item = { id: randomUUID(), kind: request.kind, packageName: name, spec, version, beforeVersion: before?.version ?? null, enabledBefore: before?.enabled ?? false, queuedAt: this.now() }
    queueMarketOperation(this.profile, item)
    this.lastOperation = { ...item, state: 'queued' }
    return { operationId: item.id, state: 'queued', restartRequired: true }
  }

  cancel(name) {
    if (this.restarting) throw new Error('Cannot cancel while the desktop is restarting')
    if (!PACKAGE.test(name)) throw new Error('Invalid plugin package')
    cancelMarketOperation(this.profile, name)
    cancelPendingPluginUpdate(this.profile, name)
    this.lastOperation = null
    return { ok: true }
  }

  async restart() {
    if (!this.canRestart()) throw new Error('Start DSH through the desktop client to apply changes; a standalone Web process needs its owner to restart it')
    if (this.restarting) throw new Error('Desktop restart has already been requested')
    this.restarting = true
    try { await this.sendRestart(); return { ok: true, managedBy: 'desktop-host' } }
    catch (error) { this.restarting = false; throw error }
  }

  /** Abort source reads and wait until owned operations stop before disposal completes. */
  async close() {
    this.closed = true
    for (const controller of this.controllers) controller.abort(new Error('Plugin market is closing'))
    await Promise.allSettled([...this.inflight, ...this.requests.values(), this.catalogRequest, this.checking].filter(Boolean))
  }
}

async function bodyOf(request) {
  let bytes = 0
  const chunks = []
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 16384) throw new Error('Plugin operation request is too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function updateInfo(row) {
  return { name: row.name, source: row.source, installedVersion: row.version, latestVersion: row.latestVersion, updateAvailable: row.updateAvailable, error: row.error }
}

function updateOperation(item) {
  const state = item.state || item.status || 'queued'
  const failure = item.error || (state === 'failed' ? item.message : null)
  return { schema: UPDATE_SCHEMA, operationId: item.id, kind: 'update', packageName: item.packageName, state, createdAt: item.queuedAt, startedAt: item.startedAt ?? null, finishedAt: item.finishedAt ?? null, beforeVersion: item.beforeVersion ?? null, installedVersion: item.installedVersion ?? item.actualVersion ?? null, progress: { phase: state, done: state === 'succeeded' ? 1 : 0, total: 1, percent: state === 'succeeded' ? 100 : 0, currentPackage: item.packageName, detail: state === 'succeeded' ? null : 'Changes are applied by the desktop during restart', downloaded: null, size: null }, outcome: { refreshRequired: state === 'succeeded', restartRequired: state === 'queued', rollback: { available: false, state: 'unavailable', detail: 'Desktop diagnostics owns backup recovery' } }, failure: failure ? { code: 'PLUGIN_CHANGE_FAILED', message: failure, retryable: true } : null }
}

/** Mount the own market and the public update-provider v1 endpoints used by MCP. */
export function installPluginMarket(ctx, options) {
  const market = new PluginMarket(ctx, options)
  ctx.effect(() => () => market.close(), 'dsh-app: plugin source requests')
  const bootId = randomUUID()
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const legacyOwnsUpdates = market.installed().some(row => row.name === 'dshmarket' && row.enabled)
  const handlers = new Map([
    ['GET /dsh-app/market/catalog', async (_request, url) => market.catalog(url.searchParams.get('force') === '1')],
    ['GET /dsh-app/market/state', () => market.state()],
    ['POST /dsh-app/market/operations', async request => market.queue(await bodyOf(request))],
    ['POST /dsh-app/market/cancel', async request => market.cancel((await bodyOf(request)).packageName)],
    ['POST /dsh-app/market/check-updates', () => market.checkUpdates()],
    ['POST /dsh-app/market/restart', () => market.restart()],
    ['GET /dsh-market/api/v1/capabilities', () => ({ schema: UPDATE_SCHEMA, apiVersion: 1, stability: 'beta', marketVersion: `dsh-app/${version}`, profile: 'web', bootId, runtime: market.canRestart() ? 'desktop' : 'web', features: { check: true, update: false, progress: false, rollback: false, restart: market.canRestart(), updatesSummary: true }, restart: { supported: market.canRestart(), managedBy: market.canRestart() ? 'desktop-host' : 'operator', supervisor: false, debugger: false }, operationRetention: 'persistent-profile', operationLimit: 50, endpoints: { updates: '/dsh-market/api/v1/updates', updatesSummary: '/dsh-market/api/v1/updates/summary', operations: '/dsh-market/api/v1/operations', restart: '/dsh-market/api/v1/restart' } })],
    ['GET /dsh-market/api/v1/updates', async (_request, url) => {
      const name = url.searchParams.get('name')
      const row = market.installed().find(item => item.name === name)
      if (!row) throw new Error('Plugin is not installed')
      try { await market.latest(name, url.searchParams.get('force') === '1') } catch { /* The update response reports the failed check. */ }
      return { schema: UPDATE_SCHEMA, package: { ...updateInfo(market.installed().find(item => item.name === name)), channelSwitch: null } }
    }],
    ['GET /dsh-market/api/v1/updates/summary', async () => {
      const state = await market.checkUpdates()
      const checked = state.installed.filter(row => row.checkedAt && !row.error)
      const packages = checked.filter(row => row.updateAvailable).map(updateInfo)
      return { schema: UPDATE_SCHEMA, checked: checked.length, updatable: packages.length, packages }
    }],
    ['POST /dsh-market/api/v1/updates', () => { throw new Error('Open Plugins → Market to queue this update, then choose Restart and apply') }],
    ['GET /dsh-market/api/v1/operations', (_request, url) => {
      const id = url.searchParams.get('operationId')
      const item = readMarketResults(market.profile).find(row => row.id === id) || readMarketOperations(market.profile).find(row => row.id === id)
      if (!item) throw new Error('Plugin operation was not found')
      return { schema: UPDATE_SCHEMA, operation: updateOperation(item) }
    }],
    ['POST /dsh-market/api/v1/restart', async () => ({ schema: UPDATE_SCHEMA, ...await market.restart() })],
  ])
  for (const path of new Set([...handlers.keys()].map(key => key.slice(key.indexOf(' ') + 1))))
    if (!legacyOwnsUpdates || !path.startsWith('/dsh-market/'))
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, async handler(request, response) {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
      const handler = handlers.get(`${request.method} ${path}`)
      if (!handler) { response.writeHead(405); response.end(); return }
      if (request.method === 'POST') {
        let origin
        try { origin = new URL(request.headers.origin) } catch { response.writeHead(403); response.end(); return }
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.host || origin.username || origin.password) { response.writeHead(403); response.end(); return }
      }
      try {
        const payload = await handler(request, new URL(request.url, `http://127.0.0.1:${ctx.webServer.port}`))
        if (response.destroyed) return
        response.writeHead(request.method === 'POST' && path.endsWith('/operations') || request.method === 'POST' && path.endsWith('/updates') ? 202 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify(payload))
      } catch (error) {
        if (response.destroyed) return
        response.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify({ error: redact(String(error.message)) }))
      }
    } }))
  return market
}
