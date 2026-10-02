/** Run explicit New Chat preparation through the released Workspace navigator. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import createSidebarNewChatClient, { newChatWorkspace } from '../client/sidebar-new-chat.mjs'

const require = createRequire(import.meta.url)
const runtime = process.env.DSH_APP_TEST_CORE_ROOT
if (!runtime) throw new Error('Set DSH_APP_TEST_CORE_ROOT to the supported released runtime')
const cordis = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href)
const source = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js'), 'utf8')
  .replace('exports.apply = apply;', 'exports.UiWorkspaceService = UiWorkspaceService; exports.recentWorkspace = recentWorkspace; exports.apply = apply;')
let released
runInNewContext(source, { AbortController, AbortSignal, console, window: { __ModuleLoader__: { load: definition => {
  released = definition.factory(id => id === '@deepseek-ai/dsh-client-store' || id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : id === '@deepseek-ai/cordis' ? cordis : require(id))
} } } })

function fixture(options = {}) {
  const current = Object.hasOwn(options, 'current') ? options.current : 'blank', cold = options.cold ?? false
  const items = [
    { workspaceId: 'w1', path: 'D:/one', createdAt: '2026-09-01', sessionIds: ['blank'] },
    { workspaceId: 'w2', path: 'D:/two', createdAt: '2026-09-02', sessionIds: ['second'] },
  ]
  const byId = { blank: { id: 'blank', cwd: 'D:/one', blank: true, updatedAt: 10 }, second: { id: 'second', cwd: 'D:/two', blank: true, updatedAt: 20 } }
  const workspaceState = { phase: 'ready', items, archivedSessionIds: [] }
  const sessionState = { phase: 'ready', ids: ['blank', 'second'], byId }
  const layouts = new Map(['blank', 'second'].map(id => [id, { expanded: true, activePaneId: 'pane1', tabs: { tab1: { id: 'tab1', kind: 'guide', title: 'Saved', contentId: 'guide' } }, nodes: { pane1: { tabs: ['tab1'], activeTabId: 'tab1' } } }]))
  const saved = new Map([...layouts].map(([id, value]) => [id, JSON.stringify(value)]))
  const adopted = new Map(), calls = [], waits = new Map()
  const actionsFor = id => ({ setExpanded(sessionId, expanded) {
    assert.equal(sessionId, id)
    layouts.get(id).expanded = expanded
    saved.set(id, JSON.stringify(layouts.get(id)))
    calls.push(['collapse', id, expanded])
  } })
  if (!cold) adopted.set('blank', actionsFor('blank'))
  const handle = { create(id) {
    calls.push(['create-native', id])
    layouts.set(id, JSON.parse(saved.get(id)))
    const actions = actionsFor(id)
    adopted.set(id, actions)
    return { actions, getSnapshot: () => ({ bySession: { [id]: layouts.get(id) } }) }
  } }
  let navigation, currentKey = current
  const ctx = {
    workspaces: { list: { getSnapshot: () => workspaceState } },
    sessions: { list: { getSnapshot: () => sessionState },
      create: async ({ workspaceId, sessionId }) => waits.has(workspaceId) ? waits.get(workspaceId).promise : sessionId ?? (workspaceId === 'w1' ? 'blank' : 'second'),
      retain: id => ({ sessionId: id, release: () => calls.push(['release', id]) }), subagentAddress: () => undefined },
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: currentKey }) } } },
    layout: { beginNavigation() { navigation?.abort(); navigation = new AbortController(); return navigation.signal }, selectPanel() { navigation?.abort() } },
    get: name => name === 'sidebarRight' ? { actionsFor: id => adopted.get(id) } : undefined,
    slots: { entries: key => key === 'rightbar.session' ? [{ store: handle }] : key === 'conversation.session.header.corner' ? [{ store: { create() { throw new Error('unrelated header store') } } }, { store: handle }] : [] },
  }
  // These are the actual released connect/reuse/open/replace methods; retain,
  // layout and host creation are the external service boundary of this test.
  const navigator = Object.create(released.UiWorkspaceService.prototype)
  Object.assign(navigator, { ctx, workspaces: ctx.workspaces, sessions: ctx.sessions, connecting: new Map(), lifetime: new AbortController(),
    notify: notice => calls.push(['notice', notice]), selection: { set(value) { currentKey = value.sessionId; calls.push(['selection', value.sessionId, layouts.get(value.sessionId)?.expanded]) } },
    mainReference: current === undefined ? undefined : { sessionId: current, release() {} } })
  ctx.uiWorkspace = navigator
  return { ctx, calls, layouts, saved, adopted, handle, workspaceState, sessionState,
    wait(workspaceId) { let resolve; const promise = new Promise(done => { resolve = done }); waits.set(workspaceId, { promise, resolve }); return resolve },
    externalNavigation: () => ctx.layout.beginNavigation(), setCurrent: id => { currentKey = id } }
}

test('Workspace selection preserves released recent ordering, ties and readiness', () => {
  const f = fixture({ current: undefined })
  assert.equal(newChatWorkspace(f.ctx), released.recentWorkspace(f.workspaceState.items, f.sessionState.byId))
  f.sessionState.byId.blank.updatedAt = 20
  assert.equal(newChatWorkspace(f.ctx), 'w1', 'equal timestamps retain Host Workspace order')
  f.workspaceState.items.push({ workspaceId: 'empty', createdAt: '2026-10-01', sessionIds: [] })
  assert.equal(newChatWorkspace(f.ctx), released.recentWorkspace(f.workspaceState.items, f.sessionState.byId), 'empty Workspaces use createdAt')
  f.setCurrent('blank')
  assert.equal(newChatWorkspace(f.ctx), 'w1', 'current Workspace wins over recent')
  assert.equal(newChatWorkspace(f.ctx, 'w2'), 'w2')
  f.setCurrent(undefined); f.workspaceState.phase = 'loading'
  assert.equal(newChatWorkspace(f.ctx), undefined)
})

test('same-id blank reuse collapses the adopted target once before selection and allows later opens', async () => {
  const f = fixture(), client = createSidebarNewChatClient()
  const tabs = f.layouts.get('blank').tabs
  await client.startSession(f.ctx)
  assert.deepEqual(f.calls.slice(0, 2), [['collapse', 'blank', false], ['selection', 'blank', false]])
  assert.equal(f.calls.some(call => call[0] === 'create-native'), false, 'never replace an adopted renderer store')
  assert.equal(f.layouts.get('blank').tabs, tabs)
  f.adopted.get('blank').setExpanded('blank', true)
  await Promise.resolve()
  assert.equal(f.layouts.get('blank').expanded, true, 'a later manual or Agent open stays expanded')
})

test('cold reused blank is collapsed through the shared native factory, retaining saved tabs', async () => {
  const f = fixture({ cold: true }), client = createSidebarNewChatClient()
  const previous = JSON.parse(f.saved.get('blank'))
  await client.startSession(f.ctx)
  assert.deepEqual(f.calls.slice(0, 3), [['create-native', 'blank'], ['collapse', 'blank', false], ['selection', 'blank', false]])
  const restored = f.handle.create('blank').getSnapshot().bySession.blank
  assert.deepEqual(restored, { ...previous, expanded: false }, 'renderer recreation reads all saved tabs with the collapsed presentation')
  assert.equal(f.layouts.get('second').expanded, true)
})

test('superseded New Chat requests cannot collapse the losing destination', async () => {
  const f = fixture({ cold: true }), client = createSidebarNewChatClient()
  const firstReady = f.wait('w1'), secondReady = f.wait('w2')
  const first = client.startSession(f.ctx, 'w1'), second = client.startSession(f.ctx, 'w2')
  secondReady('second'); await second
  firstReady('blank'); await first
  assert.deepEqual(f.calls.filter(call => call[0] === 'collapse'), [['collapse', 'second', false]])
  assert.equal(f.layouts.get('blank').expanded, true)
})

test('another navigation cancels pending New Chat without touching its saved surface', async () => {
  const f = fixture({ cold: true }), client = createSidebarNewChatClient(), ready = f.wait('w1')
  const pending = client.startSession(f.ctx, 'w1')
  f.externalNavigation(); ready('blank'); await pending
  assert.deepEqual(f.calls, [])
  assert.equal(f.layouts.get('blank').expanded, true)
})

test('plugin teardown prevents a late preparation callback and future starts', async () => {
  const f = fixture({ cold: true }), client = createSidebarNewChatClient(), ready = f.wait('w1')
  const pending = client.startSession(f.ctx, 'w1')
  client.dispose(); ready('blank'); await pending
  assert.equal(f.calls.some(call => call[0] === 'collapse' || call[0] === 'create-native'), false)
  const before = f.calls.length
  await client.startSession(f.ctx)
  assert.equal(f.calls.length, before)
})

test('no Workspace target retains the core new-session landing behavior', async () => {
  const f = fixture({ current: undefined }), client = createSidebarNewChatClient()
  f.workspaceState.items.splice(0)
  await client.startSession(f.ctx)
  assert.deepEqual(f.calls, [['selection', undefined, undefined]])
  assert.equal(f.layouts.get('blank').expanded, true)
})
