/** Reload actual native record owners over the same browser storage and tab identities. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import createSidebarBridge from '../client/sidebar-bridge.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

function fixture(t) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'localStorage']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true })
  const engine = createSidebarBridge(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id)).engine
  const owners = []
  function owner(initialSession = 's1') {
    const store = engine.createSidebarStore(), records = engine.createNativeTabRecords(), service = engine.createBetterSidebarService(store)
    store.setSession(initialSession); records.attachStore(store)
    let mounted = initialSession
    const tables = new Map(), closeHandlers = new Map()
    const native = {
      mounted: { getSnapshot: () => mounted, subscribe: () => () => {} }, tabsIn: sessionId => tables.get(sessionId) ?? [],
      registerCloseHandler: (kind, callback) => { closeHandlers.set(kind, callback); return () => closeHandlers.delete(kind) },
      close: tabId => native.closeIn(mounted, tabId),
      closeIn: (sessionId, tabId) => {
        const tabs = tables.get(sessionId) ?? [], index = tabs.findIndex(tab => tab.id === tabId)
        if (index < 0) return
        closeHandlers.get(tabs[index].kind)?.(sessionId, tabs[index])
        tabs.splice(index, 1)
      },
    }
    const registry = { register: () => () => {} }
    const ctx = { get: name => name === 'sidebarRight' ? native : name === 'sidebarRightTabs' ? registry : undefined,
      sessions: { list: { subscribe: () => () => {} } },
      inject: (_dependencies, callback) => { const off = callback(ctx); return { dispose: () => off?.() } },
      slots: { inject: (_name, callback) => callback(), register: () => () => {} } }
    const surface = engine.createNativeSurface(ctx, records)
    service.setSurface(surface)
    for (const id of ['editor', 'browser', 'sidechat']) service.registerTab({ id, title: id, component: () => null })
    const stop = engine.registerNativeSurface({ ctx, store, service, records })
    const ensure = input => {
      const tabs = tables.get(input.scope.sessionId) ?? []
      if (!tabs.some(tab => tab.id === input.id)) tabs.push({ id: input.id, kind: input.kind, title: input.title, contentId: input.contentId })
      tables.set(input.scope.sessionId, tabs)
      return records.ensure(input)
    }
    let disposed = false
    const dispose = () => { if (disposed) return; disposed = true; stop(); surface.dispose(); records.dispose?.() }
    const result = { store, records, service, native, ensure, dispose, mount: sessionId => { mounted = sessionId; store.setSession(sessionId) } }
    owners.push(result)
    return result
  }
  t.after(() => { for (const item of owners) item.dispose(); dom.window.close(); for (const [key, value] of originals) if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] })
  return { owner }
}

const file = (sessionId = 's1', id = 'tab1') => ({ id, kind: 'editor', title: 'first.ts',
  contentId: `dsh-resource://file/session/${sessionId}/src/first.ts`,
  params: { path: 'src/first.ts', title: 'Agent review', line: 21, meta: { treeOpen: true, treeWidth: 280 } },
  scope: { sessionId, cwd: 'D:/project' }, navigationRevision: 1 })
const restored = input => ({ ...input, params: input.kind === 'editor' ? { path: 'src/first.ts' } : undefined, navigationRevision: 0 })

test('file title, line, viewer preferences and in-place path survive a full owner reload', t => {
  const f = fixture(t), first = f.owner(), input = file()
  first.ensure(input)
  first.service.updateTab(input.id, { path: 'D:/project/src/second.ts', title: 'Second file', line: 34, meta: { treeWidth: 310, viewer: 'markdown' } }, input.scope)
  first.dispose()
  const next = f.owner(), record = next.ensure(restored(input))
  assert.equal(record.tab.path, 'D:/project/src/second.ts')
  assert.equal(record.tab.title, 'Second file')
  assert.equal(record.tab.line, 34)
  assert.equal(record.tab.meta.treeOpen, true)
  assert.equal(record.tab.meta.treeWidth, 310)
  assert.equal(record.tab.meta.viewer, 'markdown')
  const reopened = next.ensure({ ...input, navigationRevision: 2, params: { path: 'src/first.ts', title: 'New navigation', line: 5 } })
  assert.equal(reopened.tab.path, 'src/first.ts', 'a new explicit navigation takes precedence over restored view state')
  assert.equal(reopened.tab.line, 5)
  assert.equal(reopened.tab.title, 'New navigation')
})

test('owned browser URL and title survive reload without navigation seeds', t => {
  const f = fixture(t), first = f.owner()
  const input = { id: 'tab2', kind: 'browser', title: 'Browser', contentId: 'sidebar://browser/2',
    params: { url: 'http://localhost:5173/', title: 'Development preview' }, scope: { sessionId: 's1' }, navigationRevision: 1 }
  first.ensure(input)
  first.service.updateTab(input.id, { title: 'Example preview', meta: { url: 'https://example.com/next' } }, input.scope)
  first.dispose()
  const next = f.owner(), record = next.ensure(restored(input))
  assert.equal(record.tab.meta.url, 'https://example.com/next')
  assert.equal(record.tab.title, 'Example preview')
})

test('identical native tab IDs retain independent saved state per conversation and content address', t => {
  const f = fixture(t), first = f.owner(), a = file('s1'), b = file('s2')
  first.ensure(a)
  first.service.updateTab(a.id, { title: 'First chat', line: 11 }, a.scope)
  first.mount('s2'); first.ensure(b)
  first.service.updateTab(b.id, { title: 'Second chat', line: 22 }, b.scope)
  first.dispose()
  const second = f.owner('s2')
  assert.equal(second.ensure(restored(b)).tab.title, 'Second chat')
  second.mount('s1')
  assert.equal(second.ensure(restored(a)).tab.title, 'First chat')
  assert.equal(second.ensure(restored(a)).tab.line, 11)
  second.dispose()
  const third = f.owner()
  const other = third.ensure({ ...restored(a), contentId: 'dsh-resource://file/session/s1/src/unrelated.ts', title: 'unrelated.ts', params: { path: 'src/unrelated.ts' } })
  assert.equal(other.tab.title, 'unrelated.ts', 'a reused native identity cannot adopt another resource view')
  assert.equal(other.tab.path, 'src/unrelated.ts')
  assert.equal(other.tab.line, undefined)
})

test('actual native close removes only its view restoration while unload and another chat remain durable', t => {
  const f = fixture(t), first = f.owner(), a = file('s1'), b = file('s2')
  first.ensure(a); first.service.updateTab(a.id, { title: 'Closed view', line: 11 }, a.scope)
  first.mount('s2'); first.ensure(b); first.service.updateTab(b.id, { title: 'Retained view', line: 22 }, b.scope)
  first.mount('s1'); first.ensure(restored(a))
  first.service.closeTab(a.id, a.scope)
  assert.equal(first.native.tabsIn('s1').length, 0)
  first.dispose()
  const second = f.owner(), reopened = second.ensure(restored(a))
  assert.equal(reopened.tab.title, a.title)
  assert.equal(reopened.tab.line, undefined)
  second.mount('s2')
  assert.equal(second.ensure(restored(b)).tab.title, 'Retained view')
  assert.equal(second.ensure(restored(b)).tab.line, 22)
})

test('retained native bodies with identical IDs cannot mutate or close another mounted conversation', t => {
  const f = fixture(t), owner = f.owner(), lifetime = new AbortController(), a = file('s1'), b = file('s2')
  owner.ensure({ ...a, signal: lifetime.signal })
  owner.service.updateTab(a.id, { title: 'First chat', line: 11 }, a.scope)
  owner.mount('s2'); owner.ensure(b)
  owner.service.updateTab(b.id, { title: 'Second chat', line: 22 }, b.scope)
  owner.ensure({ ...a, signal: lifetime.signal }) // A retained background component renders again.
  assert.equal(owner.records.get(a.id, 's1').tab.title, 'First chat')
  assert.equal(owner.records.get(b.id, 's2').tab.title, 'Second chat')
  owner.service.updateTab(a.id, { title: 'Background update', line: 33 }, a.scope)
  assert.equal(owner.records.get(a.id, 's1').tab.title, 'Background update')
  assert.equal(owner.records.get(b.id, 's2').tab.title, 'Second chat')
  assert.equal(owner.records.get(b.id, 's2').tab.line, 22)
  owner.service.closeTab(a.id, a.scope)
  assert.equal(owner.native.tabsIn('s1').length, 0)
  assert.equal(owner.native.tabsIn('s2').length, 1)
  lifetime.abort()
  assert.equal(owner.records.has(b.id, 's2'), true)
})

test('a staged Side Chat seed survives reload once and stays consumed after its metadata is cleared', t => {
  const f = fixture(t), first = f.owner()
  const context = [{ title: 'Review note', text: 'Inspect the current diff', source: 'Changes' }]
  const input = { id: 'tab3', kind: 'sidechat', title: 'Review', contentId: 'sidebar://sidechat/review',
    params: { meta: { threadId: 'review-thread', draft: 'Explain the change', context, draftPending: true, contextPending: true } },
    scope: { sessionId: 's1' }, navigationRevision: 1 }
  first.ensure(input); first.dispose()
  const second = f.owner(), seeded = second.ensure(restored(input))
  assert.equal(seeded.tab.meta.threadId, 'review-thread')
  assert.equal(seeded.tab.meta.draft, 'Explain the change')
  assert.deepEqual(seeded.tab.meta.context, context)
  second.service.updateTab(input.id, { meta: { draft: undefined, context: undefined, draftPending: false, contextPending: false } }, input.scope)
  second.dispose()
  const third = f.owner(), consumed = third.ensure(restored(input))
  assert.equal(consumed.tab.meta.threadId, 'review-thread')
  assert.equal(consumed.tab.meta.draft, undefined)
  assert.equal(consumed.tab.meta.context, undefined)
  assert.equal(consumed.tab.meta.draftPending, false)
  assert.equal(consumed.tab.meta.contextPending, false)
})
