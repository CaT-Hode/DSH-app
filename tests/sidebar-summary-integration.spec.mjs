/** Exercise the owned summary through the released chain renderer and SlotCore. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import createSidebarSummaryClient from '../client/sidebar-summary.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom'), React = require('react')
const runtime = process.env.DSH_APP_TEST_CORE_ROOT
if (!runtime) throw new Error('Set DSH_APP_TEST_CORE_ROOT to the supported released runtime')
const { SlotCore, ...slotsExports } = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js')).href)
const cordis = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href)
// Expose a test-only factory export; the released renderer logic runs unchanged.
const rendererSource = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'), 'utf8')
  .replace('exports.SlotRegistry = SlotRegistry;', 'exports.createSlotRenderer = createSlotRenderer; exports.SlotRegistry = SlotRegistry;')
let rendererModule
runInNewContext(rendererSource, { window: { __ModuleLoader__: { load: definition => {
  rendererModule = definition.factory(id => id === '@deepseek-ai/dsh-client-ui-slots' ? { SlotCore, ...slotsExports } : id === '@deepseek-ai/cordis' ? cordis : require(id))
} } }, console })

function source(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) },
    set: next => { value = next; for (const listener of [...listeners]) listener() }, listeners }
}

function fixture(t, { saved = true, mountedId = 'main' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'navigator', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true })
  if (saved) localStorage.setItem('dsh.sidebar-right.v1.main', '{}')
  const { createRoot } = require('react-dom/client')
  const root = createRoot(document.getElementById('root')), effects = [], dictionaries = new Map(), calls = [], errors = []
  const mounted = source(mountedId), openTabs = source([]), sessions = source({ byId: { main: { cwd: 'D:/project' }, worker: { id: 'worker', parentId: 'main', origin: 'subagent', displayTitle: 'Review' } } })
  const statuses = source(new Map([['worker', { running: true }]])), state = source({}), registry = source([])
  const records = source(new Map())
  const tabs = [{ id: 'guide', kind: 'guide', title: 'Start' }, { id: 'output', kind: 'editor', title: 'Report.md' }]
  let ready = true
  const column = { mounted, openTabs, tabsIn: id => id === 'main' ? tabs : [],
    focus: id => calls.push({ focus: id }), toggleExpanded: () => calls.push({ hide: true }),
    openTab: kind => { calls.push({ kind }); if (!ready) throw new Error('sidebarRight: no session surface is mounted') } }
  const resources = { service: { subscribeState: state.subscribe, getSnapshot: state.getSnapshot,
    getTabs: () => [], subscribe: registry.subscribe, isTabEnabled: () => true, openTab: (seed, scope) => calls.push({ seed, scope }) },
    nativeRecords: { get: id => records.getSnapshot().get(id), subscribe: records.subscribe, versionOf: id => records.getSnapshot().get(id)?.version ?? 0 },
    Information: ({sessionId}) => React.createElement('div', { 'data-test-information-session': sessionId }, 'Unified Session information') }
  const tabInfo = () => ({ sidebar: { expanded: true }, panel: { id: 'pane' }, tab: { id: 'guide', kind: 'guide' } })
  const core = new SlotCore()
  const parent = core.register({ name: 'root', children: { 'sidebar.right.tab.guide': { kind: 'chain', scope: 'session', inject: { hooks: { tabInfo: (_standard, context) => context } } } } },
    ({ renderSlotChain }) => renderSlotChain('sidebar.right.tab.guide', {}, { hookContext: tabInfo, fallback: React.createElement('p', {}, 'Original guide') }))
  const locale = { register: (namespace, values) => { dictionaries.set(namespace, values); return () => dictionaries.delete(namespace) },
    bind: namespace => (key, params = {}) => Object.entries(params).reduce((text, [field, value]) => text.replaceAll(`{${field}}`, String(value)), dictionaries.get(namespace)?.en?.[key] ?? key) }
  const nativeRegistry = { guide: () => [], subscribe: registry.subscribe }
  const ctx = { locale, sessions: { list: sessions }, uiSession: { sessionStatus: statuses },
    get: id => id === 'sidebarRight' ? column : id === 'sidebarRightTabs' ? nativeRegistry : undefined,
    effect: callback => { const off = callback(); if (typeof off === 'function') effects.push(off); return off },
    inject: (_names, callback) => callback(ctx),
    slots: { inject: (key, callback) => { assert.ok(core.spec(key)); return callback() }, register: (options, component) => core.register(options, component) } }
  const rootBinding = source({ key: undefined, hooks: {}, keyedHooks: {}, props: {} })
  const binding = source({ key: 'main', ctx, hooks: {}, keyedHooks: {}, props: { sessionId: 'main' } })
  const adapter = { current: binding, bindingSource: () => binding, renderArea: (_binding, props) => props.children() }
  const host = { subscribe: (key, callback) => core.subscribe(key, callback), getVersion: key => core.getVersion(key),
    entriesOf: key => core.entries(key), entriesOfSlot: key => core.entriesOfSlot(key), specOf: key => core.spec(key), isLive: entry => core.isLive(entry),
    storeOf: () => undefined, root: rootBinding, scopeRevision: source(0), scope: () => adapter,
    reportEntryError: (_key, _entry, error) => errors.push(error), locale: { ...locale, ...source({ revision: 0 }) } }
  const client = createSidebarSummaryClient(require)
  const flush = action => React.act(async () => { action?.(); for (let index = 0; index < 6; index++) await Promise.resolve() })
  const dispose = () => { for (const off of effects.splice(0).reverse()) off() }
  t.after(async () => { await flush(() => root.unmount()); dispose(); parent(); dom.window.close(); for (const [key, original] of originals) if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key] })
  return { client, ctx, resources, core, root, host, calls, errors, mounted, sessions, statuses, records, column, tabs, flush, dispose,
    setReady: value => { ready = value }, render: () => root.render(rendererModule.createSlotRenderer().renderRoot(host, {})) }
}

test('summary registers into the released guide chain and renders with framework Session identity', async t => {
  const f = fixture(t)
  f.client.install(f.ctx, f.resources)
  assert.equal(typeof f.core.entries('sidebar.right.tab.guide')[0].select, 'function')
  await f.flush(f.render)
  assert.deepEqual(f.errors, [])
  assert.match(document.querySelector('[data-dsh-app-summary]').textContent, /Report.md/)
  assert.equal(document.querySelectorAll('[data-test-information-session="main"]').length, 1)
  assert.equal(document.querySelectorAll('.dsh-app-summary-agents').length, 0, 'no second agent summary duplicates the information view')
  assert.equal(document.querySelector('[data-dsh-app-summary] header button'), null, 'the header controls are the only add and hide actions')
  assert.equal(f.calls.length, 0, 'saved user layout is not expanded or reseeded')
  await f.flush(() => f.records.set(new Map([['output', { version: 1, tab: { title: 'Renamed.md' } }]])))
  assert.match(document.querySelector('[data-dsh-app-summary]').textContent, /Renamed.md/, 'record-only changes refresh the live output title')
  await f.flush(f.dispose)
  assert.equal(f.core.entries('sidebar.right.tab.guide').length, 0)
  assert.match(document.getElementById('root').textContent, /Original guide/)
  assert.equal(f.mounted.listeners.size, 0)
})

test('fresh conversations remain collapsed through native adoption and session changes', async t => {
  const f = fixture(t, { saved: false, mountedId: undefined })
  f.tabs.splice(0)
  f.setReady(false)
  f.client.install(f.ctx, f.resources)
  f.mounted.set('main')
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(f.calls.length, 0, 'mounting a new conversation does not open the guide')
  f.setReady(true)
  await new Promise(resolve => setTimeout(resolve, 70))
  assert.equal(f.calls.length, 0, 'native adoption cannot automatically expand the sidebar')
  f.mounted.set('second')
  f.setReady(false)
  await new Promise(resolve => setTimeout(resolve, 10))
  f.dispose()
  const before = f.calls.length
  await new Promise(resolve => setTimeout(resolve, 70))
  assert.equal(f.calls.length, before, 'session changes and teardown never open an unrequested summary')
  assert.equal(f.mounted.listeners.size, 0)
})
