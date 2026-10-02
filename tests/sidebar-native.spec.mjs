import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import createSidebarBridge from '../client/sidebar-bridge.mjs'
import createSidebarAgentClient from '../client/sidebar-agent.mjs'

const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : createRequire(import.meta.url)
const { JSDOM } = dependencies('jsdom')
const require = createRequire(import.meta.url)

function fixture(t) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'localStorage']
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true })
  const engine = createSidebarBridge(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id)).engine
  const store = engine.createSidebarStore()
  store.setSession('session-main')
  const service = engine.createBetterSidebarService(store)
  const records = engine.createNativeTabRecords()
  records.attachStore(store)
  const calls = [], listListeners = new Set(), mountListeners = new Set(), closeHandlers = new Map()
  let mounted = 'session-main', controller
  const ctx = {
    get: id => id === 'sidebarRight' ? controller : undefined,
    sessions: { list: { subscribe(callback) { listListeners.add(callback); return () => listListeners.delete(callback) } } },
  }
  const surface = engine.createNativeSurface(ctx, records)
  service.setSurface(surface)
  const native = {
    mounted: { getSnapshot: () => mounted, subscribe(callback) { mountListeners.add(callback); return () => mountListeners.delete(callback) } },
    openResource: (address, options) => calls.push({ kind: 'resource', sessionId: mounted, address, options }),
    openResourceIn: (sessionId, address, options) => calls.push({ kind: 'resource', sessionId, address, options }),
    openTab: (kind, options) => calls.push({ kind, sessionId: mounted, options }),
    openTabIn: (sessionId, kind, options) => calls.push({ kind, sessionId, options }),
    close: tabId => { const record = records.get(tabId); closeHandlers.get(record?.tab.type)?.(mounted, { id: tabId, kind: record.tab.type, title: record.tab.title }); calls.push({ kind: 'close', sessionId: mounted, tabId }) },
    closeIn: (sessionId, tabId) => { const record = records.get(tabId); closeHandlers.get(record?.tab.type)?.(sessionId, { id: tabId, kind: record.tab.type, title: record.tab.title }); calls.push({ kind: 'close', sessionId, tabId }) },
    focus: tabId => calls.push({ kind: 'focus', sessionId: mounted, tabId }),
    registerCloseHandler(kind, handler) { closeHandlers.set(kind, handler); return () => closeHandlers.delete(kind) },
  }
  t.after(() => {
    surface.dispose()
    dom.window.close()
    for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
  })
  return { engine, store, service, records, surface, calls, native, attach() { controller = native; for (const callback of listListeners) callback() },
    mount(sessionId) { mounted = sessionId; for (const callback of mountListeners) callback() }, listListeners, mountListeners, closeHandlers }
}

test('tree rename retargets native file descendants and delete closes them in the originating session', t => {
  const f = fixture(t)
  f.service.registerTab({ id: 'editor', title: 'Files', component: () => null })
  f.attach()
  const scope = { sessionId: 'session-main', cwd: 'D:/project' }
  f.records.ensure({ id: 'file-a', kind: 'editor', title: 'a', params: { path: 'old/a.txt' }, scope, navigationRevision: 1 })
  f.records.ensure({ id: 'file-b', kind: 'editor', title: 'b', params: { path: 'D:/project/old/sub/b.txt' }, scope, navigationRevision: 1 })
  f.records.ensure({ id: 'file-neighbor', kind: 'editor', title: 'c', params: { path: 'D:/project/older/c.txt' }, scope, navigationRevision: 1 })
  const ctx = { get: id => id === 'betterSidebar' ? f.service : undefined }
  f.engine.retargetPathTabs(ctx, f.store, 'D:/project/old', 'D:/project/new', scope)
  assert.equal(f.records.get('file-a', scope.sessionId).tab.path, 'D:/project/new/a.txt')
  assert.equal(f.records.get('file-b', scope.sessionId).tab.path, 'D:/project/new/sub/b.txt')
  assert.equal(f.records.get('file-neighbor', scope.sessionId).tab.path, 'D:/project/older/c.txt')
  f.mount('session-other')
  f.store.setSession('session-other')
  f.engine.closePathTabs(ctx, f.store, 'D:/project/new', scope)
  assert.deepEqual(f.calls.filter(call => call.kind === 'close').map(call => [call.sessionId, call.tabId]), [['session-main', 'file-a'], ['session-main', 'file-b']])
  assert.equal(f.records.has('file-neighbor', scope.sessionId), true)
})

test('native resource opens preserve folder semantics, requested title, line and target session', t => {
  const f = fixture(t)
  f.service.registerTab({ id: 'editor', title: 'Files', component: () => null })
  f.attach()
  f.service.openTab({ type: 'editor', path: 'D:/project/folder', title: 'Review sources', meta: { dir: true }, line: 12 }, { sessionId: 'session-other', cwd: 'D:/project' })
  assert.deepEqual(f.calls[0], { kind: 'resource', sessionId: 'session-other', address: 'dsh-resource://file/session/session-other/folder', options: {
    params: { title: 'Review sources', meta: { dir: true }, line: 12 }, revealIfOpened: true,
  } })
  const record = f.records.ensure({ id: 'native-folder', kind: 'editor', title: 'folder', params: { path: 'folder', ...f.calls[0].options.params }, scope: { sessionId: 'session-other' }, navigationRevision: 1 })
  assert.equal(record.tab.meta.dir, true)
  assert.equal(record.tab.title, 'Review sources')
  assert.equal(record.tab.line, 12)
  assert.equal(f.store.getSnapshot().sessionId, 'session-main')
})

test('native record updates survive rerenders and hidden bodies until their native lifetime ends', t => {
  const f = fixture(t), lifetime = new AbortController()
  const input = { id: 'native-editor', kind: 'editor', title: 'original', params: { path: 'original.txt', title: 'Original' }, scope: { sessionId: 'session-main' }, navigationRevision: 1, signal: lifetime.signal }
  f.records.ensure(input)
  f.records.update(input.id, { path: 'changed.txt', title: 'Changed', meta: { treeOpen: true } })
  const rerender = f.records.ensure(input)
  assert.equal(rerender.tab.path, 'changed.txt', 'an unchanged native address must not undo the in-place file switch')
  assert.equal(rerender.tab.title, 'Changed')
  assert.equal(rerender.tab.meta.treeOpen, true)
  assert.equal(f.records.ensure({ ...input, navigationRevision: 2, params: { path: 'requested.txt', line: 8 } }).tab.path, 'requested.txt', 'a new resource navigation still applies')
  assert.equal(f.records.get(input.id).tab.line, 8)
  lifetime.abort()
  assert.equal(f.records.has(input.id), false, 'native occurrence abort releases retained metadata')
})

test('native browser records initialize URL metadata and queued opens replay in request order', t => {
  const f = fixture(t)
  const record = f.records.ensure({ id: 'browser-one', kind: 'browser', title: 'Browser', params: { url: 'https://example.com/start' }, scope: { sessionId: 'session-main' }, navigationRevision: 1 })
  assert.equal(record.tab.meta.url, 'https://example.com/start')
  f.surface.openTab({ sessionId: 'session-main', kind: 'browser', params: { url: 'https://example.com/first' } })
  f.surface.openTab({ sessionId: 'session-main', kind: 'browser', params: { url: 'https://example.com/last' } })
  f.attach()
  assert.deepEqual(f.calls.map(call => call.options.params.url), ['https://example.com/first', 'https://example.com/last'])
  f.surface.flushPending()
  assert.equal(f.calls.length, 2, 'delivered opens are consumed once')
  f.surface.dispose()
  assert.equal(f.listListeners.size, 0)
  assert.equal(f.mountListeners.size, 0)
})

test('native activation focuses the real tab and close callbacks receive complete Side Chat metadata', t => {
  const f = fixture(t), closed = []
  f.service.registerTab({ id: 'sidechat', title: 'Side Chat', component: () => null, onClose: (tab, scope) => closed.push({ tab, scope }) })
  const tab = { id: 'native-chat', kind: 'sidechat', title: 'Question', params: { meta: { threadId: 'thread-one' } }, scope: { sessionId: 'session-main' }, navigationRevision: 1 }
  f.records.ensure(tab)
  f.attach()
  f.service.activateTab(tab.id, tab.scope)
  assert.equal(f.calls.at(-1).kind, 'focus')
  assert.equal(f.calls.at(-1).tabId, tab.id)
  f.mount('session-other')
  assert.equal(f.surface.activate(tab.id, 'session-main'), false, 'background activation does not change another conversation')
  assert.equal(f.surface.close('session-other', tab.id), undefined, 'a mismatched session cannot close the record')
  f.service.closeTab(tab.id, tab.scope)
  assert.equal(f.calls.at(-1).sessionId, 'session-main')
  assert.equal(closed[0].tab.meta.threadId, 'thread-one')
  assert.equal(f.records.has(tab.id), false)
})

test('scoped bottom activation and closure update only the target conversation and preserve createTab seeds', t => {
  const f = fixture(t)
  let counter = 0
  f.service.setSurface(undefined)
  f.service.registerTab({ id: 'browser', title: 'Browser', component: () => null, createTab: () => ({ tab: { id: `browser-${++counter}`, type: 'browser', title: 'Untitled' } }) })
  const scope = { sessionId: 'session-other' }
  f.service.openTab({ type: 'browser', target: 'bottom', title: 'First', meta: { url: 'https://example.com/first' } }, scope)
  f.service.openTab({ type: 'browser', target: 'bottom', title: 'Second', meta: { url: 'https://example.com/second' } }, scope)
  const leaf = () => f.store.getSessionStates().get(scope.sessionId).bottomSplits
  assert.equal(leaf().tabs[0].meta.url, 'https://example.com/first')
  assert.equal(leaf().tabs[0].title, 'First')
  f.service.activateTab('browser-1', scope)
  assert.equal(leaf().active, 'browser-1')
  f.service.closeTab('browser-1', scope)
  assert.deepEqual(leaf().tabs.map(tab => tab.id), ['browser-2'])
  assert.equal(f.store.getSnapshot().sessionId, 'session-main')
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 0)
})

test('native registration keeps multiple pages independent and the file explorer stable through state writes', t => {
  const f = fixture(t), registered = [], disposed = []
  const registry = { register(definition) { registered.push(definition); return () => disposed.push(definition.id) } }
  const resources = new Map([['sidebarRightTabs', registry]])
  const ctx = { get: key => resources.get(key), inject(_names, callback) { const stop = callback(ctx); return { dispose: () => stop?.() } },
    slots: { inject(_slot, callback) { return callback() }, register() { return () => {} } } }
  f.service.registerTab({ id: 'editor', title: 'Files', component: () => null })
  f.service.registerTab({ id: 'sidechat', title: 'Side Chat', component: () => null, createTab: () => ({ tab: { id: 'one', type: 'sidechat', title: 'One' } }) })
  f.service.registerTab({ id: 'browser', title: 'Browser', component: () => null, createTab: () => ({ tab: { id: 'web', type: 'browser', title: 'Web' } }) })
  const stop = f.engine.registerNativeSurface({ ctx, store: f.store, service: f.service, records: f.records, reportFailure: (_phase, error) => { throw error } })
  t.after(stop)
  assert.equal(registered.find(row => row.kind === 'sidechat').multiple, true)
  assert.equal(registered.find(row => row.kind === 'browser').multiple, true)
  assert.equal(registered.find(row => row.kind === 'editor').keepMounted, true, 'switching tabs must preserve unsaved editor state')
  assert.equal(registered.find(row => row.kind === 'files').keepMounted, true)
  assert.equal(registered.find(row => row.kind === 'files').multiple, undefined)
  const initialCount = registered.length
  f.store.reduce(state => ({ ...state, expanded: ['D:/project/src'] }))
  f.store.reduce(state => ({ ...state, bottomOpen: true }))
  assert.equal(registered.length, initialCount, 'native explorer is not re-registered on layout updates')
  assert.equal(disposed.length, 0)
  stop()
  assert.equal(disposed.length, initialCount)
})

test('native chrome and service closes both run the descriptor cleanup once with its retained metadata', t => {
  const f = fixture(t), closed = []
  f.service.registerTab({ id: 'sidechat', title: 'Side Chat', component: () => null, onClose: tab => closed.push(tab.meta.threadId) })
  const registry = { register() { return () => {} } }
  const ctx = { get: key => key === 'sidebarRightTabs' ? registry : key === 'sidebarRight' ? f.native : undefined,
    inject(_names, callback) { const stop = callback(ctx); return { dispose: () => stop?.() } },
    slots: { inject(_slot, callback) { return callback() }, register() { return () => {} } } }
  const stop = f.engine.registerNativeSurface({ ctx, store: f.store, service: f.service, records: f.records })
  t.after(stop)
  f.attach()
  const record = id => f.records.ensure({ id, kind: 'sidechat', title: id, params: { meta: { threadId: id } }, scope: { sessionId: 'session-main' }, navigationRevision: 1 })
  record('chrome-closed')
  f.native.close('chrome-closed')
  record('service-closed')
  f.service.closeTab('service-closed')
  assert.deepEqual(closed, ['chrome-closed', 'service-closed'])
  stop()
  assert.equal(f.closeHandlers.size, 0)
})

test('restored native views can be activated, updated and closed before their body mounts', t => {
  const f = fixture(t), closed = [], scope = { sessionId: 'session-main' }
  f.service.registerTab({ id: 'sidechat', title: 'Side Chat', component: () => null, onClose: tab => closed.push(tab.meta.threadId) })
  const tabs = [{ id: 'tab1', kind: 'sidechat', title: 'Review', contentId: 'dsh-resource://page/sidechat/retained' }]
  f.records.ensure({ ...tabs[0], scope, navigationRevision: 1, params: { meta: { threadId: 'retained-thread', draftPending: true } } })
  f.records.drop('tab1', scope.sessionId)
  f.native.tabsIn = sessionId => sessionId === scope.sessionId ? tabs : []
  f.native.tabDomain = { occurrence: () => ({ navigation: { getSnapshot: () => ({ revision: 0, params: undefined }) } }) }
  f.native.close = id => { const index = tabs.findIndex(tab => tab.id === id); f.closeHandlers.get('sidechat')?.(scope.sessionId, tabs[index]); tabs.splice(index, 1) }
  const registry = { register: () => () => {} }
  const ctx = { get: key => key === 'sidebarRightTabs' ? registry : key === 'sidebarRight' ? f.native : undefined,
    inject(_names, callback) { const stop = callback(ctx); return { dispose: () => stop?.() } },
    slots: { inject: (_slot, callback) => callback(), register: () => () => {} } }
  const stop = f.engine.registerNativeSurface({ ctx, store: f.store, service: f.service, records: f.records }); t.after(stop)
  f.attach()
  f.service.activateTab('tab1', scope)
  assert.equal(f.calls.at(-1).kind, 'focus')
  assert.equal(f.records.get('tab1', scope.sessionId).tab.meta.threadId, 'retained-thread')
  f.records.drop('tab1', scope.sessionId)
  f.service.updateTab('tab1', { title: 'Retargeted review', meta: { draft: 'Pending follow-up' } }, scope)
  assert.equal(f.records.get('tab1', scope.sessionId).tab.title, 'Retargeted review')
  assert.equal(f.records.get('tab1', scope.sessionId).tab.meta.threadId, 'retained-thread')
  f.records.drop('tab1', scope.sessionId)
  f.service.closeTab('tab1', scope)
  assert.deepEqual(closed, ['retained-thread'])
  assert.equal(tabs.length, 0)
  assert.equal(f.records.readPersistent('tab1', scope.sessionId, 'dsh-resource://page/sidechat/retained', 'sidechat'), undefined)
})

function receiver(f) {
  const registry = { entries: () => [], get: kind => f.service.getTab(kind) }
  const column = { ...f.native, tabsIn: () => [], active: () => undefined, isExpanded: () => false }
  const ctx = { get: name => name === 'sidebarRight' ? column : name === 'sidebarRightTabs' ? registry : undefined }
  f.store.setPrefs({ ...f.store.getPrefs(), agentOpenTools: true })
  const api = createSidebarAgentClient()
  return command => api.applyCommand(ctx, { store: f.store, service: f.service, nativeRecords: f.records }, 'session-main', { sessionId: 'session-main', ...command })
}

test('agent rejects the removed bottom surface without changing the active store', t => {
  const f = fixture(t), command = receiver(f), visibility = []
  f.service.registerTab({ id: 'git', title: 'Changes', component: () => null })
  const stop = f.service.subscribeState(() => visibility.push(f.store.getSnapshot().state.bottomOpen))
  t.after(stop)
  assert.throws(() => command({ action: 'visibility', placement: 'bottom', visible: true }), /right sidebar only/)
  assert.throws(() => command({ action: 'open', placement: 'bottom', target: { type: 'tab', kind: 'changes' }, reveal: false }), /right sidebar only/)
  assert.equal(f.store.getSnapshot().state.bottomOpen, false)
  assert.deepEqual(visibility, [])
  assert.equal(f.store.getSnapshot().state, f.store.getSessionStates().get('session-main'))
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 0)
})

test('right-only internalization redirects old bottom requests and migrates tabs only after native placement', t => {
  const f = fixture(t), service = f.engine.createBetterSidebarService(f.store, { rightOnly: true })
  service.setSurface(f.surface); f.attach()
  service.registerTab({ id: 'sidechat', title: 'Side Chat', component: () => null })
  service.openTab({ type: 'sidechat', target: 'bottom', meta: { threadId: 'child-one' } }, { sessionId: 'session-main' })
  assert.equal(f.calls.at(-1).kind, 'sidechat')
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 0)
  const closed = [], nativeTabs = [], registryListeners = new Set(), registryKinds = new Set(), mountedListeners = new Set(), toggles = []
  const expanded = new Map([['session-main', false], ['session-other', false], ['session-arriving', true]])
  let mounted = 'session-main', duringOpen
  service.registerTab({ id: 'editor', title: 'Files', component: () => null, onClose: tab => closed.push(tab.id) })
  f.store.update(state => { state.bottomOpen = true; state.bottomSplits.tabs = [{ id: 'old-file', type: 'editor', title: 'My file', path: 'D:/project/test.txt', line: 4, meta: { viewer: 'code' } }]; state.bottomSplits.active = 'old-file' })
  const column = { mounted: { getSnapshot: () => mounted, subscribe(callback) { mountedListeners.add(callback); return () => mountedListeners.delete(callback) } },
    isExpanded: () => expanded.get(mounted), toggleExpanded: () => { toggles.push(mounted); expanded.set(mounted, !expanded.get(mounted)) },
    tabsIn: sessionId => nativeTabs.filter(tab => tab.sessionId === sessionId),
    openTabIn: (sessionId, kind, options) => { expanded.set(sessionId, true); nativeTabs.push({ id: `native-${nativeTabs.length}`, kind, sessionId, params: options.params }) },
    tabDomain: { occurrence: (_sessionId, tab) => ({ navigation: { getSnapshot: () => ({ params: tab.params }) } }) } }
  const registry = { get: kind => registryKinds.has(kind), subscribe(callback) { registryListeners.add(callback); return () => registryListeners.delete(callback) } }
  const ctx = { sessions: { list: { getSnapshot: () => ({ byId: { 'session-main': { cwd: 'D:/project' } } }), subscribe: callback => { f.listListeners.add(callback); return () => f.listListeners.delete(callback) } } },
    get: name => name === 'sidebarRight' ? column : registry, inject(_names, callback) { const stop = callback(ctx); return { dispose: stop } } }
  const stop = f.engine.registerRightOnlyMigration(ctx, f.store, service)
  t.after(stop)
  assert.equal(f.store.getSnapshot().state.bottomOpen, false)
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 1, 'a missing native descriptor keeps its persisted backlog')
  const requests = []
  service.setSurface({ fileAddress: f.surface.fileAddress,
    openResource(request) { requests.push(request); expanded.set(request.sessionId, true); nativeTabs.push({ id: 'restored-native', kind: 'editor', sessionId: request.sessionId, params: request.params }) },
    openTab(request) { expanded.set(request.sessionId, true); nativeTabs.push({ id: `native-${nativeTabs.length}`, kind: request.kind, sessionId: request.sessionId, params: request.params }); duringOpen?.() } })
  registryKinds.add('editor'); for (const callback of registryListeners) callback()
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 0)
  assert.equal(requests[0].params.meta.viewer, 'code')
  assert.equal(requests[0].params.title, 'My file')
  assert.equal(requests[0].params.line, 4)
  assert.equal(expanded.get('session-main'), false, 'restoring a file cannot reopen a collapsed native surface')
  assert.deepEqual(toggles, ['session-main'])
  assert.deepEqual(closed, [], 'moving the tab must not dispose its owned thread/session')
  for (const callback of registryListeners) callback()
  assert.equal(requests.length, 1, 'migrated state is consumed exactly once')
  expanded.set('session-main', true)
  f.store.update(state => { state.bottomSplits.tabs = [{ id: 'old-browser', type: 'browser', title: 'Preview', path: 'http://localhost:3000', meta: { keep: 'preview-state' } }]; state.bottomSplits.active = 'old-browser' })
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 1)
  registryKinds.add('browser'); for (const callback of registryListeners) callback()
  assert.equal(f.store.getSnapshot().state.bottomSplits.tabs.length, 0, 'native host pages migrate without an owned descriptor')
  assert.equal(nativeTabs.at(-1).params.url, 'http://localhost:3000')
  assert.equal(nativeTabs.at(-1).params.meta.keep, 'preview-state')
  assert.equal(expanded.get('session-main'), true, 'restoring a host-owned page retains an already-expanded surface')
  assert.deepEqual(toggles, ['session-main'], 'an unchanged visibility needs no additional toggle')
  registryKinds.add('sidechat')
  const sidechat = { id: 'old-sidechat', type: 'sidechat', title: 'Pending review', meta: { threadId: 'retained-child', draft: 'Please explain', context: 'Saved reference' } }
  f.store.reduceFor('session-other', state => ({ ...state, bottomOpen: true, bottomSplits: { ...state.bottomSplits, tabs: [sidechat], active: sidechat.id } }))
  assert.equal(f.store.getSessionStates().get('session-other').bottomSplits.tabs.length, 1, 'background backlog stays intact until that conversation is visited')
  assert.equal(nativeTabs.some(tab => tab.sessionId === 'session-other'), false)
  mounted = 'session-other'; f.store.setSession(mounted); for (const callback of mountedListeners) callback()
  const restored = nativeTabs.find(tab => tab.sessionId === 'session-other')
  assert.equal(restored.params.title, sidechat.title)
  assert.deepEqual(restored.params.meta, { ...sidechat.meta, migratedTabId: sidechat.id })
  assert.equal(f.store.getSessionStates().get('session-other').bottomSplits.tabs.length, 0)
  assert.equal(expanded.get('session-other'), false, 'visiting a background backlog retains that destination’s collapsed surface')
  assert.equal(expanded.get('session-main'), true, 'restoration never modifies another conversation’s visibility')
  assert.deepEqual(closed, [])
  f.store.update(state => { state.bottomSplits.tabs = [{ ...sidechat, id: 'old-second-chat' }]; state.bottomSplits.active = 'old-second-chat' })
  assert.equal(nativeTabs.filter(tab => tab.sessionId === 'session-other').length, 2)
  assert.equal(expanded.get('session-other'), false)
  f.store.reduceFor('session-arriving', state => ({ ...state, bottomSplits: { ...state.bottomSplits, tabs: [{ ...sidechat, id: 'arriving-backlog' }], active: 'arriving-backlog' } }))
  duringOpen = () => { mounted = 'session-arriving'; for (const callback of mountedListeners) callback() }
  f.store.update(state => { state.bottomSplits.tabs = [{ ...sidechat, id: 'old-third-chat' }]; state.bottomSplits.active = 'old-third-chat' })
  assert.equal(expanded.get('session-arriving'), true, 'a destination arriving during a native open cannot be toggled by the previous migration')
  assert.equal(toggles.includes('session-arriving'), false)
  assert.equal(f.store.getSessionStates().get('session-arriving').bottomSplits.tabs.length, 1, 'one migration pass cannot begin restoring another arriving session')
  assert.equal(nativeTabs.some(tab => tab.sessionId === 'session-arriving'), false)
})

test('agent command cannot mutate the previous chat while its on-screen workbench is still restoring', t => {
  const f = fixture(t), command = receiver(f)
  f.service.registerTab({ id: 'git', title: 'Changes', component: () => null })
  f.store.setSession('session-previous')
  const previous = f.store.getSnapshot().state
  assert.throws(() => command({ action: 'visibility', placement: 'bottom', visible: true }), /still restoring/)
  assert.throws(() => command({ action: 'open', placement: 'bottom', target: { type: 'tab', kind: 'changes' } }), /still restoring/)
  assert.equal(f.store.getSnapshot().state, previous)
  assert.equal(previous.bottomOpen, false)
  assert.equal(previous.bottomSplits.tabs.length, 0)
})
