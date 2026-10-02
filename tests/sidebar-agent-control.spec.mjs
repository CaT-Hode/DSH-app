import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import { WebSocket } from 'ws'
import { installSidebar } from '../lib/sidebar/index.mjs'
import { SidebarAgentRegistry, sanitizeSidebarSnapshot, resolveSidebarOpenTarget, sidebarSessionCwd, validateSidebarSidechatTarget, SIDEBAR_AGENT_PATH } from '../lib/sidebar/agent-control.mjs'

const signal = () => new AbortController().signal
const snapshot = (id = 'file-tab') => ({ tabs: [{ id, type: 'editor', title: 'File', placement: 'right', active: true }], availableTabs: [{ kind: 'editor', title: 'Editor', enabled: true }, { kind: 'git', title: 'Changes', enabled: true }, { kind: 'sidechat', title: 'Side Chat', enabled: true, placements: ['right'] }], rightOpen: true })

async function workspace(t) {
  const path = await mkdtemp(join(tmpdir(), 'dsh-sidebar-agent-'))
  t.after(async () => {
    assert.ok(!relative(resolve(tmpdir()), resolve(path)).startsWith('..'))
    await rm(path, { recursive: true, force: true })
  })
  await writeFile(join(path, 'example.txt'), 'Open this file')
  await mkdir(join(path, 'folder'))
  return path
}

test('navigation preserves authoritative cwd and rejects mismatched kinds, unsafe schemes and foreign session resources', async t => {
  const cwd = await workspace(t)
  assert.deepEqual(await resolveSidebarOpenTarget({ target: 'example.txt', line: 2 }, 's1', cwd), { type: 'file', path: join(cwd, 'example.txt'), title: 'example.txt', line: 2 })
  assert.equal((await resolveSidebarOpenTarget({ target: 'folder' }, 's1', cwd)).type, 'folder')
  assert.deepEqual(await resolveSidebarOpenTarget({ target: 'https://example.com/page', title: 'Preview' }, 's1', cwd), { type: 'url', url: 'https://example.com/page', title: 'Preview' })
  assert.deepEqual(await resolveSidebarOpenTarget({ target: 'git', type: 'tab' }, 's1', cwd), { type: 'tab', kind: 'git' })
  for (const [alias, kind] of [['files', 'editor'], ['changes', 'git'], ['tasks', 'subagent']]) assert.equal((await resolveSidebarOpenTarget({ target: alias, type: 'tab' }, 's1', cwd)).kind, kind)
  assert.equal((await resolveSidebarOpenTarget({ target: 'dsh-resource://file/session/s1/example.txt' }, 's1', cwd)).path, join(cwd, 'example.txt'))
  assert.equal((await resolveSidebarOpenTarget({ target: 'dsh-resource://file/session/s1/' }, 's1', cwd)).path, cwd)
  const absolute = join(cwd, 'example.txt').replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  assert.equal((await resolveSidebarOpenTarget({ target: `dsh-resource://file/absolute/${absolute}` }, 's1', cwd)).path, join(cwd, 'example.txt'))
  assert.equal((await resolveSidebarOpenTarget({ target: 'dsh-resource://file/session/s1/folder/../example.txt' }, 's1', cwd)).path, join(cwd, 'example.txt'))
  assert.deepEqual(await resolveSidebarOpenTarget({ target: 'dsh-resource://chart/session/s1/revenue' }, 's1', cwd), { type: 'resource', address: 'dsh-resource://chart/session/s1/revenue' })
  for (const args of [{ target: 'javascript:alert(1)' }, { target: 'file:///etc/passwd' }, { target: 'example.txt', type: 'folder' }, { target: 'folder', type: 'file' }, { target: 'https://example.com', type: 'file' }, { target: 'https://example.com', line: 0 }, { target: 'https://user:password@example.com' }, { target: 'dsh-resource://file/session/s2/example.txt' }, { target: 'dsh-resource://chart/session/s2/revenue' }, { target: 'dsh-resource://chart/session/s1/../../session/s2/revenue' }, { target: 'dsh-resource://file/session/s2/../s1/example.txt' }]) {
    await assert.rejects(resolveSidebarOpenTarget(args, 's1', cwd))
  }
  const ctx = { sessions: { get: id => id === 's1' ? { header: { cwd } } : undefined }, get: () => undefined }
  assert.equal(await sidebarSessionCwd(ctx, 's1'), cwd)
  await assert.rejects(sidebarSessionCwd(ctx, 'missing'), /not available/)
  let closed = 0
  ctx.get = () => ({ open: async id => { assert.equal(id, 'cold'); return { header: { cwd }, close: async () => closed++ } } })
  assert.equal(await sidebarSessionCwd(ctx, 'cold'), cwd)
  assert.equal(closed, 1)
})

test('local paths preserve the original lexical and OS permission policy for external files and junctions', async t => {
  const cwd = await workspace(t), outside = await workspace(t)
  const external = join(outside, 'example.txt')
  assert.equal((await resolveSidebarOpenTarget({ target: external }, 's1', cwd)).path, external)
  await symlink(outside, join(cwd, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  const linked = join(cwd, 'linked', 'example.txt')
  assert.equal((await resolveSidebarOpenTarget({ target: 'linked/example.txt' }, 's1', cwd)).path, linked, 'opening preserves lexical identity instead of changing policy through realpath')
})

test('Side Chat navigation stages bounded unsent text and validates existing child ownership live and cold', async t => {
  const cwd = await workspace(t)
  const target = await resolveSidebarOpenTarget({ target: 'sidechat', type: 'tab', title: 'Review', draft: 'Please review these sources', context: 'Selected evidence', threadId: 'child' }, 's1', cwd)
  assert.deepEqual(target, { type: 'tab', kind: 'sidechat', title: 'Review', draft: 'Please review these sources', context: 'Selected evidence', threadId: 'child' })
  const references = [{ title: 'Diff', text: 'Review the changed sources', source: 'Changes' }, { title: 'Test results', text: 'All focused tests passed' }]
  assert.deepEqual((await resolveSidebarOpenTarget({ target: 'sidechat', type: 'tab', context: references }, 's1', cwd)).context, references)
  assert.equal((await resolveSidebarOpenTarget({ target: 'sidechat', type: 'tab', context: [] }, 's1', cwd)).context, undefined)
  for (const args of [{ target: 'git', type: 'tab', draft: 'wrong kind' }, { target: 'example.txt', context: 'wrong target' }, { target: 'sidechat', type: 'tab', draft: '中'.repeat(11000) }, { target: 'sidechat', type: 'tab', threadId: '' }]) await assert.rejects(resolveSidebarOpenTarget(args, 's1', cwd))
  for (const context of [null, ['unstructured'], [{ title: 'Missing text' }], [{ title: 'x'.repeat(161), text: 'Too long a title' }], [{ title: 'Bad source', text: 'Some text', source: '' }], [{ title: 'Large text', text: '中'.repeat(11000) }], Array.from({ length: 21 }, () => ({ title: 'Many', text: 'References' }))]) await assert.rejects(resolveSidebarOpenTarget({ target: 'sidechat', type: 'tab', context }, 's1', cwd))
  const descriptor = provider => [{ type: 'subagent/descriptor', seq: 0, time: 1, data: { version: 3, mode: 'continuable', provider, label: 'Side: Review' } }]
  const ctx = { sessions: { get: id => ({ child: { header: { parentSession: 's1', origin: 'subagent' }, snapshotEvents: () => descriptor('sidechat') }, foreign: { header: { parentSession: 's2', origin: 'subagent' }, snapshotEvents: () => descriptor('sidechat') }, ordinary: { header: { parentSession: 's1', origin: 'subagent' }, snapshotEvents: () => descriptor('other') } })[id] }, get: () => undefined }
  await validateSidebarSidechatTarget(ctx, 's1', target, signal())
  for (const threadId of ['foreign', 'ordinary', 'missing']) await assert.rejects(validateSidebarSidechatTarget(ctx, 's1', { ...target, threadId }, signal()))
  let reads = 0, closes = 0
  ctx.get = name => name === 'sessionPersistence' ? { open: async id => ({ header: { parentSession: id === 'cold' ? 's1' : 's2', origin: 'subagent' }, read: async () => { reads++; return { events: descriptor('sidechat') } }, close: async () => closes++ }) } : undefined
  await validateSidebarSidechatTarget(ctx, 's1', { ...target, threadId: 'cold' }, signal())
  await assert.rejects(validateSidebarSidechatTarget(ctx, 's1', { ...target, threadId: 'cold-foreign' }, signal()), /calling conversation/)
  assert.equal(reads, 1, 'foreign thread history is never read')
  assert.equal(closes, 2)
  const sanitized = sanitizeSidebarSnapshot({ tabs: [{ id: 'side', type: 'sidechat', title: 'Review', threadId: 'child', draftPending: true, contextPending: true, draft: 'unsent private text', context: 'private evidence' }] })
  assert.equal(sanitized.tabs[0].threadId, 'child')
  assert.equal(sanitized.tabs[0].draftPending, true)
  assert.equal(sanitized.tabs[0].draft, undefined)
  assert.equal(sanitized.tabs[0].context, undefined)
})

test('snapshot input retains bounded navigation metadata and discards client scope/content fields', () => {
  const value = sanitizeSidebarSnapshot({ ...snapshot(), sessionId: 'other', content: 'secret', tabs: [{ ...snapshot().tabs[0], sessionId: 'other', content: 'secret' }, ...snapshot().tabs, { id: 'too-long', type: 'a'.repeat(257) }], availableTabs: [{ kind: 'git', title: 'Changes' }, { kind: 'git', title: 'Duplicate' }] })
  assert.deepEqual(value.tabs, snapshot().tabs)
  assert.deepEqual(value.availableTabs, [{ kind: 'git', title: 'Changes', enabled: true, placements: ['right'] }])
  assert.equal(value.sessionId, undefined)
  assert.throws(() => sanitizeSidebarSnapshot({ tabs: 'bad' }), /snapshot/)
})

test('legacy bottom inventory is excluded and available tabs advertise only the right sidebar', () => {
  const value = sanitizeSidebarSnapshot({ ...snapshot(), bottomOpen: true, tabs: [...snapshot().tabs, { id: 'legacy', type: 'git', placement: 'bottom' }], availableTabs: [{ kind: 'git', placements: ['bottom'] }, { kind: 'git', placements: ['right', 'bottom'] }, { kind: 'bottom-only', placements: ['bottom'] }] })
  assert.deepEqual(value.tabs, snapshot().tabs)
  assert.deepEqual(value.availableTabs, [{ kind: 'git', title: 'git', enabled: true, placements: ['right'] }])
  assert.equal(value.bottomOpen, undefined)
})

test('queued commands replay only for their session; acknowledgement must come from the receiving view', async () => {
  const registry = new SidebarAgentRegistry({ acknowledgementMs: 30 })
  const queued = await registry.dispatch('s1', { action: 'open', target: { type: 'tab', kind: 'git' }, placement: 'right', sessionId: 's2', type: 'snapshot', id: 'forged' }, signal())
  assert.equal(queued.status, 'queued')
  const otherCommands = [], other = registry.attach('s2', command => otherCommands.push(command))
  assert.equal(otherCommands.length, 0)
  const commands = [], one = registry.attach('s1', command => commands.push(command))
  assert.equal(commands.length, 1)
  assert.equal(commands[0].sessionId, 's1')
  assert.equal(commands[0].type, 'command')
  assert.notEqual(commands[0].id, 'forged')
  assert.equal(registry.snapshot('s1').queuedCommands, 0)
  one.receive({ type: 'snapshot', snapshot: snapshot() })
  assert.equal(registry.snapshot('s1').fresh, true)
  const twoCommands = [], two = registry.attach('s1', command => twoCommands.push(command))
  assert.equal(twoCommands.length, 0, 'successfully sent command is never replayed')
  other.receive({ type: 'result', id: queued.id, ok: true, snapshot: snapshot('foreign') })
  two.receive({ type: 'result', id: queued.id, ok: true, snapshot: snapshot('wrong-view') })
  assert.equal(registry.snapshot('s1').snapshot.tabs[0].id, 'file-tab')
  one.receive({ type: 'result', id: queued.id, ok: true, snapshot: snapshot('applied') })
  assert.equal(registry.snapshot('s1').snapshot.tabs[0].id, 'applied')
  one.detach()
  assert.equal(registry.snapshot('s1').fresh, false, 'another view cannot turn a disconnected inventory current')
  two.detach(); other.detach(); registry.dispose()
})

test('browser heartbeat renews snapshot freshness while unchanged inventories eventually become historical', () => {
  let now = 0
  const registry = new SidebarAgentRegistry({ now: () => now })
  const view = registry.attach('s1', () => {})
  view.receive({ type: 'snapshot', snapshot: snapshot() })
  now = 15000
  assert.equal(registry.snapshot('s1').fresh, true)
  view.receive({ type: 'snapshot', snapshot: snapshot() })
  now = 30001
  assert.equal(registry.snapshot('s1').fresh, true)
  now = 45001
  assert.equal(registry.snapshot('s1').fresh, false)
  view.detach(); registry.dispose()
})

test('actual apply/error acknowledgements, send failures, abort and timeout remain distinct', async () => {
  const registry = new SidebarAgentRegistry({ acknowledgementMs: 15 })
  let received
  const working = registry.attach('s1', command => { received = command })
  working.receive({ type: 'snapshot', snapshot: snapshot() })
  const applied = registry.dispatch('s1', { action: 'activate', tabId: 'file-tab' }, signal())
  working.receive({ type: 'result', id: received.id, ok: true, tabId: 'file-tab', snapshot: snapshot() })
  assert.equal((await applied).status, 'applied')
  const failed = registry.dispatch('s1', { action: 'close', tabId: 'file-tab' }, signal())
  working.receive({ type: 'result', id: received.id, ok: false, error: 'Unsaved editor cannot close' })
  await assert.rejects(failed, /Unsaved editor/)
  const timedOut = await registry.dispatch('s1', { action: 'visibility', placement: 'right', visible: false }, signal())
  assert.deepEqual({ status: timedOut.status, delivered: timedOut.delivered, acknowledged: timedOut.acknowledged }, { status: 'requested', delivered: true, acknowledged: false })
  const abort = new AbortController(), pending = registry.dispatch('s1', { action: 'activate', tabId: 'file-tab' }, abort.signal)
  abort.abort(new Error('Stop navigation'))
  await assert.rejects(pending, /Stop navigation/)
  working.detach()
  registry.attach('s1', () => { throw new Error('Broken subscriber') })
  assert.equal((await registry.dispatch('s1', { action: 'visibility', placement: 'right', visible: true }, signal())).status, 'queued')
  const drained = []
  const replacement = registry.attach('s1', command => drained.push(command))
  assert.equal(drained.length, 1)
  replacement.detach(); registry.dispose()
})

test('queue caps, expiration, disabled preferences and session disposal release owned work', async () => {
  let now = 1000, closed = 0
  const registry = new SidebarAgentRegistry({ maxSessions: 2, maxCommands: 1, maxViews: 1, retentionMs: 100, now: () => now })
  await registry.dispatch('s1', { action: 'visibility', placement: 'right', visible: false }, signal())
  await assert.rejects(registry.dispatch('s1', { action: 'visibility', placement: 'right', visible: true }, signal()), /Too many/)
  registry.snapshot('s2')
  assert.throws(() => registry.snapshot('s3'), /session limit/)
  now += 101
  assert.equal(registry.snapshot('s3').snapshot, null)
  registry.attach('s3', () => {}, () => closed++)
  assert.throws(() => registry.attach('s3', () => {}), /view limit/)
  const pending = registry.dispatch('s3', { action: 'close', tabId: 'x' }, signal())
  registry.clearCommands()
  await assert.rejects(pending, /disabled/)
  registry.forget('s3')
  assert.equal(closed, 1)
  registry.dispose()
  assert.throws(() => registry.snapshot('s1'), /disposed/)
})

async function hostFixture(t, mount = true) {
  const cwd = await workspace(t), routes = new Map(), upgrades = new Map(), tools = new Map(), effects = [], events = new Map()
  const fiber = {}, descriptor = { ns: 'app', value: { sidebar: { agentOpenTools: true, tabsEnabled: {}, viewersEnabled: {}, pluginSettings: {} } }, revision: 1, user: {} }
  const ctx = {
    fiber, logger: { warn() {}, info() {} }, webRuntime: { trustedHosts: [] },
    sessions: { get: id => ['s1', 's2'].includes(id) ? { id, header: { cwd }, snapshotEvents: () => [] } : undefined },
    connection: { requestRejection: req => req.headers.origin !== `http://${req.headers.host}` ? 403 : req.headers.cookie !== 'operator=valid' ? 401 : undefined },
    loader: { entries: () => [{ fiber, options: { name: 'dsh-app', id: 'app' } }], await: async () => {} },
    settings: { describe: () => [descriptor], configure: () => () => {}, update: async () => {} },
    webServer: { register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) }, registerUpgrade: route => { upgrades.set(route.path, route.handler); return () => upgrades.delete(route.path) } },
    tools: { register: definition => { assert.equal(tools.has(definition.name), false, definition.name); tools.set(definition.name, definition); return () => tools.delete(definition.name) } },
    effect: start => { const dispose = start(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
    inject: (names, callback) => names.every(name => ctx[name] !== undefined) ? callback(ctx) : undefined,
    get: name => ctx[name],
    on: (name, callback) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); return () => events.get(name).delete(callback) },
  }
  if (mount) installSidebar(ctx)
  const server = createServer()
  server.on('upgrade', (req, socket, head) => {
    const handler = upgrades.get(new URL(req.url, 'http://local').pathname)
    if (handler) handler(req, socket, head); else socket.destroy()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const dispose = () => { for (const close of effects.splice(0).reverse()) close() }
  t.after(async () => { dispose(); await new Promise(resolve => server.close(resolve)) })
  const connect = async (id = 's1') => {
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}${SIDEBAR_AGENT_PATH}?sessionId=${id}`, { headers: { origin, cookie: 'operator=valid' } })
    await once(ws, 'open')
    return ws
  }
  const exec = (id = 's1', activeSignal = signal()) => ({ agent: { session: { id, header: { cwd } } }, signal: activeSignal })
  const run = (name, args = {}, id = 's1') => tools.get(name).execute(args, exec(id))
  return { ctx, tools, routes, upgrades, descriptor, events, origin, cwd, connect, exec, run, dispose }
}

test('integrated tools and real authenticated socket report applied commands and never target another conversation', async t => {
  const f = await hostFixture(t)
  assert.equal(f.tools.has('sidebar_open'), true, 'original open tool remains registered')
  for (const name of ['sidebar_open_view', 'sidebar_get_tabs', 'sidebar_close_tab', 'sidebar_activate_tab', 'sidebar_set_visibility']) assert.equal(f.tools.has(name), true, name)
  const ws = await f.connect(), commands = []
  ws.on('message', raw => {
    const command = JSON.parse(String(raw))
    commands.push(command)
    ws.send(JSON.stringify({ type: 'result', id: command.id, ok: true, tabId: 'file-tab', snapshot: snapshot() }))
  })
  ws.send(JSON.stringify({ type: 'snapshot', snapshot: snapshot() }))
  // Wait for the browser inventory to cross the actual socket boundary.
  for (let attempt = 0; attempt < 100 && !(await f.run('sidebar_get_tabs')).fresh; attempt++) await new Promise(resolve => setTimeout(resolve, 2))
  assert.equal((await f.run('sidebar_get_tabs')).snapshot.tabs[0].id, 'file-tab')
  assert.deepEqual(f.tools.get('sidebar_open_view').parameters.properties.placement.enum, ['right'])
  assert.deepEqual(f.tools.get('sidebar_set_visibility').parameters.properties.placement.enum, ['right'])
  await assert.rejects(f.run('sidebar_open_view', { target: 'example.txt', placement: 'bottom' }), /placement.*right/)
  await assert.rejects(f.run('sidebar_set_visibility', { placement: 'bottom', visible: true }), /placement.*right/)
  const open = await f.run('sidebar_open_view', { target: 'example.txt', line: 1, sessionId: 's2' })
  assert.equal(open.status, 'applied')
  assert.equal(open.tabId, 'file-tab')
  assert.equal(commands[0].sessionId, 's1', 'model supplied scope is ignored')
  assert.deepEqual(commands[0].target, { type: 'file', path: join(f.cwd, 'example.txt'), title: 'example.txt', line: 1 })
  assert.equal(commands[0].placement, 'right')
  await f.run('sidebar_activate_tab', { tabId: 'file-tab' })
  await f.run('sidebar_close_tab', { tabId: 'file-tab' })
  await f.run('sidebar_set_visibility', { placement: 'right', visible: false })
  assert.equal(commands.at(-1).visible, false)
  await f.run('sidebar_open_view', { target: 'changes', type: 'tab' })
  assert.equal(commands.at(-1).target.kind, 'git', 'fresh inventory validation agrees with client tab aliases')
  await assert.rejects(f.run('sidebar_close_tab', { tabId: 'foreign-tab' }), /calling conversation/)
  await assert.rejects(f.run('sidebar_open_view', { target: 'dsh-resource://file/session/s2/example.txt' }), /another conversation/)
  await assert.rejects(f.tools.get('sidebar_get_tabs').execute({}, { signal: signal() }), /initiating/)
  f.descriptor.value.sidebar.tabsEnabled.git = false
  await assert.rejects(f.run('sidebar_open_view', { target: 'git', type: 'tab' }), /disabled/)
  f.descriptor.value.sidebar.agentOpenTools = false
  for (const callback of f.events.get('settings/document-updated')) callback('app', 2)
  assert.equal(f.tools.has('sidebar_open_view'), false)
  assert.equal((await f.run('sidebar_get_tabs')).controlEnabled, false)
  f.descriptor.value.sidebar.agentOpenTools = true
  for (const callback of f.events.get('settings/document-updated')) callback('app', 3)
  assert.equal(f.tools.has('sidebar_open_view'), true)
  f.descriptor.value.sidebar.tabsEnabled.git = true
  const queued = await f.run('sidebar_open_view', { target: 'git', type: 'tab' }, 's2')
  assert.equal(queued.status, 'queued')
  const replayed = [], ws2 = new WebSocket(`${f.origin.replace('http:', 'ws:')}${SIDEBAR_AGENT_PATH}?sessionId=s2`, { headers: { origin: f.origin, cookie: 'operator=valid' } })
  ws2.on('message', raw => replayed.push(JSON.parse(String(raw))))
  await once(ws2, 'open')
  for (let attempt = 0; attempt < 100 && replayed.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 2))
  assert.equal(replayed[0].id, queued.id)
  assert.equal(replayed[0].sessionId, 's2')
  f.dispose()
  assert.equal(f.tools.size, 0)
  assert.equal(f.upgrades.size, 0)
  assert.equal([...f.events.values()].every(set => set.size === 0), true)
})

test('agent-control upgrade rejects unauthenticated, cross-site and unknown-session connections', async t => {
  const f = await hostFixture(t)
  for (const { sessionId, cookie, origin } of [{ sessionId: 's1', origin: f.origin }, { sessionId: 's1', cookie: 'operator=valid', origin: 'https://evil.example' }, { sessionId: 'missing', cookie: 'operator=valid', origin: f.origin }]) {
    const ws = new WebSocket(`${f.origin.replace('http:', 'ws:')}${SIDEBAR_AGENT_PATH}?sessionId=${sessionId}`, { headers: { ...(cookie ? { cookie } : {}), origin } })
    await assert.rejects(once(ws, 'open'))
  }
})

test('disabling control during asynchronous session resolution prevents late queued mutation', async t => {
  const f = await hostFixture(t)
  let release
  const restored = new Promise(resolve => { release = resolve })
  f.ctx.sessions.get = () => undefined
  f.ctx.sessionPersistence = { open: async () => { await restored; return { header: { cwd: f.cwd }, close: async () => {} } } }
  const pending = f.run('sidebar_set_visibility', { visible: true })
  f.descriptor.value.sidebar.agentOpenTools = false
  for (const callback of f.events.get('settings/document-updated')) callback('app', 2)
  release()
  await assert.rejects(pending, /control was disabled/)
  assert.equal((await f.run('sidebar_get_tabs')).queuedCommands, 0)
})

test('Side Chat open tools stage reviewable metadata over the socket without sending or creating a model turn', async t => {
  const f = await hostFixture(t)
  const original = f.ctx.sessions.get
  f.ctx.sessions.get = id => id === 'child' ? { header: { parentSession: 's1', origin: 'subagent' }, snapshotEvents: () => [{ type: 'subagent/descriptor', seq: 0, time: 1, data: { version: 3, mode: 'continuable', provider: 'sidechat', label: 'Side: Review' } }] } : original(id)
  let turns = 0
  f.ctx.agents = { create: () => { turns++; throw new Error('Unexpected Side Chat creation') }, get: () => undefined }
  const ws = await f.connect(), received = []
  ws.on('message', data => { const command = JSON.parse(String(data)); received.push(command); ws.send(JSON.stringify({ type: 'result', id: command.id, ok: true, tabId: 'side', snapshot: { ...snapshot(), tabs: [{ id: 'side', type: 'sidechat', title: 'Review', placement: 'right', active: true, threadId: 'child', draftPending: true }] } })) })
  ws.send(JSON.stringify({ type: 'snapshot', snapshot: { ...snapshot(), availableTabs: [...snapshot().availableTabs, { kind: 'terminal', title: 'Terminal', placements: ['right'] }] } }))
  for (let attempt = 0; attempt < 100 && !(await f.run('sidebar_get_tabs')).fresh; attempt++) await new Promise(resolve => setTimeout(resolve, 2))
  await assert.rejects(f.run('sidebar_open_view', { target: 'terminal', type: 'tab', placement: 'bottom' }), /placement.*right/)
  const opened = await f.run('sidebar_open_view', { target: 'sidechat', type: 'tab', title: 'Review', threadId: 'child', draft: 'Review this file', context: 'Selected code', send: true })
  assert.equal(opened.status, 'applied')
  assert.deepEqual(received[0].target, { type: 'tab', kind: 'sidechat', title: 'Review', threadId: 'child', draft: 'Review this file', context: 'Selected code' })
  assert.equal(received[0].send, undefined, 'an extra model argument cannot start a turn')
  assert.equal(turns, 0)
  assert.equal((await f.run('sidebar_get_tabs')).snapshot.tabs[0].threadId, 'child')
  assert.equal((await f.run('sidebar_get_tabs')).snapshot.tabs[0].draft, undefined)
  const context = [{ title: 'Changed file', text: 'Verify this diff', source: 'Changes' }]
  const rich = await f.run('sidebar_open_view', { target: 'sidechat', type: 'tab', threadId: 'child', context })
  assert.equal(rich.status, 'applied')
  assert.deepEqual(received.at(-1).target.context, context, 'released tool schema and socket preserve structured references')
  assert.equal(turns, 0)
})

test('real agent socket rejects malformed and oversized inbound metadata frames', async t => {
  const f = await hostFixture(t)
  const malformed = await f.connect()
  const invalidClose = once(malformed, 'close')
  malformed.send('{')
  assert.equal((await invalidClose)[0], 1008)
  const oversized = await f.connect()
  const oversizedClose = once(oversized, 'close')
  oversized.send(JSON.stringify({ type: 'snapshot', snapshot: { tabs: [], padding: 'x'.repeat(131073) } }))
  assert.equal((await oversizedClose)[0], 1009)
})

test('released Cordis owns the enhanced tools and authenticated socket and withdraws every resource', async t => {
  const runtime = process.env.DSH_APP_TEST_CORE_ROOT
  assert.ok(runtime, 'Set DSH_APP_TEST_CORE_ROOT to the supported released DSH runtime')
  const { Context } = await import(pathToFileURL(join(runtime, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href)
  const f = await hostFixture(t, false), root = new Context()
  const services = await root.plugin({ name: 'sidebar-agent-fixture', apply(ctx) {
    for (const name of ['webServer', 'sessions', 'webRuntime', 'tools', 'loader', 'settings', 'connection']) ctx.provide(name, f.ctx[name])
  } })
  t.after(() => services.dispose())
  const owner = await root.plugin({ name: 'sidebar-agent-owner', apply(ctx) { installSidebar(ctx) } })
  t.after(() => owner.dispose())
  assert.equal(f.upgrades.has(SIDEBAR_AGENT_PATH), true)
  assert.equal(f.tools.has('sidebar_get_tabs'), true)
  assert.equal((await f.run('sidebar_get_tabs')).connected, false)
  await owner.dispose()
  assert.equal(f.upgrades.size, 0)
  assert.equal(f.tools.size, 0)
  assert.equal(f.routes.size, 0)
})
