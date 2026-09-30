/** Published browser module compatibility and owned Plugins navigation. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { pathToFileURL } from 'node:url'
import createPluginPagesClient from '../client/plugin-pages.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const runtime = process.env.DSH_APP_TEST_CORE_ROOT
if (!runtime) throw new Error('Set DSH_APP_TEST_CORE_ROOT to a released DSH runtime')
const { SlotCore } = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js')))

test('built owner loads through the released module system and exposes sidebar aliases without the original package', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1/' })
  t.after(() => dom.window.close())
  let bootstrap
  dom.window.__ModuleLoader__ = { load: row => { bootstrap = row.factory } }
  runInNewContext(readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-modules/lib/client.js'), 'utf8'), { window: dom.window, document: dom.window.document, console })
  const { ClientModuleSystem } = bootstrap(() => ({}))
  const queue = { mode: 'queue', pendingQueue: [], load: row => queue.pendingQueue.push(row) }
  dom.window.__ModuleLoader__ = queue
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: dom.window, document: dom.window.document, console })
  const modules = new ClientModuleSystem({ manifest: { rev: 'owned', modules: [], plugins: [] }, registrationTarget: queue,
    staticModules: { react: require('react'), 'react-dom': require('react-dom'), 'react-dom/client': require('react-dom/client'), 'react/jsx-runtime': require('react/jsx-runtime'), '@deepseek-ai/dsh-client-ui-primitives': {} }, bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: {} } })
  const owner = await modules.import('dsh-app')
  assert.ok(owner.inject.includes('conversation'))
  assert.ok(owner.inject.includes('remote.session'))
  const sidebar = await modules.import('dsh-better-sidebar/client/service')
  assert.equal(sidebar.createBetterSidebarService, owner.sidebarEngine.createBetterSidebarService)
  assert.equal((await modules.import('dsh-better-sidebar/client')).SIDEBAR_SERVICE_VERSION, '0.24.1')
  assert.ok(sidebar.SIDEBAR_FEATURES.includes('fileIcons'))
})

test('official installed uninstall queues a stopped-profile operation and MCP stays inside Plugins', async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'HTMLElement', 'fetch', 'EventSource', 'IS_REACT_ACT_ENVIRONMENT']
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const calls = [], pending = []
  const response = (value, status = 200) => ({ ok: status < 400, json: async () => value })
  globalThis.EventSource = class { addEventListener() {} close() {} }
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body && JSON.parse(options.body)
    calls.push({ url, body, signal: options.signal })
    if (url === '/dsh-app/market/operations') { pending.push({ packageName: body.packageName, kind: body.kind, id: 'remove-1' }); return response({ operationId: 'remove-1' }) }
    if (url === '/dsh-app/market/catalog') return response({ plugins: [], categories: {} })
    if (url === '/dsh-app/market/state') return response({ installed: [], pending, capabilities: { restart: true }, operation: null })
    if (url === '/dsh-app/mcp/api') return response({ ok: true, detail: { items: [], workspaces: [], revision: 0, history: [] } })
    return response({})
  }
  const React = require('react'), { createRoot } = require('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  const flush = action => React.act(async () => { action?.(); await Promise.resolve(); await Promise.resolve() })
  const slots = new SlotCore()
  slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' } } }, () => null)
  const original = props => React.createElement('button', { 'data-original-uninstall': '', onClick: () => props.uninstall('dsh-mcp-connector') }, 'Remove example')
  const stopOfficial = slots.register({ name: 'main', key: 'plugins' }, original)
  const client = createPluginPagesClient(require)
  const namespaces = new Map([[client.NS, client.dictionaries]])
  const listeners = new Set(), selections = []
  const ctx = { slots: { entries: name => slots.entries(name), register: (row, component) => slots.register(row, component), subscribe: (name, callback) => slots.onMutate(key => { if (name === key) callback() }) },
    locale: { getLocale: () => 'zh', subscribe: () => () => {}, bind: ns => key => namespaces.get(ns)?.zh[key] ?? key },
    layout: { selectPanel: panel => { selections.push(panel); for (const fn of listeners) fn() }, panelInfo: { getSnapshot: () => ({ activePanelId: selections.at(-1) ?? 'plugins' }), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) } } },
    uiWorkspace: {}, conversation: {}, sessions: {} }
  const stop = client.install(ctx)
  t.after(async () => { await flush(() => root.unmount()); stop(); stopOfficial(); dom.window.close(); for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })
  const entry = slots.entriesOfSlot('main')[0]
  const views = []
  await flush(() => root.render(React.createElement(entry.component, { useStore: () => ({ kind: 'package', name: 'dsh-mcp-connector' }), actions: { setView: view => views.push(view) }, uninstall: () => assert.fail('running official removal must not execute') })))
  assert.equal(document.querySelectorAll('[role="tab"]').length, 3)
  await flush(() => document.querySelector('[data-original-uninstall]').click())
  assert.deepEqual(calls.find(row => row.url.endsWith('/operations')).body, { kind: 'uninstall', packageName: 'dsh-mcp-connector' })
  assert.deepEqual(views, [{ kind: 'list' }], 'queued removal returns the official store to unified browse')
  await flush(() => document.querySelector('[data-dsh-app-plugin-tab="mcp"]').click())
  assert.ok(document.querySelector('[data-dsh-app-mcp]'))
  assert.equal(document.querySelector('iframe'), null)
  assert.equal(document.querySelector('[data-dsh-app-plugin-page]').dataset.dshAppPluginPage, 'mcp')
  assert.deepEqual(selections, ['plugins'])
  await flush(() => root.unmount())
  stop()
  assert.equal(slots.entriesOfSlot('main')[0].component, original)
})
