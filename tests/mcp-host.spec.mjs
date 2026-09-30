import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply, Config } from '../lib/mcp/upstream/lib/index.js'
import { installMcp, legacyMcpOwner } from '../lib/mcp/index.mjs'
import { API_METHODS, mountWebRoutes } from '../lib/mcp/upstream/lib/web.js'
import { buildEntryConfig } from '../lib/mcp/upstream/lib/mcp-provision.js'
import { normalizeConnectionRecord, normalizeConnectorDescriptor } from '../lib/mcp/upstream/lib/schema.js'
import { StatusEventHub } from '../lib/mcp/upstream/lib/status-events.js'
import { handleCliBridgeRequest } from '../lib/mcp/upstream/lib/cli-providers.js'
import { loadBundledCatalog } from '../lib/mcp/upstream/lib/catalog.js'

const tableNames = ['connections', 'grants', 'catalog', 'snapshots', 'governance', 'connection_scopes', 'tool_catalog']
const disabledRecord = { key: 'stable-connection', connectorId: 'private-test', kind: 'manual', name: 'Saved connection', serverKey: 'primary', transport: 'streamable-http', serverName: 'kept-server', url: 'https://example.com/mcp', headers: { 'X-Session': 'private-header' }, auth: { mode: 'bearer', bearerToken: 'private-token' }, enabled: false, createdAt: 10, updatedAt: 20 }

function fixture(t, initial = {}) {
  const effects = [], routes = new Map(), registered = new Map(), guards = [], entries = [], domains = [], loaderEntries = new Map(), restrictions = []
  let closed = false
  const tables = new Map(tableNames.map(name => {
    const values = new Map(initial[name] ?? [])
    return [name, { values, get: async key => values.get(key), put: async (key, value) => values.set(key, value), delete: async key => values.delete(key), entries: () => values.entries() }]
  }))
  const tools = { register(definition) { registered.set(definition.name, definition); return () => registered.delete(definition.name) }, guard(fn) { guards.push(fn); return () => guards.splice(guards.indexOf(fn), 1) }, schemas: () => [{ name: 'mcp__kept-server__read' }, ...registered.values()], restrict(value) { restrictions.push(value); return () => restrictions.splice(restrictions.indexOf(value), 1) } }
  const events = new Map(), agents = [{ id: 'existing', ctx: { tools } }]
  const ctx = {
    logger: () => ({ info() {}, warn() {}, error() {} }),
    effect(start) { const dispose = start(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
    inject(names, callback) { if (names.every(name => ctx[name])) callback(ctx) },
    get: name => name === 'pluginInventory' ? { list: async () => ({ entries }) } : ctx[name],
    on(name, fn) { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); return () => events.set(name, events.get(name).filter(item => item !== fn)) },
    storageDomain: { async open(definition) { domains.push(definition); return { tables, close: async () => { closed = true } } } },
    tools,
    agents: { list: () => agents },
    workspaceRegistry: { list: () => [], get: () => undefined, findForAgent: () => undefined },
    loader: { resolve(id) { if (!loaderEntries.has(id)) throw new Error('not found'); return loaderEntries.get(id) }, async create(item) { loaderEntries.set(item.id, { options: item }); return item.id }, async update(id, patch) { Object.assign(loaderEntries.get(id).options, patch) }, async remove(id) { loaderEntries.delete(id) } },
    webRuntime: { trustedHosts: ['dsh.example:443'] },
    webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
    connection: { requestRejection: () => undefined },
  }
  t.after(async () => { for (const dispose of effects.reverse()) await dispose() })
  return { ctx, effects, routes, tables, registered, guards, domains, entries, restrictions, loaderEntries, get closed() { return closed } }
}

async function invoke(handler, { method = 'POST', origin = 'http://localhost:19876', omitOrigin = false, host = 'localhost:19876', body = { method: 'status' }, contentType = 'application/json' } = {}) {
  const request = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))])
  Object.assign(request, { method, url: '/', headers: { host, origin, 'content-type': contentType } })
  if (omitOrigin) delete request.headers.origin
  const response = new EventEmitter()
  Object.assign(response, { chunks: [], writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true }, end(body) { this.body = body; this.ended = true }, write(body) { this.chunks.push(body) } })
  await handler(request, response)
  return response
}

test('vendored engine restores the original domain and exposes every MCP capability without the removed package', async t => {
  const policy = { key: 'active', version: 1, revision: 3, updatedAt: 100, rules: [{ id: 'deny', scope: 'connection', effect: 'deny', connectorId: 'private-test' }], history: [] }
  const binding = { key: 'active', version: 1, revision: 2, updatedAt: 100, bindings: [{ connectionKey: disabledRecord.key, global: true, projects: [] }], history: [] }
  const f = fixture(t, { connections: [[disabledRecord.key, disabledRecord]], governance: [['active', policy]], connection_scopes: [['active', binding]] })
  const { api } = await apply(f.ctx, Config({ catalogUrl: '', persistSecrets: false }))
  assert.equal(f.domains[0].name, 'mcp_connector')
  assert.equal(f.domains[0].version, 1)
  assert.deepEqual([...f.tables.keys()], tableNames)
  assert.equal(loadBundledCatalog().length > 0, true)
  for (const name of ['mcp_connector_catalog', 'mcp_connector_connect', 'mcp_connector_configure', 'mcp_connector_import_json', 'mcp_connector_export_config', 'mcp_connector_snapshot', 'mcp_connector_tools_list', 'mcp_connector_tool_search', 'mcp_connector_tool_detail']) assert.equal(f.registered.has(name), true, name)
  for (const name of API_METHODS.keys()) assert.equal(typeof api[name], 'function', name)
  const status = await api.status()
  assert.equal(status.detail.items[0].key, disabledRecord.key)
  assert.equal(status.detail.items[0].enabled, false)
  assert.equal(JSON.stringify(status).includes('private-token'), false)
  assert.equal(JSON.stringify(status).includes('private-header'), false)
  assert.equal((await api.governance()).detail.revision, 3)
  assert.equal((await api.scopeContext()).detail.revision, 2)
  assert.ok(f.guards.some(guard => guard({ name: 'mcp__kept-server__read' })?.includes('拒绝')))
  const exported = await api.exportConfig()
  assert.equal(JSON.parse(exported.detail.json).format, 'dsh-mcp-connector.redacted')
  assert.equal(exported.detail.json.includes('private-token'), false)
  const version = await api.versionStatus(true)
  assert.equal(version.detail.integrated, true)
  assert.equal(version.detail.engineVersion, '0.2.63')
  assert.equal(version.detail.updateAvailable, false)
  for (const dispose of f.effects.splice(0).reverse()) await dispose()
  assert.equal(f.closed, true)
  assert.equal(f.registered.size, 0)
  assert.equal(f.routes.size, 0)
  assert.equal(f.guards.length, 0)
})

test('snapshots preserve private configuration while API summaries and export remain redacted', async t => {
  const customRecord = { ...disabledRecord, connectorId: '__custom__' }
  const f = fixture(t, { connections: [[customRecord.key, customRecord]] })
  const { api } = await apply(f.ctx, Config({ catalogUrl: '', persistSecrets: true }))
  const created = await api.createSnapshot('before edit')
  assert.equal(created.ok, true)
  const id = created.detail.id
  assert.equal(f.tables.get('snapshots').values.get(id).records[0].auth.bearerToken, 'private-token')
  assert.equal(JSON.stringify(await api.listSnapshots()).includes('private-token'), false)
  assert.equal((await api.previewSnapshot(id)).ok, true)
  assert.equal((await api.renameConnection(disabledRecord.key, 'Renamed')).ok, true)
  assert.equal((await api.status()).detail.items[0].name, 'Renamed')
  assert.equal((await api.restoreSnapshot(id)).ok, true)
  assert.equal((await api.status()).detail.items[0].name, 'Saved connection')
  assert.equal(f.tables.get('connections').values.get(disabledRecord.key).auth.bearerToken, 'private-token')
})

test('own and legacy routes authenticate, require browser origin and dispatch the complete scoped parameters', async t => {
  const f = fixture(t), hub = new StatusEventHub(), seen = []
  const api = new Proxy({}, { get: (_, name) => (...args) => { seen.push([name, ...args]); return { ok: true, detail: { name } } } })
  const dispose = mountWebRoutes(f.ctx, api, { eventHub: hub }); t.after(dispose); t.after(() => hub.dispose())
  const handler = f.routes.get('/dsh-app/mcp/api')
  f.ctx.connection.requestRejection = () => 401
  assert.equal((await invoke(handler)).status, 401)
  f.ctx.connection.requestRejection = () => undefined
  assert.equal((await invoke(handler, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await invoke(handler, { omitOrigin: true })).status, 403)
  const noOrigin = await invoke(handler, { origin: null }); assert.equal(noOrigin.status, 403)
  assert.equal((await invoke(handler, { contentType: 'text/plain' })).status, 415)
  assert.equal((await invoke(handler, { body: { method: '__proto__' } })).status, 400)
  assert.equal((await invoke(handler, { body: 'x'.repeat(1024 * 1024 + 1) })).status, 400)
  for (const path of ['/dsh-app/mcp/api', '/mcp-connector/api']) {
    const result = await invoke(f.routes.get(path), { body: { method: 'healthCheck', params: { connectorId: 'test', workspaceId: 'work', connectionKey: 'key' } } })
    assert.equal(result.status, 200)
    assert.deepEqual(seen.at(-1), ['healthCheck', 'test', 'work', 'key'])
  }
  assert.equal(f.routes.has('/mcp-connector/ui'), false)
  assert.equal((await invoke(f.routes.get('/dsh-app/mcp/assets/qcc-logo.svg'), { method: 'GET' })).status, 200)
  const response = await invoke(f.routes.get('/dsh-app/mcp/events'), { method: 'GET' })
  assert.equal(response.status, 200)
  hub.publish('connections')
  const event = JSON.parse(response.chunks.at(-1).split('data: ')[1])
  assert.deepEqual(Object.keys(event), ['type', 'sequence', 'at'])
  hub.dispose(); assert.equal(response.ended, true)
})

test('zod 4 accepts nonempty credentials maps; provisioning preserves transports and local CLI bridge behavior', async () => {
  const stdio = normalizeConnectionRecord({ ...disabledRecord, transport: 'stdio', command: 'custom-server', args: ['user-argument'], env: { API_TOKEN: 'kept' }, cwd: process.cwd(), url: undefined })
  const entry = buildEntryConfig(stdio, new Map())
  assert.equal(entry.env.API_TOKEN, 'kept')
  assert.deepEqual(entry.args, ['user-argument'])
  const http = buildEntryConfig(normalizeConnectionRecord(disabledRecord), new Map())
  assert.equal(http.headers.Authorization, 'Bearer private-token')
  assert.equal(http.headers['X-Session'], 'private-header')
  normalizeConnectorDescriptor({ id: 'maps', name: 'maps', auth: { mode: 'none' }, servers: [{ serverKey: 'one', serverName: 'maps', command: 'node', args: [], env: { PATH_HINT: 'value' }, transport: 'stdio' }] })
  const dingtalk = { ...stdio, connectorId: 'dingtalk', command: 'npx', args: ['--yes', '--legacy-peer-deps', '--package', 'dsh-mcp-connector@0.2.63', '--package', 'dingtalk-workspace-cli@1.0.61', 'dsh-mcp-cli-bridge', '--provider', 'dingtalk-dws'] }
  const bridge = buildEntryConfig(dingtalk, new Map())
  assert.equal(bridge.args.some(value => value.includes('dsh-mcp-connector@')), false)
  assert.equal(bridge.args.includes('dingtalk-workspace-cli@1.0.61'), true)
  assert.equal(existsSync(bridge.args[5]), true)
  assert.equal(bridge.args[4], process.execPath)
  const initialize = await handleCliBridgeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  assert.equal(initialize.result.capabilities.tools.listChanged, false)
  const tools = await handleCliBridgeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { preflight: async () => {} })
  assert.equal(tools.result.tools.length > 0, true)
})

test('an enabled legacy MCP owner prevents opening its domain or creating competing services', async t => {
  const f = fixture(t)
  f.entries.push({ moduleName: 'dsh-mcp-connector', enabled: true, fiberPhase: 'loading' })
  assert.equal(await legacyMcpOwner(f.ctx), true)
  const result = await installMcp(f.ctx)
  assert.equal(result.legacyOwner, true)
  assert.equal(f.domains.length, 0)
  assert.equal(f.registered.size, 0)
  assert.equal(f.routes.has('/mcp-connector/api'), false)
  assert.equal((await invoke(f.routes.get('/dsh-app/mcp/api'))).status, 503)
  f.entries[0].enabled = false
  assert.equal(await legacyMcpOwner(f.ctx), false)
})

test('released Cordis validates the child plugin and tears down its MCP contributions', async t => {
  const runtime = process.env.DSH_APP_TEST_RUNTIME
  if (!runtime) { t.skip('DSH_APP_TEST_RUNTIME selects the released Cordis artifact'); return }
  const { Context } = await import(pathToFileURL(join(runtime, 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)
  const f = fixture(t), root = new Context()
  const services = await root.plugin({ name: 'fixture-mcp-services', apply(ctx) { for (const name of ['tools', 'storageDomain', 'loader', 'workspaceRegistry', 'webServer', 'webRuntime', 'connection', 'agents']) ctx.provide(name, f.ctx[name]); ctx.provide('pluginInventory', { list: async () => ({ entries: [] }) }) } })
  t.after(() => services.dispose())
  let installed
  const own = await root.plugin({ name: 'test-app-mcp', inject: ['tools', 'storageDomain', 'loader', 'workspaceRegistry', 'pluginInventory'], async apply(ctx) { installed = await installMcp(ctx, { mcp: { catalogUrl: '', persistSecrets: false } }) } })
  t.after(() => own.dispose())
  assert.equal(installed.integrated, true)
  assert.equal((await installed.api.catalog()).ok, true)
  assert.equal(f.routes.has('/dsh-app/mcp/api'), true)
  await own.dispose()
  assert.equal(f.registered.size, 0)
  assert.equal(f.routes.size, 0)
  assert.equal(f.closed, true)
})
