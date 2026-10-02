import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import createSidebarBridge from '../client/sidebar-bridge.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

test('native body and title slots persist the native address and isolate retained tab1 views across conversations', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/', pretendToBeVisual: true })
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']
  const globals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys.slice(0, 5)) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'), { createRoot } = require('react-dom/client'), h = React.createElement
  const primitives = new Proxy({}, { get: (_object, key) => () => h('span', { 'data-icon': String(key) }) })
  const engine = createSidebarBridge(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id)).engine
  const store = engine.createSidebarStore(); store.setSession('s2')
  const records = engine.createNativeTabRecords(), service = engine.createBetterSidebarService(store)
  let slots = new Map()
  const ctx = { get: name => name === 'sidebarRightTabs' ? { register: () => () => {} } : undefined,
    inject(_dependencies, callback) { const stop = callback(ctx); return { dispose: () => stop?.() } },
    sessions: { list: { getSnapshot: () => ({ byId: { s1: { cwd: 'D:/first' }, s2: { cwd: 'D:/second' } } }), subscribe: () => () => {} } },
    slots: { inject: (_name, callback) => callback(), register(definition, component) { slots.set(`${definition.name}:${definition.key}`, { definition, component }); return () => {} } } }
  service.registerTab({ id: 'editor', title: 'Files', component: ({ scope, tab }) => h('output', {}, `${scope.sessionId}:${tab.path}:${tab.title}`) })
  const stop = engine.registerNativeSurface({ ctx, store, service, records })
  const body = [...slots.values()].find(entry => entry.definition.name === 'sidebar.right.pane.tab' && entry.definition.key.endsWith(':editor'))
  const title = [...slots.values()].find(entry => entry.definition.name === 'sidebar.right.pane.tab.title' && entry.definition.key.endsWith(':editor'))
  assert.ok(body); assert.ok(title)
  const views = ['s1', 's2'].map(sessionId => ({ sessionId, tab: { id: 'tab1', kind: 'editor', title: `${sessionId}.ts`, contentId: `dsh-resource://file/session/${sessionId}/${sessionId}.ts`, navigation: { revision: 1, params: { title: `${sessionId} review`, line: sessionId === 's1' ? 11 : 22 } }, visible: sessionId === 's2' } }))
  const root = createRoot(document.getElementById('root'))
  const render = async () => React.act(async () => root.render(h(React.Fragment, {}, ...views.map(view => h('section', { key: view.sessionId, 'data-session': view.sessionId },
    h(body.component, { ...body.definition.inject(), sessionId: view.sessionId, useTabInfo: () => ({ tab: view.tab }) }),
    h('strong', {}, h(title.component, { ...title.definition.inject(), sessionId: view.sessionId, useTabInfo: () => ({ tab: view.tab }) })))))))
  t.after(async () => { await React.act(async () => root.unmount()); stop(); records.dispose(); dom.window.close(); for (const [key, value] of globals) if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] })
  await render()
  assert.equal(records.get('tab1', 's1').contentId, views[0].tab.contentId)
  assert.equal(records.get('tab1', 's2').contentId, views[1].tab.contentId)
  await React.act(async () => records.update('tab1', { title: 'First changed', path: 'moved.ts' }, 's1'))
  assert.equal(document.querySelector('[data-session=s1] output').textContent, 's1:moved.ts:First changed')
  assert.equal(document.querySelector('[data-session=s1] strong').textContent, 'First changed')
  assert.equal(document.querySelector('[data-session=s2] output').textContent, 's2:s2.ts:s2 review')
  assert.equal(document.querySelector('[data-session=s2] strong').textContent, 's2 review')
  const reloaded = engine.createNativeTabRecords(); reloaded.attachStore(store)
  const restored = reloaded.ensure({ id: 'tab1', kind: 'editor', title: 's1.ts', contentId: views[0].tab.contentId, params: { path: 's1.ts' }, scope: { sessionId: 's1' }, navigationRevision: 0 })
  assert.equal(restored.tab.path, 'moved.ts')
  assert.equal(restored.tab.title, 'First changed')
  assert.equal(restored.tab.line, 11)
  reloaded.dispose()
})
