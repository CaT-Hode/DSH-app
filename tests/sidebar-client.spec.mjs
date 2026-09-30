import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import createSidebarBridge, { registerSidebarAliases } from '../client/sidebar-bridge.mjs'

const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : createRequire(import.meta.url)
const { JSDOM } = dependencies('jsdom')

test('released module system keeps public sidebar aliases, contributed registries and native session targets through reload', async t => {
  const coreRoot = process.env.DSH_APP_TEST_CORE_ROOT
  assert.ok(coreRoot, 'Set DSH_APP_TEST_CORE_ROOT to the supported released DSH runtime')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://127.0.0.1:19780/' })
  const { window } = dom
  const names = ['window', 'document', 'localStorage', 'HTMLElement', 'MutationObserver', 'navigator', 'getComputedStyle']
  const originals = new Map(names.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const name of names) Object.defineProperty(globalThis, name, { value: name === 'getComputedStyle' ? window.getComputedStyle.bind(window) : window[name], configurable: true })
  t.after(() => { dom.window.close(); for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] })
  let moduleFactory
  window.__ModuleLoader__ = { load: registration => { moduleFactory = registration.factory } }
  runInNewContext(readFileSync(join(coreRoot, 'node_modules/@deepseek-ai/dsh-client-modules/lib/client.js'), 'utf8'), { window, document, console })
  const { ClientModuleSystem } = moduleFactory(() => ({}))
  const ownRequire = createRequire(import.meta.url)
  const seeds = { react: ownRequire('react'), 'react/jsx-runtime': ownRequire('react/jsx-runtime'), 'react-dom': ownRequire('react-dom'), 'react-dom/client': ownRequire('react-dom/client'), '@deepseek-ai/dsh-client-ui-primitives': {} }
  const target = { mode: 'queue', pendingQueue: [], load: registration => target.pendingQueue.push(registration) }
  registerSidebarAliases(target)
  const aliasCount = target.pendingQueue.length
  registerSidebarAliases(target)
  assert.equal(target.pendingQueue.length, aliasCount, 'another DSH App script execution does not duplicate alias registration')
  const modules = new ClientModuleSystem({ manifest: { rev: 'test', modules: [], plugins: [] }, staticModules: seeds, bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: {} }, registrationTarget: target })
  let bridge
  target.load({ id: 'dsh-app', factory: require => { bridge = createSidebarBridge(require); return { sidebarEngine: bridge.engine } } })
  const api = await modules.import('dsh-better-sidebar/client/service')
  assert.equal(api.SIDEBAR_SERVICE_VERSION, '0.24.1')
  assert.ok(api.SIDEBAR_FEATURES.includes('fileIcons'))
  assert.equal((await modules.import('dsh-better-sidebar/client')).createBetterSidebarService, api.createBetterSidebarService)
  assert.equal((await modules.import('dsh-external/dsh-better-sidebar')).createBetterSidebarService, api.createBetterSidebarService)
  assert.equal((await modules.import('dsh-better-sidebar/client/api')).createBetterSidebarService, api.createBetterSidebarService)
  const store = api.createSidebarStore()
  store.setSession('session-main')
  const service = api.createBetterSidebarService(store)
  const changed = []
  const stopChanges = service.subscribe(() => changed.push(service.getTabs().length))
  const stopTab = service.registerTab({ id: 'git-graph', title: 'Git graph', component: () => null })
  const stopViewer = service.registerFileViewer({ id: 'custom:csv', exts: ['csv'], priority: 10, fetchStrategy: 'fsRead', component: () => null })
  const stopIcons = service.registerFileIcon({ id: 'custom:icons', exts: ['csv'], icon: () => null })
  assert.equal(service.getTab('git-graph').id, 'git-graph')
  assert.equal(service.matchFileViewer('results.csv').id, 'custom:csv')
  assert.equal(service.matchFileIcon('results.csv').id, 'custom:icons')
  const opened = []
  const stopEditor = service.registerTab({ id: 'editor', title: 'Files', component: () => null })
  service.setSurface({ openTab: input => opened.push(input), openResource: input => opened.push(input), fileAddress: (_sessionId, _cwd, path) => `file:${path}`, close: () => undefined, update: () => false, activate: () => false, has: () => false })
  service.openTab({ type: 'git-graph', title: 'History' }, { sessionId: 'session-other', cwd: 'D:/project' })
  service.openFile({ sessionId: 'session-other', cwd: 'D:/project' }, 'src/main.ts')
  assert.equal(opened[0].sessionId, 'session-other')
  assert.equal(opened[1].address, 'file:src/main.ts')
  assert.equal(store.getSnapshot().sessionId, 'session-main', 'targeted opens do not switch the selected conversation')
  stopIcons(); stopViewer(); stopEditor(); stopTab(); stopChanges()
  assert.equal(service.getTabs().length, 0)
  assert.equal(service.getFileViewers().length, 0)
  assert.equal(service.getFileIcons().length, 0)
  assert.equal(changed.at(-1), 0, 'registry subscribers observe contributed entries disappearing')
  const callbackErrors = []
  const previousConsoleError = console.error
  console.error = (...args) => callbackErrors.push(args)
  try {
    let registryNotices = 0, stateNotices = 0
    const stopFailingRegistry = service.subscribe(() => { throw new Error('third-party registry subscriber') })
    const stopRegistryNotice = service.subscribe(() => registryNotices++)
    const stopFailingState = service.subscribeState(() => { throw new Error('third-party state subscriber') })
    const stopStateNotice = service.subscribeState(() => stateNotices++)
    const stopContributed = service.registerTab({ id: 'fault-isolation', title: 'Contributed', component: () => null })
    stopContributed()
    store.setSession('session-after-listener-failure')
    assert.equal(registryNotices, 2, 'a failing subscriber does not block native registry updates or contribution disposal')
    assert.equal(stateNotices, 1, 'a failing state subscriber does not block the remaining session listeners')
    assert.equal(service.getTab('fault-isolation'), undefined)
    assert.equal(callbackErrors.length, 3, 'each callback failure is reported without escaping the dispatcher')
    stopFailingRegistry(); stopRegistryNotice(); stopFailingState(); stopStateNotice()
  } finally { console.error = previousConsoleError }
  const previous = api.createBetterSidebarService
  modules.invalidate('dsh-app')
  const replacement = () => ({ generation: 2 })
  target.load({ id: 'dsh-app', factory: () => ({ sidebarEngine: { createBetterSidebarService: replacement, inject: ['slots'] } }) })
  assert.notEqual(api.createBetterSidebarService, previous)
  assert.equal(api.createBetterSidebarService, replacement, 'cached public aliases delegate to the new owner after HMR')
  assert.deepEqual(Object.keys(api), ['createBetterSidebarService', 'inject'])
})
