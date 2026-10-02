import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import createSidebarBridge from '../client/sidebar-bridge.mjs'
import createSidechatClient from '../client/sidebar-sidechat.mjs'

const require = createRequire(import.meta.url)
const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : require
const { JSDOM } = dependencies('jsdom')

async function fixture(t, meta = { threadId: 'child-one' }, fromService = false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/', pretendToBeVisual: true })
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'localStorage', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
  const savedGlobals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys.slice(0, 5)) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'), { createRoot } = require('react-dom/client'), { Simulate } = require('react-dom/test-utils')
  const h = React.createElement
  const primitives = new Proxy({ MarkdownText: props => h('div', { 'data-markdown': '' }, props.text ?? props.source ?? props.content ?? ''), StateDot: () => h('span', { 'data-state-dot': '' }), ConnectionIndicator: () => h('p', {}, 'Disconnected') }, { get: (object, key) => key in object ? object[key] : props => h('span', { 'data-icon': String(key) }, props.children) })
  const engine = createSidebarBridge(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id)).engine
  const store = engine.createSidebarStore(); store.setSession('main-one')
  const service = engine.createBetterSidebarService(store, { rightOnly: true })
  let records = engine.createNativeTabRecords()
  records.attachStore(store)
  const child = (id, displayTitle, updatedAt) => ({ id, origin: 'subagent', parentId: 'main-one', displayTitle, updatedAt, running: false })
  let list = { ids: ['main-one', 'child-one', 'child-two'], byId: { 'main-one': { id: 'main-one', displayTitle: 'Main', cwd: 'D:/project' }, 'child-one': child('child-one', 'Side: First exploration', 100), 'child-two': child('child-two', 'Side: Earlier notes', 50), unrelated: { ...child('unrelated', 'Side: Foreign', 200), parentId: 'other-main' }, agent: { ...child('agent', 'Real task', 300) } }, phase: 'ready' }
  const calls = [], listListeners = new Set(), disposers = [], nativeTabs = []
  let eventsFail = false, promptFail = false, stopResolve, mainDraft = 'Existing main draft', activeTab = 'native-one', expanded = true
  const event = (type, seq, data = {}) => ({ type, seq, time: seq * 1000, data, ...['user/message', 'assistant/message', 'tool/result'].includes(type) ? { surfaceOp: 'append' } : {} })
  const events = [event('user/message', 0, { content: [{ type: 'text', text: 'A real question' }], source: { kind: 'user' } }), event('assistant/message', 1, { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'A complete answer' }] }, stream: [] }), event('turn/end', 2, { turn: 1, reason: { kind: 'completed' } })]
  globalThis.fetch = async (url, options) => {
    const method = String(url).split('/').at(-1), body = JSON.parse(options.body); calls.push({ method, body })
    let value
    if (method === 'sidechat.events') { if (eventsFail) return { ok: false, status: 503, json: async () => ({ ok: false, error: { code: 'read-failed', message: 'Transcript offline' } }) }; value = { events: body.afterSeq === undefined ? events : [], live: [] } }
    if (method === 'sidechat.info') value = { live: true, model: 'deepseek-v4', provider: 'deepseek', preset: 'default' }
    if (method === 'sidechat.prompt') { if (promptFail) return { ok: false, status: 409, json: async () => ({ ok: false, error: { code: 'prompt-failed', message: 'Send failed' } }) }; value = { accepted: true } }
    if (method === 'sidechat.cancel') { await new Promise(resolve => { stopResolve = resolve }); value = { accepted: true } }
    if (method === 'sidechat.start') value = { childId: 'child-new' }
    if (method === 'sidechat.dispose') value = { accepted: true }
    return { ok: true, status: 200, json: async () => ({ ok: true, value }) }
  }
  const client = createSidechatClient(require)
  const translate = (key, params) => (client.dictionaries.en[key] ?? key).replace(/\{(\w+)\}/g, (_, key) => String(params?.[key] ?? ''))
  const column = { tabsIn: () => nativeTabs, focus(id) { activeTab = id; calls.push({ method: 'focus', id }) }, isExpanded: () => expanded, toggleExpanded: () => { expanded = !expanded } }
  const input = { state: { getSnapshot: () => ({ draft: mainDraft }) }, setDraft(text) { mainDraft = text } }
  const ctx = { get: key => key === 'betterSidebar' ? service : key === 'sidebarRight' ? column : key === 'conversation' ? { input: { for: () => input } } : key === 'uiWorkspace' ? { openSession: id => calls.push({ method: 'open-main', id }) } : undefined,
    locale: { bind: () => translate, register: () => () => {} }, effect(callback) { const stop = callback(); if (typeof stop === 'function') disposers.push(stop) },
    sessions: { list: { getSnapshot: () => list, subscribe(callback) { listListeners.add(callback); return () => listListeners.delete(callback) } }, scope: id => ({ sessionId: id }),
      using: async (id, _options, operation) => operation({ session: { rename: async title => { calls.push({ method: 'rename', id, title }); return { ok: true, value: { title } } } } }),
      fork: async options => { calls.push({ method: 'fork', options }); return 'main-fork' } },
    connection: { state: { getSnapshot: () => 'connected', subscribe: () => () => {} } } }
  const ensure = (id, params) => {
    const contentId = `dsh-resource://page/sidechat/${id}`
    nativeTabs.push({ id, kind: 'sidechat', title: 'Side Chat', contentId })
    return records.ensure({ id, kind: 'sidechat', title: 'Side Chat', contentId, params, scope: { sessionId: 'main-one', cwd: 'D:/project' }, navigationRevision: 1 })
  }
  if (!fromService) ensure('native-one', { meta })
  service.setSurface({ openTab: request => { calls.push({ method: 'open-tab', request }); ensure(nativeTabs.length === 0 ? 'native-one' : `native-${nativeTabs.length + 1}`, request.params) }, update: (id, patch, sessionId) => { if (!records.has(id, sessionId)) return false; records.update(id, patch, sessionId); return true }, activate: id => { column.focus(id); return true } })
  service.registerTab(engine.builtinTabs().find(tab => tab.id === 'sidechat'))
  if (fromService) service.openTab({ type: 'sidechat', meta }, { sessionId: 'main-one', cwd: 'D:/project' })
  const resources = { store, service, nativeRecords: records }
  client.install(ctx, resources)
  const root = createRoot(document.getElementById('root'))
  let visible = true, mountedId = 'native-one'
  function Harness() {
    React.useSyncExternalStore(records.subscribe, () => records.versionOf(mountedId))
    const record = records.get(mountedId)
    return h(service.getTab('sidechat').component, { key: mountedId, ctx, scope: record.scope, tab: record.tab, visible, store })
  }
  const flush = async action => { await React.act(async () => { action?.(); await new Promise(resolve => setTimeout(resolve, 5)) }); await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }
  await flush(() => root.render(h(Harness)))
  t.after(async () => {
    await React.act(async () => root.unmount())
    for (const stop of disposers.reverse()) stop()
    records.dispose(); dom.window.close()
    for (const [key, descriptor] of savedGlobals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
  })
  const click = async label => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === label || button.title === label); assert.ok(button, `Missing button ${label}`); await flush(() => button.click()) }
  const type = async (element, text) => { await flush(() => { element.value = text; Simulate.change(element, { target: { value: text } }) }) }
  return { engine, client, store, service, resources, get records() { return records }, ctx, calls, flush, click, type, get mainDraft() { return mainDraft },
    setPromptFail: value => { promptFail = value }, setEventsFail: value => { eventsFail = value },
    async running(value) { list = { ...list, byId: { ...list.byId, 'child-one': { ...list.byId['child-one'], running: value } } }; await flush(() => [...listListeners].forEach(callback => callback())) },
    async visible(value) { visible = value; await flush(() => root.render(h(Harness))) }, async switchTo(id) { mountedId = id; await flush(() => root.render(h(Harness))) }, ensure,
    resolveStop: () => stopResolve?.(), async remount() { await flush(() => root.render(null)); await flush(() => root.render(h(Harness))) },
    async reloadOwner() {
      await flush(() => root.render(null))
      records.dispose(); records = engine.createNativeTabRecords(); records.attachStore(store)
      resources.nativeRecords = records
      for (const tab of nativeTabs) records.ensure({ ...tab, scope: { sessionId: 'main-one', cwd: 'D:/project' }, navigationRevision: 0 })
      await flush(() => root.render(h(Harness)))
    } }
}

test('Side Chat stages explicit agent drafts and references without sending, retains them across hidden and restored tabs, and sends once', async t => {
  const f = await fixture(t, { threadId: 'child-one', draft: 'Review this change', context: 'Attached background' })
  const composer = () => document.querySelector('._4BEzFa_sidechatComposerInput')
  assert.equal(composer().value, 'Review this change')
  assert.match(document.body.textContent, /Context from agent/)
  assert.equal(f.calls.filter(call => call.method === 'sidechat.prompt').length, 0)
  assert.equal(f.records.get('native-one').tab.meta.draft, undefined)
  assert.equal(f.records.get('native-one').tab.meta.draftPending, true)
  await f.visible(false); await f.visible(true)
  assert.equal(composer().value, 'Review this change')
  await f.remount()
  assert.equal(composer().value, 'Review this change')
  assert.match(document.body.textContent, /Context from agent/)
  f.setPromptFail(true)
  await f.flush(() => document.querySelector('._4BEzFa_sidechatSendBtn').click())
  assert.equal(composer().value, 'Review this change')
  assert.match(document.body.textContent, /Send failed/)
  f.setPromptFail(false)
  await f.flush(() => { const send = document.querySelector('._4BEzFa_sidechatSendBtn'); send.click(); send.click() })
  const sent = f.calls.filter(call => call.method === 'sidechat.prompt')
  assert.equal(sent.length, 2, 'one failed attempt, then exactly one accepted attempt')
  assert.match(sent[1].body.text, /Review this change[\s\S]*Attached background/)
  assert.equal(composer().value, '')
  assert.equal(f.records.get('native-one').tab.meta.draftPending, false)
  assert.equal(f.records.get('native-one').tab.meta.contextPending, false)
})

test('Side Chat history searches only this parent and restores an already-open thread without duplication', async t => {
  const f = await fixture(t)
  f.ensure('native-two', { meta: { threadId: 'child-two' } })
  await f.type(document.querySelector('._4BEzFa_sidechatComposerInput'), 'Keep first draft')
  await f.click('History')
  await f.type(document.querySelector('input[type=search]'), 'Earlier')
  assert.match(document.querySelector('.dsh-app-sidechat-history-list').textContent, /Earlier notes/)
  assert.doesNotMatch(document.querySelector('.dsh-app-sidechat-history-list').textContent, /Foreign|Real task|First exploration/)
  await f.flush(() => document.querySelector('.dsh-app-sidechat-history-list button').click())
  assert.equal(f.calls.filter(call => call.method === 'open-tab').length, 0)
  assert.equal(f.calls.at(-1).method, 'focus')
  assert.equal(f.calls.at(-1).id, 'native-two')
  await f.switchTo('native-two')
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, '')
  await f.type(document.querySelector('._4BEzFa_sidechatComposerInput'), 'Keep second draft')
  await f.switchTo('native-one')
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, 'Keep first draft')
  await f.click('Rename')
  await f.type(document.querySelector('input[aria-label="Chat name"]'), 'Named exploration')
  await f.flush(() => document.querySelector('.dsh-app-sidechat-rename').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
  assert.deepEqual(f.calls.find(call => call.method === 'rename'), { method: 'rename', id: 'child-one', title: 'Side: Named exploration' })
})

test('a newly created Side Chat keeps its staged question and reference through thread creation without duplicate staging', async t => {
  const f = await fixture(t, { draft: 'New staged question', context: 'New reference' }, true)
  assert.equal(f.calls.find(call => call.method === 'open-tab').request.params.meta.autoCreate, true)
  assert.equal(f.records.get('native-one').tab.meta.threadId, 'child-new')
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, 'New staged question')
  assert.equal(document.querySelectorAll('.dsh-app-sidechat-reference').length, 1)
  assert.equal(f.calls.filter(call => call.method === 'sidechat.start').length, 1)
  assert.equal(f.calls.filter(call => call.method === 'sidechat.prompt').length, 0)
  await f.remount()
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, 'New staged question')
  assert.equal(document.querySelectorAll('.dsh-app-sidechat-reference').length, 1)
})

test('a complete native owner reload restores the same Side Chat thread and editable references without resending consumed seeds', async t => {
  const context = [{ title: 'Design notes', text: 'Inspect the persistence seam', source: 'src/sidebar.mjs' }]
  const f = await fixture(t, { draft: 'Review on reload', context }, true)
  await f.type(document.querySelector('._4BEzFa_sidechatComposerInput'), 'Edited pending review')
  assert.equal(f.records.get('native-one').tab.meta.threadId, 'child-new')
  assert.equal(f.records.get('native-one').tab.meta.context, undefined)
  await f.reloadOwner()
  assert.equal(f.records.get('native-one').tab.meta.threadId, 'child-new')
  assert.equal(f.calls.filter(call => call.method === 'sidechat.start').length, 1, 'reload reuses the bound thread')
  assert.equal(f.calls.filter(call => call.method === 'sidechat.prompt').length, 0, 'restoration never submits a prompt')
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, 'Edited pending review')
  assert.equal(document.querySelectorAll('.dsh-app-sidechat-reference').length, 1)
  assert.equal(document.querySelector('.dsh-app-sidechat-reference').title, context[0].text)
  assert.deepEqual(f.client.readDraft('main-one', 'child-new').references, context)
  await f.flush(() => document.querySelector('._4BEzFa_sidechatSendBtn').click())
  const sent = f.calls.filter(call => call.method === 'sidechat.prompt')
  assert.equal(sent.length, 1)
  assert.match(sent[0].body.text, /Edited pending review[\s\S]*Design notes[\s\S]*Inspect the persistence seam/)
  await f.reloadOwner()
  assert.equal(f.records.get('native-one').tab.meta.threadId, 'child-new')
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, '')
  assert.equal(document.querySelectorAll('.dsh-app-sidechat-reference').length, 0)
  assert.equal(f.calls.filter(call => call.method === 'sidechat.start').length, 1)
  assert.equal(f.calls.filter(call => call.method === 'sidechat.prompt').length, 1)
  assert.equal(f.client.readDraft('other-main', 'child-new'), undefined)
})

test('retargeting one mounted Side Chat occurrence restores only the selected thread draft and context', async t => {
  const f = await fixture(t, { threadId: 'child-one', draft: 'First pending question', context: 'First reference' })
  await f.flush(() => f.records.update('native-one', { meta: { threadId: 'child-two' } }))
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, '')
  assert.equal(document.querySelectorAll('.dsh-app-sidechat-reference').length, 0)
  await f.type(document.querySelector('._4BEzFa_sidechatComposerInput'), 'Second pending question')
  await f.flush(() => f.records.update('native-one', { meta: { threadId: 'child-one' } }))
  assert.equal(document.querySelector('._4BEzFa_sidechatComposerInput').value, 'First pending question')
  assert.equal(document.querySelectorAll('.dsh-app-sidechat-reference').length, 1)
  assert.match(document.querySelector('.dsh-app-sidechat-reference').title, /First reference/)
})

test('Side Chat preserves real transcript answers, adds them to the main draft, and forks into the official main-chat navigator', async t => {
  const f = await fixture(t)
  assert.match(document.querySelector('.dsh-app-sidechat-body').textContent, /A real question[\s\S]*A complete answer/)
  await f.click('Add to main-chat draft')
  assert.match(f.mainDraft, /^Existing main draft[\s\S]*Side Chat — First exploration[\s\S]*A complete answer/)
  await f.click('Continue in main chat')
  assert.deepEqual(f.calls.find(call => call.method === 'fork').options, { sessionId: 'child-one', increaseTitle: true })
  assert.deepEqual(f.calls.find(call => call.method === 'open-main'), { method: 'open-main', id: 'main-fork' })
  assert.deepEqual(f.calls.find(call => call.method === 'rename'), { method: 'rename', id: 'main-fork', title: 'First exploration' })
  await f.click('Continue in main chat')
  assert.equal(f.calls.filter(call => call.method === 'fork').length, 1, 'reopening the promoted turn does not duplicate its main chat')
})

test('Side Chat reports transcript errors and guards repeated stop requests while a cancellation is pending', async t => {
  const f = await fixture(t)
  f.setEventsFail(true)
  await f.visible(false); await f.visible(true)
  assert.match(document.querySelector('.dsh-app-sidechat-error').textContent, /Transcript offline/)
  f.setEventsFail(false); await f.click('Retry')
  assert.equal(document.querySelector('.dsh-app-sidechat-error'), null)
  await f.running(true)
  await f.flush(() => { const stop = document.querySelector('._4BEzFa_sidechatSendBtn'); stop.click(); stop.click() })
  assert.equal(f.calls.filter(call => call.method === 'sidechat.cancel').length, 1)
  assert.equal(document.querySelector('._4BEzFa_sidechatSendBtn').disabled, true)
  await f.flush(() => f.resolveStop())
  assert.equal(document.querySelector('._4BEzFa_sidechatSendBtn').disabled, false)
})

test('owned Side Chat descriptor replacement restores its owner and never resurrects an unregistered page', async t => {
  const f = await fixture(t)
  const original = f.service.getTab('sidechat'), replacement = { ...original, component: () => null }
  const stop = f.service.replaceTab(replacement)
  assert.equal(f.service.getTab('sidechat'), replacement)
  stop(); assert.equal(f.service.getTab('sidechat'), original)
  const unregistered = f.service.registerTab({ id: 'external-chat', title: 'Chat', component: () => null })
  const undo = f.service.replaceTab({ id: 'external-chat', title: 'Enhanced', component: () => null })
  unregistered(); undo()
  assert.equal(f.service.getTab('external-chat'), undefined)
})
