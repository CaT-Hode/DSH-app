import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { apply, Config } from '../lib/sidebar/upstream/index.mjs'
import { installSidebar } from '../lib/sidebar/index.mjs'

async function fixture(t) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-app-sidebar-'))
  const routes = new Map(), upgrades = new Map(), effects = [], events = new Map(), tools = new Map()
  const descriptor = { ns: 'owned-app', revision: 1, value: { sidebar: { tasksViewMode: 'graph', agentOpenTools: false, tabsEnabled: {}, viewersEnabled: {}, pluginSettings: {} }, balance: { enabled: true } }, user: { sidebar: { tasksViewMode: 'graph' } } }
  const fiber = {}
  const ctx = {
    fiber,
    logger: { info() {}, warn() {} },
    webRuntime: { trustedHosts: [] },
    webServer: {
      register(route) { assert.equal(routes.has(route.path), false); routes.set(route.path, route.handler); return () => routes.delete(route.path) },
      registerUpgrade(route) { assert.equal(upgrades.has(route.path), false); upgrades.set(route.path, route.handler); return () => upgrades.delete(route.path) },
    },
    sessions: { get: sessionId => sessionId === 'session-main' ? { header: { cwd: workspace }, snapshotEvents: () => [] } : undefined },
    tools: { register(definition) { tools.set(definition.name, definition); return () => tools.delete(definition.name) } },
    loader: { entries: () => [{ options: { id: descriptor.ns, name: 'dsh-app' }, fiber }], await: async () => undefined },
    settings: {
      describe: () => [descriptor],
      configure: () => () => {},
      async update(namespace, patch, revision) {
        assert.equal(namespace, descriptor.ns)
        if (revision !== undefined) assert.equal(revision, descriptor.revision)
        descriptor.value = { ...descriptor.value, ...patch }
        descriptor.revision += 1
      },
    },
    effect(start) { const dispose = start(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
    inject(names, callback) { if (names.every(name => ctx[name] !== undefined)) { const dispose = callback(ctx); if (typeof dispose === 'function') effects.push(dispose) } },
    get: name => ctx[name],
    on(name, listener) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener); return () => events.get(name).delete(listener) },
  }
  const dispose = async () => { for (const effect of effects.splice(0).reverse()) await effect() }
  t.after(async () => { await dispose(); await rm(workspace, { recursive: true, force: true }) })
  return { ctx, routes, upgrades, tools, descriptor, workspace, dispose, events }
}

async function invoke(handler, { path = '/sidebar/api', method = 'POST', body = {}, host = 'localhost:19876', origin = 'http://localhost:19876', headers = {} } = {}) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))])
  Object.assign(request, { method, url: path, headers: { host, origin, 'content-type': 'application/json', ...headers } })
  const response = new EventEmitter()
  Object.assign(response, { writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true }, end(body) { this.body = body; this.ended = true } })
  await handler(request, response)
  return response
}

async function api(f, method, payload = {}) {
  const response = await invoke(f.routes.get('/sidebar/api'), { path: `/sidebar/api/${method}`, body: payload })
  return { status: response.status, ...JSON.parse(response.body) }
}

test('owned Host exposes the preserved routes, file operations and sidebar settings without the predecessor', async t => {
  const f = await fixture(t)
  apply(f.ctx, Config({}))
  assert.deepEqual([...f.routes.keys()], ['/sidebar/api', '/sidebar/upload', '/sidebar/bundle', '/sidebar/archive', '/sidebar/file', '/sidebar/html'])
  assert.deepEqual([...f.upgrades.keys()], ['/sidebar/ws/agent-opens', '/sidebar/ws/fs-watch'])
  const initial = await api(f, 'settings.get')
  assert.equal(initial.value.value.tasksViewMode, 'graph')
  assert.equal(initial.value.value.balance, undefined)
  await api(f, 'settings.update', { patch: { tasksViewMode: 'tree', pluginSettings: { editor: { pinned: ['vscode'] } } }, expectedRevision: 1 })
  assert.equal(f.descriptor.value.sidebar.tasksViewMode, 'tree')
  assert.deepEqual(f.descriptor.value.sidebar.pluginSettings.editor.pinned, ['vscode'])
  assert.equal(f.descriptor.value.balance.enabled, true)
  assert.equal((await api(f, 'settings.get')).value.revision, 2)
  const path = join(f.workspace, 'saved.txt')
  assert.equal((await api(f, 'fs.write', { sessionId: 'session-main', path, content: 'saved from integrated editor' })).status, 200)
  assert.equal((await api(f, 'fs.read', { sessionId: 'session-main', path })).value.content, 'saved from integrated editor')
  const tree = await api(f, 'fs.tree', { sessionId: 'session-main' })
  assert.equal(tree.value.entries.some(entry => entry.name === 'saved.txt'), true)
  assert.equal((await api(f, 'changes.ops', { sessionId: 'session-main' })).status, 200)
  for (const method of ['subagents.live', 'sidechat.info', 'workflows.list', 'teams.taskCreate']) {
    const response = await api(f, method, { sessionId: 'session-main', parentId: 'session-main', childId: 'missing' })
    assert.notEqual(response.error?.message, `unknown sidebar API method "${method}"`, `${method} remains registered even when its optional service is absent`)
  }
  await f.dispose()
  assert.equal(f.routes.size, 0)
  assert.equal(f.upgrades.size, 0)
  assert.equal(f.tools.size, 0)
  assert.equal([...f.events.values()].every(listeners => listeners.size === 0), true)
})

test('all preserved Host routes reject cross-site requests and serve the three owned lazy chunks with revalidation', async t => {
  const f = await fixture(t)
  apply(f.ctx, Config({}))
  for (const [path, handler] of f.routes) assert.equal((await invoke(handler, { path, origin: 'https://untrusted.example' })).status, 403, path)
  for (const [path, handler] of f.upgrades) {
    let destroyed = false
    handler({ url: path, headers: { host: 'localhost:19876', origin: 'https://untrusted.example' } }, { destroy() { destroyed = true } }, Buffer.alloc(0))
    assert.equal(destroyed, true, path)
  }
  for (const name of ['editor', 'mermaid', 'locale']) {
    const path = `/sidebar/bundle/${name}.js`
    const served = await invoke(f.routes.get('/sidebar/bundle'), { path, method: 'GET' })
    assert.equal(served.status, 200)
    const source = await readFile(new URL(`../lib/sidebar/upstream/client-${name}.js`, import.meta.url))
    assert.equal(createHash('sha256').update(served.body).digest('hex'), createHash('sha256').update(source).digest('hex'))
    assert.equal(served.headers['cache-control'], 'no-cache')
    const cached = await invoke(f.routes.get('/sidebar/bundle'), { path, method: 'GET', headers: { 'if-none-match': served.headers.etag } })
    assert.equal(cached.status, 304)
  }
  assert.equal((await invoke(f.routes.get('/sidebar/bundle'), { path: '/sidebar/bundle/registry.js', method: 'GET' })).status, 404)
})

test('released Cordis mounts the owned Host and removes all scoped routes on disposal', async t => {
  const runtime = process.env.DSH_APP_TEST_CORE_ROOT
  assert.ok(runtime, 'Set DSH_APP_TEST_CORE_ROOT to the supported released DSH runtime')
  const { Context } = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href)
  const f = await fixture(t), root = new Context()
  const services = await root.plugin({ name: 'sidebar-fixture-services', apply(ctx) { for (const name of ['webServer', 'sessions', 'webRuntime', 'tools', 'loader', 'settings']) ctx.provide(name, f.ctx[name]) } })
  t.after(() => services.dispose())
  const owner = await root.plugin({ name: 'owned-sidebar-test', inject: ['loader', 'settings'], apply(ctx) { installSidebar(ctx, Config({})) } })
  t.after(() => owner.dispose())
  assert.equal(f.routes.has('/sidebar/api'), true)
  assert.equal(f.upgrades.size, 2)
  await owner.dispose()
  assert.equal(f.routes.size, 0)
  assert.equal(f.upgrades.size, 0)
})
