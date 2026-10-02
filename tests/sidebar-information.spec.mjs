import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
import createSidebarInformationClient from '../client/sidebar-information.mjs'

const require = createRequire(import.meta.url)
test('unified information rows follow native projections, preserve menus and job watching, and keep one agent count', async t => {
  const dom = new JSDOM('<div id="root"></div>')
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true })
  const effects = [], listeners = new Set(), calls = [], dictionary = new Map(), stateListeners = new Set()
  let state = { byId: { s1: { projectionValues: { agentPreset: 'standard' } }, a: {} }, projectionsBySession: { s1: { state: 'idle', values: { subagentCatalog: [{ id: 'a' }] } } } }
  let statuses = new Map([['a', { running: true }]]), jobs = { rows: { s1: [] } }
  let watches = 0
  const useValue = select => {
    React.useSyncExternalStore(callback => { stateListeners.add(callback); return () => stateListeners.delete(callback) }, () => state)
    return select()
  }
  const props = {
    sessionId: 's1', useSessions: select => useValue(() => select(state)),
    useSessionStatus: select => useValue(() => select(statuses)),
    useSession: select => useValue(() => select({})),
    useAgentPresets: select => useValue(() => select({ options: [{ id: 'standard' }] })),
    useJobs: select => useValue(() => select(jobs)), load: () => {},
    t: key => ({ presetStandardName: 'Standard mode' })[key] ?? key,
    watchRows: () => { watches++; return () => { watches-- } },
  }
  function Native({ kind, sessionId, watchRows }) {
    React.useEffect(() => kind === 'job-list' ? watchRows(sessionId) : undefined, [kind, sessionId, watchRows])
    return React.createElement('div', {}, React.createElement('button', { 'aria-label': `Native ${kind}`, onClick: () => calls.push([kind, sessionId]) }, 'Native header label'))
  }
  const entries = ['subagent-catalog', 'agent-team', 'agent-preset', 'job-list'].map(kind => ({ options: { id: kind }, component: nativeProps => React.createElement(Native, { ...nativeProps, kind }) }))
  const ctx = {
    effect: fn => effects.push(fn()),
    locale: { register: (key, values) => { dictionary.set(key, values); return () => dictionary.delete(key) }, bind: key => (name, params = {}) => Object.entries(params).reduce((text, [field, value]) => text.replaceAll(`{${field}}`, value), dictionary.get(key)?.en[name] ?? name) },
    slots: { entries: () => entries, subscribe: (_name, listener) => { listeners.add(listener); return () => listeners.delete(listener) }, register: () => { for (const fn of [...listeners]) fn(); return () => { for (const fn of [...listeners]) fn() } } },
  }
  const client = createSidebarInformationClient(require)
  client.install(ctx)
  const root = createRoot(document.getElementById('root'))
  const flush = action => React.act(async () => { action(); await Promise.resolve() })
  const render = visible => root.render(React.createElement(React.Fragment, {}, entries.map(entry => React.createElement(entry.component, { ...props, key: entry.options.id })), React.createElement(client.Information, { sessionId: 's1', visible })))
  t.after(async () => { await flush(() => root.unmount()); for (const off of effects.reverse()) off?.(); dom.window.close(); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })
  await flush(() => render(true))
  assert.equal(document.querySelectorAll('[data-dsh-app-information-row="agents"]').length, 1)
  assert.match(document.querySelector('[data-dsh-app-information-row="agents"] .dsh-app-information-value').textContent, /1 running/)
  assert.equal(document.querySelector('[data-dsh-app-information-row="mode"] .dsh-app-information-value').textContent, 'Standard mode')
  assert.equal(document.querySelector('[data-dsh-app-information-row="jobs"]').hidden, true)
  assert.equal(watches, 1, 'the native roster watcher remains live while no job is visible')
  await flush(() => document.querySelector('[aria-label="Native subagent-catalog"]').click())
  assert.deepEqual(calls, [['subagent-catalog', 's1']])
  await flush(() => {
    statuses = new Map([['a', { running: false }]])
    jobs = { rows: { s1: [{ status: 'stopping' }] } }
    state = { ...state, projectionsBySession: { s1: { state: 'idle', values: { subagentCatalog: [{ id: 'a' }], agentTeam: { members: [{ id: 'a' }, { id: 'b' }] } } } } }
    for (const notify of [...stateListeners]) notify()
  })
  assert.equal(document.querySelector('[data-dsh-app-information-row="jobs"]').hidden, false)
  assert.match(document.querySelector('[data-dsh-app-information-row="jobs"] .dsh-app-information-value').textContent, /1 running/)
  assert.match(document.querySelector('[data-dsh-app-information-row="agents"] .dsh-app-information-value').textContent, /1 tasks/)
  assert.match(document.querySelector('[data-dsh-app-information-row="team"] .dsh-app-information-value').textContent, /2 members/)
  await flush(() => render(false))
  assert.equal(watches, 0, 'hidden retained seats release native watchers and menus')
  assert.equal(document.querySelector('[data-dsh-app-information-row]'), null)
})

test('native header controls move into the active Session information seat with callbacks intact and restore on unload', async t => {
  const dom = new JSDOM('<div id="root"></div>')
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true })
  const calls = [], listeners = new Set(), effects = []
  function Original({ sessionId, onOpen }) { return React.createElement('button', { onClick: () => onOpen(sessionId) }, 'Agents') }
  const entry = { options: { id: 'external-session-action' }, component: Original }
  let rows = [entry]
  const ctx = { effect(fn) { effects.push(fn()) }, slots: { entries: () => rows, subscribe: (_name, listener) => { listeners.add(listener); return () => listeners.delete(listener) }, register: () => { for (const fn of [...listeners]) fn(); return () => { for (const fn of [...listeners]) fn() } } } }
  const client = createSidebarInformationClient(require)
  client.install(ctx)
  const root = createRoot(document.getElementById('root'))
  const flush = action => React.act(async () => { action(); await Promise.resolve() })
  const render = (visible = true, sessionId = 's1') => root.render(React.createElement(React.Fragment, {},
    React.createElement('header', {}, React.createElement(entry.component, { sessionId, onOpen: id => calls.push(id) })),
    React.createElement('aside', {}, React.createElement(client.Information, { sessionId, visible }))))
  t.after(async () => { await flush(() => root.unmount()); for (const off of effects.reverse()) off?.(); dom.window.close(); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })
  await flush(render)
  assert.equal(document.querySelector('header button'), null)
  assert.ok(document.querySelector('aside button'))
  await flush(() => document.querySelector('aside button').click())
  assert.deepEqual(calls, ['s1'])
  await flush(() => render(false))
  assert.equal(document.querySelector('button'), null, 'a retained hidden guide cannot show Session controls')
  await flush(() => render(true, 's2'))
  await flush(() => document.querySelector('aside button').click())
  assert.deepEqual(calls, ['s1', 's2'], 'navigation preserves native Session identity')
  await flush(() => { rows = []; for (const fn of [...listeners]) fn() })
  assert.equal(entry.component, Original, 'removed native entries restore their component')
  await flush(() => { rows = [entry]; for (const fn of [...listeners]) fn(); render(true, 's2') })
  assert.notEqual(entry.component, Original, 'a reloaded native entry is decorated again')
  await flush(() => { for (const off of effects.splice(0).reverse()) off?.(); render(true, 's2') })
  assert.equal(entry.component, Original)
  assert.equal(listeners.size, 0)
  assert.ok(document.querySelector('header button'), 'owned unload returns rendering to its native slot')
})
