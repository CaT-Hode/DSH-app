/** Browser-factory regression against a separately installed supported DSH runtime. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const ownRequire = createRequire(import.meta.url)
const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : ownRequire
const reactRequire = process.env.DSH_APP_TEST_REACT_ROOT ? createRequire(join(process.env.DSH_APP_TEST_REACT_ROOT, 'package.json')) : ownRequire
const coreRoot = process.env.DSH_APP_TEST_CORE_ROOT
if (!coreRoot) throw new Error('Set DSH_APP_TEST_CORE_ROOT to an installed DSH 0.2.0-rc.2 runtime to run the client integration check')
const { SlotCore } = await import(pathToFileURL(join(coreRoot, 'node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js')))
const { JSDOM } = dependencies('jsdom')

test('browser factory delegates navigation, cancels search, renders published settings/MCP inline and unloads', async () => {
  const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"><div id="frame" style="grid-template-columns:280px minmax(0px,1fr) 0px"><div id="left"></div><div id="main"></div><div></div><div data-shell-overlay></div></div></div></body></html>', { url: 'http://127.0.0.1:19780/' })
  const globals = ['window', 'document', 'MutationObserver', 'location', 'HTMLElement', 'CustomEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of globals.slice(0, 6)) globalThis[key] = dom.window[key]
  const frames = new Map()
  let frameId = 0
  globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  dom.window.requestAnimationFrame = globalThis.requestAnimationFrame
  dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = reactRequire('react')
  const { act, createElement: h, useSyncExternalStore } = React
  const ReactDOM = reactRequire('react-dom')
  const { createRoot } = reactRequire('react-dom/client')
  const { Simulate } = reactRequire('react-dom/test-utils')
  const loadPublished = (path, additions, requireModule) => {
    let factory
    const targetWindow = dom.window
    targetWindow.__ModuleLoader__ = { load: descriptor => { factory = descriptor.factory } }
    const source = readFileSync(path, 'utf8').replace('return module.exports;', `${additions}\nreturn module.exports;`)
    runInNewContext(source, { window: targetWindow, document, console, MutationObserver, HTMLElement, URL, setTimeout, clearTimeout })
    return factory(requireModule)
  }
  const uiRequire = name => ['react', 'react/jsx-runtime', 'react-dom'].includes(name) ? reactRequire(name) : name === '@deepseek-ai/dsh-client-ui-primitives' ? {
    Tooltip: ({ children }) => children, ConnectionIndicator: () => null,
    useModalLayer: () => assert.fail('inline settings must not install the modal layer'),
  } : {}
  const settingsOwner = loadPublished(join(coreRoot, 'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'), 'exports.testSettingsRoot = SettingsRoot;', uiRequire).testSettingsRoot
  const mcpClient = process.env.DSH_APP_TEST_MCP_CLIENT ?? join(homedir(), '.dsh/profiles/web/node_modules/dsh-mcp-connector/lib/client.js')
  const mcpOwner = loadPublished(mcpClient, 'exports.testMarketOverlay = MarketOverlay;', uiRequire).testMarketOverlay
  dom.window.fetch = async url => ({ ok: url === '/mcp-connector/api', status: url === '/mcp-connector/api' ? 200 : 404, json: async () => ({ ok: true, detail: { installedVersion: '0.2.63', latestVersion: null, updateAvailable: true, checking: false, sources: { npm: { ok: true } } } }) })
  const period = { apiCost: 0.3, calls: 3, input: 200, cacheRead: 100, cacheWrite: 0, output: 80, unpricedCalls: 1 }
  globalThis.fetch = async url => ({ ok: true, json: async () => url.endsWith('balance.json')
    ? { status: 'ready', stale: false, isAvailable: true, updatedAt: 1, balances: [{ currency: 'CNY', totalBalance: '18.25' }] }
    : { month: period, today: period, config: { currency: 'USD', exchangeRate: 7, budget: { enabled: true, amount: 10, period: 'month' } } } })
  const core = new SlotCore()
  core.register({ name: 'root', children: { sidebar: { kind: 'single', scope: 'root' }, main: { kind: 'keyed', scope: 'root' }, 'shell.overlay': { kind: 'list', scope: 'root' }, 'conversation.composer.dock': { kind: 'list', scope: 'session-maybe' } } }, ({ renderSlot }) => renderSlot('shell.overlay', {}))
  const cleanups = []
  const installations = new Map()
  const counters = { new: 0, toggle: 0, panels: [], opened: [], searches: [] }
  const dictionaries = new Map()
  const ctx = {
    effect: (install, label) => { installations.set(label, install); const stop = install(); if (stop) cleanups.push(stop) },
    slots: {
      register: (options, component) => core.register(options, component), entries: name => core.entries(name), entriesOfSlot: name => core.entriesOfSlot(name),
      inject: (name, install) => { assert.ok(core.specDynamic(name), `declared ${name}`); const stop = install(); if (stop) cleanups.push(stop) },
      subscribe: (name, listener) => core.onMutate(key => { if (key === name) listener() }),
    },
    locale: {
      register: (ns, values) => { dictionaries.set(ns, values); return () => dictionaries.delete(ns) },
      bind: ns => (key, params = {}) => dictionaries.get(ns).zh[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? '')),
      subscribe: () => () => {}, getLocale: () => 'zh',
    },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: counters.panels.at(-1) ?? null }) }, selectPanel: id => counters.panels.push(id), toggleSidebar: () => counters.toggle++ },
    uiWorkspace: { startSession: () => counters.new++, openSession: id => counters.opened.push(id) },
    sessions: { search: (query, signal) => new Promise(resolve => counters.searches.push({ query, signal, resolve })) },
  }
  let nativeFactory
  const moduleWindow = dom.window
  moduleWindow.__ModuleLoader__ = { load: descriptor => { nativeFactory = descriptor.factory } }
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: moduleWindow, document, location, MutationObserver, requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, fetch, CustomEvent, Intl })
  const plugin = nativeFactory(name => name === 'react' ? React : name === 'react-dom' ? ReactDOM : assert.fail(`unexpected module ${name}`))
  plugin.apply(ctx)
  core.register({ name: 'sidebar.workspaces' }, () => h('div', { role: 'tree' }, 'Official workspace'))
  const createStore = initial => {
    const listeners = new Set()
    let state = initial
    const update = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
    const actions = { open: () => update({ open: true }), close: () => update({ open: false }), openSection: id => update({ open: true, activeId: id }), select: id => update({ activeId: id }), detailOpened: () => update({ detailOpen: true }), detailClosed: () => update({ detailOpen: false }) }
    return { create: () => ({ getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, actions }) }
  }
  const settingsStore = createStore({ open: false, activeId: undefined })
  const settingsRows = [{ id: 'general', label: 'General' }, { id: 'models', label: 'Models' }]
  const settingsEntryOptions = { name: 'sidebar.settings', store: settingsStore,
    children: Object.fromEntries(['settings.header', 'settings.trigger', 'settings.launcher', 'settings.action', 'settings.close', 'settings.section', 'settings.onboarding'].map(name => [name, { kind: name === 'settings.section' || name === 'settings.onboarding' || name === 'settings.action' ? 'list' : 'single', scope: 'root' }])),
    inject: () => ({ t: key => key, useShortcuts: select => select([]), useSections: select => select(settingsRows), useConnectionState: () => 'connected', useDesktopUpdate: () => ({ presentation: undefined, failed: false, opening: false }), useOnboardingSteps: select => select([]) }),
  }
  core.register(settingsEntryOptions, settingsOwner)
  core.register({ name: 'settings.section', id: 'general' }, () => h('div', { 'data-real-settings-section': 'general' }, 'General section'))
  core.register({ name: 'settings.section', id: 'models' }, () => h('div', { 'data-real-settings-section': 'models' }, 'Model section'))
  core.register({ name: 'sidebar.panellist', id: 'skills', label: 'Skills', order: 1 }, () => h('svg'))
  core.register({ name: 'sidebar.panellist', id: 'plugins', label: 'Plugin Market', order: 2 }, () => h('svg'))
  const mcpStore = createStore({ open: false, detailOpen: false })
  const originalMcp = () => h('button', {}, 'Old green launcher')
  core.register({ name: 'sidebar.footer.action', id: 'mcp-connector', store: mcpStore, registrant: 'mcp-plugin' }, originalMcp)
  const promptCalls = []
  core.register({ name: 'shell.overlay', id: 'mcp-connector', store: mcpStore, inject: () => ({ startPromptSession: prompt => { promptCalls.push(prompt); return Promise.resolve() }, workspaceContext: () => ({ id: 'workspace-1', path: 'D:/validation' }), workspaceOptions: () => [] }) }, mcpOwner)
  await Promise.resolve()
  const instances = new WeakMap()
  const coreRequire = createRequire(join(coreRoot, 'package.json'))
  const renderer = loadPublished(join(coreRoot, 'node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'), 'exports.testStandardKit = standardKit; exports.testCreateSlotRenderer = createSlotRenderer;', name => name === 'react' || name === 'react/jsx-runtime' || name === 'react-dom' || name === 'react-dom/client' ? reactRequire(name) : coreRequire(name))
  const rootBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
  const localeSnapshot = { revision: 0 }
  const actualHost = {
    subscribe: (key, listener) => core.subscribe(key, listener), getVersion: key => core.getVersion(key), entriesOf: key => core.entries(key), entriesOfSlot: key => core.entriesOfSlot(key), specOf: key => core.specDynamic(key), isLive: entry => core.isLive(entry),
    reportEntryError: (_, __, error) => { throw error },
    root: { subscribe: () => () => {}, getSnapshot: () => rootBinding }, scopeRevision: { subscribe: () => () => {}, getSnapshot: () => 0 },
    scope: () => ({ current: { subscribe: () => () => {}, getSnapshot: () => rootBinding }, renderArea: (_, area) => area.children }),
    locale: { getSnapshot: () => localeSnapshot, bind: ctx.locale.bind, subscribe: () => () => {} },
    storeOf: entry => { if (!entry.store) return undefined; if (!instances.has(entry.store)) instances.set(entry.store, entry.store.create()); return instances.get(entry.store) },
  }
  const actualRenderer = renderer.testCreateSlotRenderer()
  const renderSlot = (name, owner = {}, opts = {}) => core.entriesOfSlot(name).filter(entry => opts.only === undefined || opts.only === entry.options.id).map((entry, index) => {
    let storeProps = {}
    if (entry.store) {
      if (!instances.has(entry.store)) instances.set(entry.store, entry.store.create())
      const store = instances.get(entry.store)
      storeProps = { actions: store.actions, useStore: select => select(useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)) }
    }
    return h(entry.component, { key: index, ...owner, ...storeProps, ...entry.inject?.(), useSessions: select => select(list), renderSlot, useProjection: () => undefined, ...(entry.locale ? { t: ctx.locale.bind(entry.locale) } : {}) })
  })
  const list = { phase: 'ready', ids: ['s1'], byId: { s1: { id: 's1', displayTitle: 'Validation', cwd: 'D:/validation', updatedAt: 1, blank: false, retainedBy: { mainView: 1 } } } }
  const entry = core.entriesOfSlot('sidebar')[0]
  const props = { ...entry.inject(), t: ctx.locale.bind('dshApp'), collapsed: false, width: 280, renderSlot, useSessions: select => select(list), usePanelInfo: select => select({ activePanelId: null }) }
  const root = createRoot(document.getElementById('left'))
  const overlays = createRoot(document.querySelector('[data-shell-overlay]'))
  const main = createRoot(document.getElementById('main'))
  let rootsUnmounted = false
  try {
    await act(async () => { root.render(h(entry.component, props)); overlays.render(actualRenderer.renderRoot(actualHost, {})); await Promise.resolve() })
    assert.ok(document.querySelector('[data-slot="sidebar.workspaces"]'))
    assert.ok(document.body.textContent.includes('Official workspace'))
    assert.ok(document.body.textContent.includes('¥18.25'))
    assert.ok(document.body.textContent.includes('$0.30'))
    assert.ok(document.body.textContent.includes('380'))
    await act(async () => document.querySelector('[data-dsh-app-action="new"]').click())
    await act(async () => document.querySelector('[data-dsh-app-panel="skills"]').click())
    await act(async () => document.querySelector('[data-dsh-app-action="sidebar"]').click())
    assert.equal(counters.new, 1)
    assert.equal(counters.toggle, 1)
    assert.deepEqual(counters.panels, ['skills'])
    assert.equal(core.entriesOfSlot('sidebar.footer.action')[0].store, core.entriesOfSlot('shell.overlay')[0].store)
    assert.equal(document.body.textContent.includes('Old green launcher'), false)
    await act(async () => document.querySelector('[data-dsh-app-action="connector"]').click())
    assert.equal(counters.panels.at(-1), 'dsh-app-mcp')
    const showPanel = async key => {
      const selectedEntry = core.entriesOfSlot('main').find(value => value.options.key === key)
      await act(async () => { main.render(h(selectedEntry.component, { ...selectedEntry.inject(), t: ctx.locale.bind('dshApp') })); await Promise.resolve() })
    }
    await showPanel('dsh-app-mcp')
    assert.ok(document.querySelector('.dsh-app-inline-mcp .mcpConnectorMarketPanel iframe'))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.querySelector('[aria-modal]'), null)
    assert.equal(document.querySelector('.dsh-app-rail-footer [data-dsh-app-action="connector"]'), null)
    assert.ok(document.querySelector('.dsh-app-rail-mcp [data-dsh-app-action="connector"]'))
    let mcpFrame = document.querySelector('.mcpConnectorMarketPanel iframe')
    await act(async () => document.querySelector('[data-dsh-app-action="search"]').click())
    await act(async () => { await Promise.resolve() })
    await act(async () => document.querySelector('.dsh-app-search-field input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('.dsh-app-search-dialog'), null, 'Escape closes the search dialog without closing its MCP main pane')
    assert.equal(instances.get(mcpStore).getSnapshot().open, true)
    assert.equal(counters.panels.at(-1), 'dsh-app-mcp')
    assert.equal(document.querySelector('.mcpConnectorMarketPanel iframe'), mcpFrame, 'higher dialogs retain the MCP iframe')
    await act(async () => [...document.querySelectorAll('.mcpConnectorMarketPanel button')].find(button => button.textContent === '查看更新方式').click())
    assert.equal(counters.panels.at(-1), 'plugins', 'MCP update guidance opens the actual registered plugin market panel')
    await showPanel('dsh-app-mcp')
    await act(async () => instances.get(mcpStore).actions.open())
    mcpFrame = document.querySelector('.mcpConnectorMarketPanel iframe')
    const sendMcp = (origin, source, data) => window.dispatchEvent(new dom.window.MessageEvent('message', { origin, source, data }))
    await act(async () => sendMcp('https://untrusted.invalid', mcpFrame.contentWindow, { type: 'mcp-connector:start-session', requestId: 'bad', prompt: 'Bad request' }))
    assert.deepEqual(promptCalls, [])
    await act(async () => { sendMcp(location.origin, mcpFrame.contentWindow, { type: 'mcp-connector:start-session', requestId: 'ok', prompt: 'Actual MCP prompt' }); await Promise.resolve() })
    assert.deepEqual(promptCalls, ['Actual MCP prompt'])
    await act(async () => window.dispatchEvent(new CustomEvent('dsh-app:action', { detail: { action: 'settings' } })))
    assert.equal(counters.panels.at(-1), 'dsh-app-settings')
    await showPanel('dsh-app-settings')
    assert.ok(document.querySelector('.dsh-app-settings-options [data-real-settings-section="general"]'))
    await act(async () => [...document.querySelectorAll('.dsh-app-settings-nav button')].find(button => button.textContent === 'Models').click())
    assert.ok(document.querySelector('.dsh-app-settings-options [data-real-settings-section="models"]'))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.getElementById('root').inert, undefined)
    await act(async () => main.render(null))
    assert.equal(instances.get(mcpStore).getSnapshot().open, false)
    assert.equal(instances.get(settingsStore).getSnapshot().open, false)
    await act(async () => document.querySelector('[data-dsh-app-action="search"]').click())
    const input = document.querySelector('.dsh-app-search-field input')
    const inputValue = value => act(() => Simulate.change(input, { target: { value } }))
    await inputValue('first')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)) })
    assert.equal(counters.searches[0].query, 'first')
    await inputValue('second')
    assert.equal(counters.searches[0].signal.aborted, true)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)) })
    assert.equal(counters.searches[1].query, 'second')
    await act(async () => { counters.searches[1].resolve({ ok: true, value: { items: [{ sessionId: 's1', snippet: 'Host content hit' }], hasMore: false } }); await Promise.resolve() })
    assert.ok(document.body.textContent.includes('Host content hit'))
    await act(async () => document.querySelector('.dsh-app-search-result').click())
    assert.deepEqual(counters.opened, ['s1'])
    assert.equal(counters.searches[1].signal.aborted, true)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.ok(core.specDynamic('dsh-app.usage.context'))
    assert.equal(core.specDynamic('dsh-app.usage.context').scope, 'session-maybe')
    const costEntry = core.entriesOfSlot('main').find(value => value.options.key === 'dsh-app-cost')
    const binding = { hooks: {}, keyedHooks: {}, props: {} }
    const absentSource = { subscribe: () => () => {}, getSnapshot: () => binding }
    const localeFace = { getSnapshot: () => ({ revision: 0 }), bind: ctx.locale.bind, subscribe: () => () => {} }
    const host = { locale: localeFace, storeOf: () => undefined, scope: () => ({ current: absentSource, bindingSource: () => absentSource, renderArea: (_, area) => area.children }) }
    const { kit } = renderer.testStandardKit(host, costEntry, 'root', binding, undefined)
    assert.equal(typeof kit.renderSlot, 'function')
    assert.equal(typeof kit.t, 'function')
    assert.equal(typeof kit.SessionProvider, 'function', 'published rc.2 supplies an area seat for session-maybe children')
    await act(async () => main.render(h(costEntry.component, { ...kit, ...costEntry.inject(), renderSlot })))
    assert.ok(document.querySelector('.dsh-app-cost-frame'))
    await act(async () => [...document.querySelectorAll('.dsh-app-usage-tabs [role="tab"]')].find(button => button.textContent === '上下文').click())
    assert.ok(document.querySelector('.dsh-app-context'))
    assert.ok(document.body.textContent.includes('选择一条对话查看上下文与活动'))
    assert.equal(document.querySelector('.dsh-app-cost-frame'), null)
    await act(async () => main.render(h(costEntry.component, { ...costEntry.inject(), t: kit.t, renderSlot })))
    assert.ok(document.querySelector('.dsh-app-context'), 'context outlet also works without an area seat')
    // Restore and decorate an already-mounted published overlay through actual SlotOutlet subscriptions.
    const beforeRestore = core.getVersion('shell.overlay')
    await act(async () => cleanups.pop()())
    assert.ok(core.getVersion('shell.overlay') > beforeRestore)
    assert.equal(core.entriesOfSlot('shell.overlay')[0].component, mcpOwner)
    await act(async () => { instances.get(mcpStore).actions.open(); await Promise.resolve() })
    assert.ok(document.querySelector('[role="dialog"].mcpConnectorMarketPanel'))
    const beforeDecoration = core.getVersion('shell.overlay')
    await act(async () => ctx.effect(installations.get('dsh-app: inline settings and MCP presentation'), 'dsh-app: inline settings and MCP presentation'))
    assert.ok(core.getVersion('shell.overlay') > beforeDecoration)
    assert.equal(document.querySelector('[role="dialog"].mcpConnectorMarketPanel'), null)
    await showPanel('dsh-app-mcp')
    assert.ok(document.querySelector('.dsh-app-inline-mcp .mcpConnectorMarketPanel'))
    await act(async () => instances.get(mcpStore).actions.close())
    assert.equal(counters.panels.at(-1), null, 'external store close returns its selected main pane to chat')
    await act(async () => { instances.get(mcpStore).actions.open(); ctx.layout.selectPanel('skills'); instances.get(mcpStore).actions.close() })
    assert.equal(counters.panels.at(-1), 'skills', 'late closure of an earlier pane preserves a later selection')
    await act(async () => { root.unmount(); overlays.unmount(); main.unmount() })
    rootsUnmounted = true
    cleanups.pop()()
    assert.equal(core.entriesOfSlot('shell.overlay')[0].component, mcpOwner)
    assert.equal(core.entriesOfSlot('sidebar.settings')[0].component, settingsOwner)
    cleanups.pop()()
    assert.equal(core.entriesOfSlot('sidebar.footer.action')[0].component, originalMcp)
    while (cleanups.length) cleanups.pop()()
    for (const callback of frames.values()) callback()
    assert.equal(document.querySelector('[data-dsh-app-frame]'), null)
    assert.equal(document.documentElement.hasAttribute('data-dsh-app-ui'), false)
    assert.equal(core.entriesOfSlot('main').length, 0)
    assert.equal(core.specDynamic('dsh-app.usage.context'), undefined)
  } finally {
    const errors = []
    if (!rootsUnmounted) for (const mounted of [root, overlays, main]) {
      try { await act(async () => mounted.unmount()) } catch (error) { errors.push(error) }
    }
    while (cleanups.length) {
      try { cleanups.pop()() } catch (error) { errors.push(error) }
    }
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
    dom.window.close()
    if (errors.length) throw new AggregateError(errors, 'Client regression cleanup failed')
  }
})
