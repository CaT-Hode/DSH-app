/** Compose the built owner with released General settings, SlotCore and Input; no desktop or profile access. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const runtime = process.env.DSH_APP_TEST_CORE_ROOT
if (!runtime) throw new Error('Set DSH_APP_TEST_CORE_ROOT to the supported released runtime')
const packageFile = name => join(runtime, `node_modules/@deepseek-ai/${name}/lib/index.js`)
const slotsModule = await import(pathToFileURL(packageFile('dsh-client-ui-slots')))
const runtimeRequire = require
const React = runtimeRequire('react')
const primitiveSource = readFileSync(packageFile('dsh-client-ui-primitives'), 'utf8')
const generalSource = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'), 'utf8')
// Static primitives ship ESM/CSS for the browser bundler. Execute the unmodified released Input region with that bundler's imports.
const inputRegion = primitiveSource.slice(primitiveSource.indexOf('const Input = forwardRef('), primitiveSource.indexOf('//#endregion', primitiveSource.indexOf('const Input = forwardRef(')))
const clsxRegion = generalSource.slice(generalSource.indexOf('function r(e)'), generalSource.indexOf('//#endregion', generalSource.indexOf('function r(e)')))
const primitives = { Input: runInNewContext(`${clsxRegion}\n${inputRegion}\nInput`, { forwardRef: React.forwardRef, jsxs: require('react/jsx-runtime').jsxs, jsx: require('react/jsx-runtime').jsx, css$11: { wrap: 'released-input-wrap', input: 'released-input-field' } }) }

test('built workbench composes into released General settings with real primitive inputs and unloads independently', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'HTMLElement', 'navigator', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true })
  const { createRoot } = runtimeRequire('react-dom/client')
  const { Simulate } = runtimeRequire('react-dom/test-utils')
  const root = createRoot(document.getElementById('root'))
  const flush = action => React.act(async () => { action?.(); for (let index = 0; index < 12; index++) await Promise.resolve() })
  t.after(async () => { await flush(() => root.unmount()); dom.window.close(); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })

  const core = new slotsModule.SlotCore()
  core.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' }, sidebar: { kind: 'single', scope: 'root' }, main: { kind: 'keyed', scope: 'root' }, 'conversation.composer.dock': { kind: 'list', scope: 'root' } } }, () => null)
  const dictionaries = new Map(), effectLabels = [], ownedDisposers = [], remoteListeners = new Set()
  let owned = false, prefs = { titleBarScheme: 'custom', titleBarStripPx: 36, pluginSettings: { editor: { openWith: { sshHost: 'old-host', customEditors: [], pinned: ['vscode'] } } } }, revision = 1
  const requests = []
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body)
    requests.push({ url, body })
    if (url.endsWith('settings.update')) { assert.equal(body.expectedRevision, `r${revision}`); prefs = { ...prefs, ...body.patch }; revision++ }
    else assert.ok(url.endsWith('settings.get'))
    return { ok: true, json: async () => ({ ok: true, value: { value: prefs, revision: `r${revision}` } }) }
  }
  const locale = {
    register(ns, language, entries) {
      const next = entries ? { ...dictionaries.get(ns), [language]: entries } : language
      dictionaries.set(ns, next)
      return () => dictionaries.delete(ns)
    },
    bind: ns => (key, params = {}) => Object.entries(params).reduce((value, [name, text]) => value.replaceAll(`{${name}}`, text), dictionaries.get(ns)?.zh?.[key] ?? key),
    getLocale: () => 'zh', getSnapshot: () => ({ revision: 0 }), subscribe: () => () => {},
  }
  const slots = {
    inject(name, callback) { if (!core.spec(name)) return () => {}; const stop = callback(); if (owned) ownedDisposers.push(stop); return stop },
    register: (options, component) => core.register(options, component), entries: name => core.entries(name), entriesOfSlot: name => core.entriesOfSlot(name),
    subscribe: (name, callback) => core.subscribe(name, callback), getVersion: name => core.getVersion(name),
  }
  const ctx = {
    slots, locale, connection: {}, remote: { $host: { isLoopback: false }, $on: (_event, callback) => { remoteListeners.add(callback); return () => remoteListeners.delete(callback) } },
    sessions: { list: { subscribe: () => () => {} } }, modules: {}, layout: {}, uiWorkspace: {}, conversation: {},
    get(name) { return this[name] }, provide(name, value) { this[name] = value },
    inject(dependencies, callback) {
      if (!dependencies.every(name => this.get(name) !== undefined)) return () => {}
      return callback(this) ?? (() => {})
    },
    effect(callback, label = '') {
      if (owned) effectLabels.push(label)
      // This focused composition runs preferences/registry effects; viewport portals and desktop observers belong to browser QA.
      const active = !owned || label.includes('dictionaries') || label.includes('register built-in') || label === 'dsh-app: General workbench settings'
      const stop = active ? callback() : () => {}
      if (owned) ownedDisposers.push(stop)
      return stop
    },
  }
  const staticModules = { react: React, 'react/jsx-runtime': runtimeRequire('react/jsx-runtime'), 'react-dom': runtimeRequire('react-dom'), 'react-dom/client': runtimeRequire('react-dom/client'), '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-ui-slots': slotsModule,
    // The unrelated optional desktop-update bridge is absent in this General composition.
    '@deepseek-ai/dsh-client-store': { createSnapshotStore: value => ({ getSnapshot: () => value, set: next => { value = next }, subscribe: () => () => {} }) } }
  let bootstrap, generalFactory
  dom.window.__ModuleLoader__ = { load: row => { if (row.id === '@deepseek-ai/dsh-client-modules') bootstrap = row.factory; else generalFactory = row.factory } }
  const globals = { window: dom.window, document: dom.window.document, console, fetch: fetcher, localStorage: dom.window.localStorage, MutationObserver: dom.window.MutationObserver, URL, AbortSignal }
  runInNewContext(readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-modules/lib/client.js'), 'utf8'), globals)
  runInNewContext(readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'), 'utf8'), globals)
  generalFactory(id => staticModules[id]).apply(ctx)
  const general = core.entriesOfSlot('settings.section').find(entry => entry.options.id === 'general')
  assert.ok(general)
  const stopLanguage = core.register({ name: 'settings.general.item', id: 'existing-language', order: 0 }, () => React.createElement('span', { 'data-existing-language': '' }, 'Existing language setting'))

  const queue = { mode: 'queue', pendingQueue: [], load: row => queue.pendingQueue.push(row) }
  dom.window.__ModuleLoader__ = queue
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), globals)
  const { ClientModuleSystem } = bootstrap(id => staticModules[id])
  const modules = new ClientModuleSystem({ manifest: { rev: 'integration', modules: [], plugins: [] }, registrationTarget: queue, staticModules, bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: {} } })
  const owner = await modules.import('dsh-app')
  ctx.modules = modules
  owned = true
  owner.apply(ctx)
  const workbench = core.entriesOfSlot('settings.general.item').find(entry => entry.options.id === 'dsh-app-workbench')
  assert.ok(workbench)
  const resources = workbench.inject()
  for (const key of ['store', 'service', 'api', 'parsePrefs', 'parseOpenWithConfig', 'shellPresets', 'subscribePreferences']) assert.ok(resources[key], `engine returns ${key}`)
  assert.equal(resources.service, ctx.betterSidebar)
  assert.ok(resources.service.getTabs().some(tab => tab.id === 'editor'))
  assert.equal(core.entriesOfSlot('settings.section').some(entry => entry.options.id === 'better-sidebar'), false)
  assert.equal(effectLabels.some(label => label.includes('settings navigation icon')), false)
  const renderSlot = name => core.entriesOfSlot(name).map(entry => React.createElement(entry.component, { key: entry.options.id, ...entry.inject?.(), t: locale.bind(entry.locale) }))
  await flush(() => root.render(React.createElement(general.component, { renderSlot })))
  assert.ok(document.querySelector('[data-existing-language]'))
  assert.equal(document.querySelectorAll('.dsh-app-workbench-settings').length, 1)
  const ssh = document.querySelector('[aria-label="SSH 主机"]')
  assert.equal(ssh.value, 'old-host')
  assert.equal(ssh.parentElement.tagName, 'SPAN', 'released Input supplies the real wrapper instead of a test atom')
  await flush(() => { ssh.value = 'new-host'; Simulate.change(ssh) })
  await flush(() => Simulate.blur(ssh))
  assert.equal(requests.find(request => request.url.endsWith('settings.update')).body.patch.pluginSettings.editor.openWith.sshHost, 'new-host')
  assert.equal(resources.store.getPrefs().pluginSettings.editor.openWith.sshHost, 'new-host')
  assert.equal(remoteListeners.size, 1)

  await flush(() => { for (const dispose of ownedDisposers.reverse()) dispose?.(); root.render(React.createElement(general.component, { renderSlot })) })
  assert.equal(core.entriesOfSlot('settings.general.item').some(entry => entry.options.id === 'dsh-app-workbench'), false)
  assert.equal(document.querySelector('.dsh-app-workbench-settings'), null)
  assert.ok(document.querySelector('[data-existing-language]'), 'unloading DSH App preserves existing General contributions')
  assert.equal(remoteListeners.size, 0)
  stopLanguage()
})
