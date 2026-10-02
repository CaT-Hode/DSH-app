import assert from 'node:assert/strict'
import test from 'node:test'
import createSidebarAgentClient from '../client/sidebar-agent.mjs'
import createSidebarWorkbenchClient from '../client/sidebar-workbench.mjs'

function fixture() {
  const state = { bottomOpen: false, bottomSplits: { kind: 'leaf', id: 'pane', tabs: [], active: '' } }
  const native = []
  let active, expanded = false, enabled = true, mounted = 'chat-a'
  const column = {
    mounted: { getSnapshot: () => mounted }, tabsIn: () => native,
    active: () => native.find(tab => tab.id === active), isExpanded: () => expanded,
    toggleExpanded: () => { expanded = !expanded }, focus: id => { active = id },
    close: id => { const index = native.findIndex(tab => tab.id === id); if (native[index]?.kind !== 'guide') native.splice(index, 1) },
    openTab: (kind, options) => { native.push({ id: `native-${native.length}`, kind, title: options?.params?.title ?? kind, contentId: `sidebar://${kind}`, params: options?.params }); active = native.at(-1).id; expanded = true },
    openResource: (address, options) => { native.push({ id: `native-${native.length}`, kind: 'editor', title: 'file', contentId: address, params: options?.params }); active = native.at(-1).id; expanded = true },
    tabDomain: { occurrence: (_, tab) => ({ navigation: { getSnapshot: () => ({ params: native.find(row => row.id === tab.id)?.params }) } }) },
  }
  const store = {
    getPrefs: () => ({ agentOpenTools: enabled }), getSuspended: () => false,
    getSnapshot: () => ({ sessionId: 'chat-a', state }),
    getSessionStates: () => new Map([['chat-a', state]]),
    reduce: reducer => { Object.assign(state, reducer(state)) },
    reduceFor: (sessionId, reducer) => { assert.equal(sessionId, 'chat-a'); Object.assign(state, reducer(state)) },
  }
  const kinds = ['editor', 'git', 'subagent', 'browser', 'sidechat']
  const service = {
    getTabs: () => kinds.map(id => ({ id, title: id })), getTab: kind => kinds.includes(kind) && { id: kind }, isTabEnabled: () => true,
    openTab: (seed, scope) => {
      assert.equal(scope.sessionId, 'chat-a')
      if (seed.target === 'bottom') { const tab = { id: seed.id ?? `bottom-${state.bottomSplits.tabs.length}`, type: seed.type, title: seed.title ?? seed.type, path: seed.path, meta: seed.meta }; state.bottomSplits.tabs.push(tab); state.bottomSplits.active = tab.id; state.bottomOpen = true }
      else column.openTab(seed.type, { params: seed })
    },
    closeTab: id => { state.bottomSplits.tabs = state.bottomSplits.tabs.filter(tab => tab.id !== id) },
    activateTab: id => { state.bottomSplits.active = id },
  }
  const registry = { entries: () => [{ kind: 'terminal', title: () => 'Terminal' }], guide: () => [{ kind: 'terminal', title: () => 'Terminal' }], get: kind => kinds.includes(kind) || kind === 'terminal' }
  const ctx = { get: name => name === 'sidebarRight' ? column : name === 'sidebarRightTabs' ? registry : undefined }
  const resources = { store, service }
  const api = createSidebarAgentClient()
  const command = fields => api.applyCommand(ctx, resources, 'chat-a', { sessionId: 'chat-a', ...fields })
  return { api, ctx, resources, command, state, column, native, setEnabled: value => { enabled = value }, setMounted: value => { mounted = value } }
}

test('agent opens and controls native tabs, protects session scope and reports actual metadata', () => {
  const f = fixture()
  const file = f.command({ action: 'open', target: { type: 'file', path: 'src/main.ts', line: 12, title: 'Implementation' } })
  const page = f.command({ action: 'open', target: { type: 'url', url: 'http://localhost:3000/' } })
  let snapshot = f.api.snapshot(f.ctx, f.resources, 'chat-a')
  assert.equal(snapshot.tabs[0].path, 'src/main.ts')
  assert.equal(f.native[0].params.line, 12)
  assert.equal(snapshot.tabs[1].url, 'http://localhost:3000/')
  assert.equal(snapshot.availableTabs.find(tab => tab.kind === 'terminal').title, 'Terminal')
  f.command({ action: 'activate', tabId: file })
  assert.equal(f.column.active().id, file)
  f.command({ action: 'close', tabId: page })
  assert.equal(f.native.length, 1)
  f.command({ action: 'visibility', placement: 'right', visible: false })
  assert.equal(f.column.isExpanded(), false)
  f.command({ action: 'open', target: { type: 'folder', path: 'src' }, reveal: false })
  assert.equal(f.column.isExpanded(), false, 'background opens keep a hidden panel hidden')
  assert.deepEqual(f.native.at(-1).params.meta, { dir: true })
  f.setMounted('chat-b')
  assert.throws(() => f.command({ action: 'activate', tabId: file }), /no longer on screen/)
  f.setMounted('chat-a'); f.setEnabled(false)
  assert.throws(() => f.command({ action: 'close', tabId: file }), /disabled/)
})

test('right-only aliases, focus, close, visibility and resources use the native sidebar', () => {
  const f = fixture()
  const first = f.command({ action: 'open', placement: 'right', target: { type: 'tab', kind: 'changes' } })
  const second = f.command({ action: 'open', target: { type: 'url', url: 'https://example.com/' } })
  assert.equal(f.native[0].kind, 'git')
  assert.equal(f.native[1].params.url, 'https://example.com/')
  f.command({ action: 'activate', tabId: first })
  assert.equal(f.api.snapshot(f.ctx, f.resources, 'chat-a').tabs.find(tab => tab.id === first).active, true)
  f.command({ action: 'close', tabId: second })
  assert.equal(f.native.length, 1)
  f.command({ action: 'visibility', placement: 'right', visible: false })
  assert.equal(f.column.isExpanded(), false)
  f.command({ action: 'open', target: { type: 'resource', address: 'dsh-resource://preview/test' } })
  assert.equal(f.native.at(-1).contentId, 'dsh-resource://preview/test')
  assert.throws(() => f.command({ action: 'open', placement: 'bottom', target: { type: 'resource', address: 'dsh-resource://preview/test' } }), /right sidebar only/)
  assert.throws(() => f.command({ action: 'visibility', placement: 'bottom', visible: true }), /right sidebar only/)
  assert.throws(() => f.command({ action: 'open', target: { type: 'tab', kind: 'unknown' } }), /unavailable/)
  f.state.bottomOpen = true
  f.state.bottomSplits.tabs.push({ id: 'old-bottom', type: 'git' })
  const snapshot = f.api.snapshot(f.ctx, f.resources, 'chat-a')
  assert.equal(snapshot.bottomOpen, undefined)
  assert.equal(snapshot.tabs.some(tab => tab.id === 'old-bottom'), false)
  assert.ok(snapshot.availableTabs.every(tab => tab.placements.length === 1 && tab.placements[0] === 'right'))
  f.native.push({ id: 'guide', kind: 'guide', contentId: 'sidebar://guide', title: 'Start' })
  assert.throws(() => f.command({ action: 'close', tabId: 'guide' }), /protected/)
})

test('browser navigation permits only HTTP(S), accepts localhost and rejects credentials and script URLs', () => {
  const { normalizeUrl } = createSidebarWorkbenchClient(() => ({}))
  assert.equal(normalizeUrl('localhost:5173/demo'), 'http://localhost:5173/demo')
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/')
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /Invalid/)
  assert.throws(() => normalizeUrl('https://user:password@example.com'), /Invalid/)
  assert.throws(() => normalizeUrl('file:///D:/secret'), /Invalid/)
})
