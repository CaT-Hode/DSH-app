import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import createSidebarBridge from '../client/sidebar-bridge.mjs'
import createSidebarAgentClient from '../client/sidebar-agent.mjs'

function fixture(t) {
  const require = createRequire(import.meta.url)
  const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : require
  const { JSDOM } = dependencies('jsdom')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'localStorage']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true })
  const engine = createSidebarBridge(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id)).engine
  const store = engine.createSidebarStore(), service = engine.createBetterSidebarService(store), records = engine.createNativeTabRecords()
  records.attachStore(store)
  store.setPrefs({ ...store.getPrefs(), agentOpenTools: true })
  store.setSession('chat-a')
  const tabs = []
  let active, expanded = false
  const column = {
    mounted: { getSnapshot: () => 'chat-a', subscribe: () => () => {} }, tabsIn: id => id === 'chat-a' ? tabs : [],
    active: () => tabs.find(tab => tab.id === active), focus: id => { active = id }, isExpanded: () => expanded, toggleExpanded: () => { expanded = !expanded },
    openResource(address, options) {
      let tab = tabs.find(tab => tab.contentId === address)
      if (!tab) { tab = { id: `native-${tabs.length}`, kind: 'editor', title: 'File', contentId: address }; tabs.push(tab) }
      tab.params = options.params
      active = tab.id; expanded = true
    },
    openTab(kind, options) {
      const tab = { id: `native-${tabs.length}`, kind, title: options.params.title ?? kind, contentId: `sidebar://${kind}`, params: options.params }
      tabs.push(tab); active = tab.id; expanded = true
      records.ensure({ id: tab.id, kind, title: tab.title, params: options.params, scope: { sessionId: 'chat-a', cwd: 'D:/project' }, navigationRevision: 1 })
    },
    tabDomain: { occurrence: (_id, tab) => ({ navigation: { getSnapshot: () => ({ params: tab.params }) } }) },
  }
  const registry = { guide: () => [], get: kind => service.getTab(kind) }
  const ctx = { get: name => name === 'sidebarRight' ? column : name === 'sidebarRightTabs' ? registry : undefined,
    sessions: { list: { getSnapshot: () => ({ byId: { 'chat-a': { cwd: 'D:/project' } } }), subscribe: () => () => {} } } }
  const surface = engine.createNativeSurface(ctx, records)
  service.setSurface(surface)
  service.registerTab({ id: 'editor', title: 'Files', component: () => null })
  const resources = { store, service, nativeRecords: records }, client = createSidebarAgentClient()
  const command = fields => client.applyCommand(ctx, resources, 'chat-a', { sessionId: 'chat-a', action: 'open', placement: 'right', ...fields })
  t.after(() => { surface.dispose(); dom.window.close(); for (const [key, original] of originals) if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key] })
  return { client, ctx, resources, command, tabs, service, records }
}

test('agent matches actual native session-relative file addresses, root folders and deduplicated opens', t => {
  const f = fixture(t)
  const first = f.command({ target: { type: 'file', path: 'D:\\project\\src\\main.ts', title: 'Implementation', line: 12 } })
  assert.equal(f.tabs[0].contentId, 'dsh-resource://file/session/chat-a/src/main.ts')
  assert.equal(f.tabs[0].params.path, undefined, 'native navigation carries metadata while its address names the file')
  assert.equal(f.client.snapshot(f.ctx, f.resources, 'chat-a').tabs[0].path, 'D:/project/src/main.ts')
  assert.equal(f.command({ target: { type: 'file', path: 'D:/project/src/main.ts', line: 15 } }), first)
  assert.equal(f.tabs.length, 1, 'revealing an existing file does not mint another tab')
  assert.equal(f.tabs[0].params.line, 15)
  const folder = f.command({ target: { type: 'folder', path: 'D:/project', title: 'Project root' } })
  assert.equal(f.tabs.find(tab => tab.id === folder).contentId, 'dsh-resource://file/session/chat-a/')
  assert.equal(f.client.snapshot(f.ctx, f.resources, 'chat-a').tabs.find(tab => tab.id === folder).path.replace(/\/$/, ''), 'D:/project')
})

test('a contributed tab factory that refuses an open cannot report the previously active tab as applied', t => {
  const f = fixture(t)
  f.command({ target: { type: 'file', path: 'D:/project/example.txt' } })
  f.service.registerTab({ id: 'refused', title: 'No capacity', component: () => null, createTab: () => null })
  assert.throws(() => f.command({ target: { type: 'tab', kind: 'refused' } }), /did not open/)
  assert.throws(() => f.command({ placement: 'bottom', target: { type: 'tab', kind: 'refused' } }), /right sidebar only/)
  assert.equal(f.tabs.length, 1)
})

test('staging an existing Side Chat preserves thread state and creates no duplicate or sent message', t => {
  const f = fixture(t)
  f.service.registerTab({ id: 'sidechat', title: 'Side Chat', component: () => null })
  const first = f.command({ target: { type: 'tab', kind: 'sidechat', threadId: 'child', title: 'Review', draft: 'First draft' } })
  f.records.update(first, { meta: { ...f.records.get(first).tab.meta, autoCreate: false, contextItems: [{ title: 'Pinned code', text: 'const preserved = true' }], composerSettings: { wrap: true } } })
  const reopened = f.command({ target: { type: 'tab', kind: 'sidechat', threadId: 'child', title: 'Second review', draft: 'Review this change', context: 'Selected evidence' } })
  assert.equal(reopened, first)
  const tab = f.records.get(first).tab
  assert.equal(f.tabs.length, 1)
  assert.deepEqual(tab.meta.contextItems, [{ title: 'Pinned code', text: 'const preserved = true' }])
  assert.deepEqual(tab.meta.composerSettings, { wrap: true })
  assert.equal(tab.meta.autoCreate, false)
  assert.equal(tab.meta.draft, 'Review this change')
  assert.equal(tab.meta.context, 'Selected evidence')
  assert.equal(tab.title, 'Second review')
  const side = f.client.snapshot(f.ctx, f.resources, 'chat-a').tabs.find(tab => tab.id === first)
  assert.equal(side.threadId, 'child')
  assert.equal(side.draftPending, true)
  assert.equal(side.draft, undefined)
  f.records.update(first, { meta: { ...tab.meta, draft: undefined, context: undefined, draftPending: true, contextPending: true } })
  let pending = f.client.snapshot(f.ctx, f.resources, 'chat-a').tabs.find(tab => tab.id === first)
  assert.equal(pending.draftPending, true, 'consuming a seed retains its actual editable composer state')
  assert.equal(pending.contextPending, true)
  f.records.update(first, { meta: { ...f.records.get(first).tab.meta, draftPending: false, contextPending: false } })
  pending = f.client.snapshot(f.ctx, f.resources, 'chat-a').tabs.find(tab => tab.id === first)
  assert.equal(pending.draftPending, false, 'sending or removing text cannot resurrect the stale navigation seed')
  assert.equal(pending.contextPending, false)
})

test('official document preview providers count as a successful file open', t => {
  const f = fixture(t)
  const original = f.ctx.get('sidebarRight').openResource
  f.ctx.get('sidebarRight').openResource = (address, options) => { original(address, options); f.tabs.at(-1).kind = 'text' }
  const tabId = f.command({ target: { type: 'file', path: 'D:/project/document.pdf' } })
  const opened = f.client.snapshot(f.ctx, f.resources, 'chat-a').tabs.find(tab => tab.id === tabId)
  assert.equal(opened.type, 'text')
  assert.equal(opened.address, 'dsh-resource://file/session/chat-a/document.pdf')
})
