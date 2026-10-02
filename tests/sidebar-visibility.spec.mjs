/** Verify visibility through the released slot renderer and its native store share. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import createSidebarWorkbenchClient from '../client/sidebar-workbench.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom'), React = require('react')
const runtime = process.env.DSH_APP_TEST_CORE_ROOT
if (!runtime) throw new Error('Set DSH_APP_TEST_CORE_ROOT to the supported released runtime')
const { SlotCore, ...slotsExports } = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js')).href)
const cordis = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href)
const rendererSource = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'), 'utf8')
  .replace('exports.SlotRegistry = SlotRegistry;', 'exports.createSlotRenderer = createSlotRenderer; exports.SlotRegistry = SlotRegistry;')
let renderer
runInNewContext(rendererSource, { window: { __ModuleLoader__: { load: definition => {
  renderer = definition.factory(id => id === '@deepseek-ai/dsh-client-ui-slots' ? { SlotCore, ...slotsExports } : id === '@deepseek-ai/cordis' ? cordis : require(id))
} } }, console })

function source(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) },
    set(next) { value = next; for (const listener of [...listeners]) listener() }, listeners }
}

function fixture(t, { nativeReady = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true })
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  const dictionaries = new Map(), effects = [], calls = [], errors = [], subscriptions = new Set()
  const store = source({ bySession: {
    s1: { layout: { expanded: false, tabs: {}, activeTab: undefined } },
    s2: { layout: { expanded: true, tabs: { file: { id: 'file', kind: 'editor', title: 'Review.md' } }, activeTab: 'file' } },
  } })
  store.actions = {}
  const handle = { spec: {}, create: () => store }
  const core = new SlotCore()
  const parent = core.register({ name: 'root', children: {
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    'conversation.session.header.corner': { kind: 'single', scope: 'session' },
    'rightbar.session': { kind: 'single', scope: 'session' },
  } }, ({ renderSlot }) => React.createElement('header', {}, renderSlot('conversation.session.header.utilities', {})))
  const nativeDisposers = []
  const addNative = (shared = handle) => {
    nativeDisposers.push(core.register({ name: 'rightbar.session', store: shared }, () => null))
    nativeDisposers.push(core.register({ name: 'conversation.session.header.corner', store: shared }, () => null))
  }
  if (nativeReady) addNative()
  const registry = source([]), metadata = source([]), serviceState = source({ enabled: true })
  const column = { openTabs: metadata, mounted: source('s1'),
    isExpanded: () => store.getSnapshot().bySession[column.mounted.getSnapshot()]?.layout.expanded ?? false,
    toggleExpanded() {
      const id = column.mounted.getSnapshot(), before = store.getSnapshot(), layout = before.bySession[id].layout
      calls.push({ toggle: id })
      const expanded = !layout.expanded
      const tabs = expanded && Object.keys(layout.tabs).length === 0 ? { guide: { id: 'guide', kind: 'guide', title: 'Start' } } : layout.tabs
      store.set({ bySession: { ...before.bySession, [id]: { layout: { ...layout, expanded, tabs, activeTab: layout.activeTab ?? Object.keys(tabs)[0] } } } })
      // Native inventory and mounted sources do not emit for visibility alone.
    },
    openTab: kind => calls.push({ nativeOpen: kind }) }
  const resources = { service: { subscribeState: serviceState.subscribe, getSnapshot: serviceState.getSnapshot,
    registerTab: () => () => {},
    getTabs: () => [{ id: 'editor', title: 'Files' }], subscribe: registry.subscribe, isTabEnabled: () => true,
    openTab: seed => calls.push({ open: seed.type }) } }
  const locale = { register(ns, values) { dictionaries.set(ns, values); return () => dictionaries.delete(ns) },
    bind: ns => key => dictionaries.get(ns)?.en?.[key] ?? key }
  const nativeRegistry = { get: () => true, guide: () => [], subscribe: registry.subscribe }
  const ctx = { locale, get: id => id === 'sidebarRight' ? column : id === 'sidebarRightTabs' ? nativeRegistry : undefined,
    effect(callback) { const off = callback(); if (typeof off === 'function') effects.push(off); return off },
    inject: (_dependencies, callback) => callback(ctx),
    slots: { inject: (_slot, callback) => callback(), register: (definition, component) => core.register(definition, component),
      entries: key => core.entries(key), subscribe(key, listener) { const token = { key, listener }; subscriptions.add(token); const off = core.subscribe(key, listener); return () => { off(); subscriptions.delete(token) } } } }
  const rootBinding = source({ key: undefined, hooks: {}, keyedHooks: {}, props: {} })
  const binding = source({ key: 's1', ctx, hooks: {}, keyedHooks: {}, props: { sessionId: 's1' } })
  const adapter = { current: binding, bindingSource: () => binding, renderArea: (_binding, props) => props.children() }
  const host = { subscribe: (key, listener) => core.subscribe(key, listener), getVersion: key => core.getVersion(key),
    entriesOf: key => core.entries(key), entriesOfSlot: key => core.entriesOfSlot(key), specOf: key => core.spec(key), isLive: entry => core.isLive(entry),
    storeOf: entry => entry.store === handle ? store : undefined, root: rootBinding, scopeRevision: source(0), scope: () => adapter,
    reportEntryError: (_key, _entry, error) => errors.push(error), locale: { ...locale, ...source({ revision: 0 }) } }
  const client = createSidebarWorkbenchClient(require)
  const flush = action => React.act(async () => { action?.(); for (let index = 0; index < 8; index++) await Promise.resolve() })
  const dispose = () => { for (const off of effects.splice(0).reverse()) off() }
  const render = () => root.render(renderer.createSlotRenderer().renderRoot(host, {}))
  t.after(async () => { await flush(() => root.unmount()); dispose(); for (const off of nativeDisposers.splice(0).reverse()) off(); parent(); dom.window.close(); for (const [key, original] of originals) if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key] })
  return { client, ctx, resources, core, store, handle, column, root, calls, errors, metadata, binding, flush, render, addNative, nativeDisposers, subscriptions, dispose,
    toggle: () => document.querySelector('[data-dsh-app-workbench-visibility]') }
}

test('header icon toggles the native empty surface, never opens a menu on hover, and summary plus opens tools', async t => {
  const f = fixture(t)
  f.client.install(f.ctx, f.resources)
  await f.flush(f.render)
  assert.deepEqual(f.errors, [])
  assert.equal(f.calls.length, 0, 'mounting a fresh header does not expand it')
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'false')
  assert.equal(f.toggle().getAttribute('aria-label'), 'Show sidebar')
  assert.equal(f.toggle().textContent, '', 'the header control is icon-only')
  assert.equal(f.toggle().getAttribute('aria-haspopup'), null)
  await f.flush(() => f.toggle().dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })))
  assert.equal(document.querySelector('[role="dialog"]'), null)
  await f.flush(() => f.toggle().click())
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'true')
  assert.equal(f.toggle().getAttribute('aria-label'), 'Hide sidebar')
  assert.equal(f.store.getSnapshot().bySession.s1.layout.tabs.guide.kind, 'guide')
  assert.deepEqual(f.calls, [{ toggle: 's1' }])
  await f.flush(() => f.toggle().click())
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'false')
  assert.ok(f.store.getSnapshot().bySession.s1.layout.tabs.guide, 'closing preserves the seeded guide')

  await f.flush(() => f.root.render(React.createElement(f.client.WorkbenchMenu, { ctx: f.ctx, resources: f.resources, compact: true })))
  assert.equal(document.querySelector('.dsh-app-workbench-trigger').textContent, '+')
  await f.flush(() => document.querySelector('.dsh-app-workbench-trigger').click())
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.deepEqual(f.calls.at(-1), { open: 'launcher' }, 'the floating summary plus opens the new tab tools page')
})

test('visibility observes native commits and arriving sessions without tab-inventory notifications, preserving active content', async t => {
  const f = fixture(t)
  f.client.install(f.ctx, f.resources)
  await f.flush(f.render)
  const snapshot = f.metadata.getSnapshot()
  await f.flush(() => { f.column.mounted.set('s2'); f.binding.set({ ...f.binding.getSnapshot(), key: 's2', props: { sessionId: 's2' } }) })
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'true')
  const tabs = f.store.getSnapshot().bySession.s2.layout.tabs
  await f.flush(() => f.toggle().click())
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'false')
  assert.equal(f.store.getSnapshot().bySession.s2.layout.tabs, tabs)
  assert.equal(f.store.getSnapshot().bySession.s2.layout.activeTab, 'file')
  await f.flush(() => f.toggle().click())
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'true')
  assert.equal(f.store.getSnapshot().bySession.s2.layout.tabs, tabs)
  assert.equal(f.store.getSnapshot().bySession.s2.layout.activeTab, 'file')
  await f.flush(() => f.column.toggleExpanded())
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'false', 'another native control or Agent updates the header')
  assert.equal(f.metadata.getSnapshot(), snapshot, 'no metadata or mounted visibility signal was required')
  await f.flush(() => { f.column.mounted.set('s1'); f.binding.set({ ...f.binding.getSnapshot(), key: 's1', props: { sessionId: 's1' } }) })
  assert.equal(f.toggle().getAttribute('aria-pressed'), 'false')
  assert.deepEqual(f.errors, [])
})

test('visibility registration follows the native shared store lifecycle and removes every owned subscription', async t => {
  const f = fixture(t, { nativeReady: false })
  f.client.install(f.ctx, f.resources)
  await f.flush(f.render)
  assert.equal(f.toggle(), null)
  await f.flush(f.addNative)
  const entry = f.core.entries('conversation.session.header.utilities').find(entry => entry.options.id === 'dsh-app:workbench-visibility')
  assert.equal(entry.store, f.handle, 'the utility reuses the exact native session handle')
  assert.ok(f.toggle())
  assert.equal(f.subscriptions.size, 2)
  await f.flush(() => { for (const off of f.nativeDisposers.splice(0).reverse()) off() })
  assert.equal(f.toggle(), null, 'unloading the native seats removes the control')
  await f.flush(f.addNative)
  assert.ok(f.toggle(), 'reloading the native seats restores the subscription')
  await f.flush(f.dispose)
  assert.equal(f.toggle(), null)
  assert.equal(f.subscriptions.size, 0)
  assert.equal(f.core.entries('rightbar.session').length, 1, 'owned unload preserves native seats')
  assert.deepEqual(f.errors, [])
})
