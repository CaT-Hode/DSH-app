/** Exercise the integrated General workbench UI without mutating a running profile. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { join } from 'node:path'
import createSidebarSettingsClient, { createSidebarPreferencesController } from '../client/sidebar-settings.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const React = require('react')
// Use the retained engine's parser for historical open-map input, including in-progress editor rows.
const engineSource = readFileSync(new URL('../lib/sidebar/upstream/client-factory.mjs', import.meta.url), 'utf8')
const openDefaults = engineSource.slice(engineSource.indexOf('const OPEN_WITH_DEFAULTS ='), engineSource.indexOf('/** The built-in open targets'))
const openParser = engineSource.slice(engineSource.indexOf('function isCustomEditor('), engineSource.indexOf('/** Whether a custom editor id belongs'))
const parseOpenWithConfig = runInNewContext(`${openDefaults}\n${openParser}\nparseOpenWithConfig`)
const seed = () => ({
  autoOpenSubagent: true, autoOpenJobs: true, tasksViewMode: 'graph', mobileNoAutoOpen: true, mobileDefaultTree: true,
  agentOpenTools: false, editorExplorer: false, titleBarScheme: 'auto', titleBarPresetId: '', customCss: '', titleBarCompat: false,
  titleBarStripPx: 40, htmlViewerNoSandbox: false, htmlViewerDefaultUnsafe: false,
  tabsEnabled: {}, viewersEnabled: {}, pluginSettings: { retained: { untouched: true }, editor: { openWith: { sshHost: '', customEditors: [], pinned: ['vscode'] } } },
})
const flushPromises = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

test('queued workbench changes merge maps against each returned server revision', async () => {
  let prefs = seed(), revision = 'r1', observed
  const first = deferred(), calls = []
  const store = { getPrefs: () => prefs, setPrefs: value => { prefs = value } }
  const controller = createSidebarPreferencesController({ store, parsePrefs: value => value, onState: state => { observed = state }, api: {
    settingsGet: async () => ({ value: prefs, revision }),
    settingsUpdate: async (patch, expected) => {
      calls.push({ patch: structuredClone(patch), expected })
      if (calls.length === 1) await first.promise
      assert.equal(expected, revision)
      prefs = { ...prefs, ...patch }; revision = `r${calls.length + 1}`
      return { value: prefs, revision }
    },
  } })
  await controller.load()
  controller.write(current => ({ tabsEnabled: { ...current.tabsEnabled, files: false } }))
  controller.write(current => ({ tabsEnabled: { ...current.tabsEnabled, changes: false } }))
  controller.write(current => ({ pluginSettings: { ...current.pluginSettings, custom: { ...current.pluginSettings.custom, first: true } } }))
  controller.write(current => ({ pluginSettings: { ...current.pluginSettings, custom: { ...current.pluginSettings.custom, second: 'keep' } } }))
  assert.deepEqual(observed.prefs.tabsEnabled, { files: false, changes: false })
  assert.equal(calls.length, 1, 'only one write is active')
  first.resolve(); await flushPromises()
  assert.deepEqual(calls.map(call => call.expected), ['r1', 'r2', 'r3', 'r4'])
  assert.deepEqual(prefs.tabsEnabled, { files: false, changes: false })
  assert.deepEqual(prefs.pluginSettings.custom, { first: true, second: 'keep' })
  assert.deepEqual(prefs.pluginSettings.retained, { untouched: true })
  assert.equal(observed.saving, false)
  controller.dispose()
})

test('revision conflicts discard queued stale writes and reload the current server preferences', async () => {
  let observed, reads = 0, writes = 0, stored = seed()
  const pending = deferred()
  const current = { ...seed(), agentOpenTools: true, titleBarScheme: 'web' }
  const controller = createSidebarPreferencesController({ store: { getPrefs: () => stored, setPrefs: value => { stored = value } }, parsePrefs: value => value, onState: state => { observed = state }, api: {
    settingsGet: async () => ({ value: reads++ === 0 ? seed() : current, revision: reads === 1 ? 'r1' : 'r9' }),
    settingsUpdate: async () => { writes++; await pending.promise; throw Object.assign(new Error('conflict'), { code: 'settings-conflict' }) },
  } })
  await controller.load()
  controller.write({ agentOpenTools: true })
  controller.write({ titleBarScheme: 'custom' })
  pending.resolve(); await flushPromises()
  assert.equal(writes, 1, 'the queued edit is not replayed after the conflicting revision')
  assert.equal(observed.error.code, 'settings-conflict')
  assert.equal(observed.prefs.titleBarScheme, 'web')
  assert.equal(observed.saving, false)
  assert.equal(reads, 2)
  controller.dispose()
})

test('unmounted workbench views do not update the shared store or send queued writes', async () => {
  let updates = 0, writes = 0, notices = 0
  const pending = deferred()
  const controller = createSidebarPreferencesController({ store: { getPrefs: seed, setPrefs: () => updates++ }, parsePrefs: value => value, onState: () => notices++, api: {
    settingsGet: async () => ({ value: seed(), revision: 'r1' }),
    settingsUpdate: async () => { writes++; return pending.promise },
  } })
  await controller.load()
  controller.write({ agentOpenTools: true })
  controller.write({ titleBarScheme: 'web' })
  const before = { updates, notices }
  controller.dispose()
  pending.resolve({ value: { ...seed(), agentOpenTools: true }, revision: 'r2' })
  await flushPromises()
  assert.deepEqual({ updates, notices }, before)
  assert.equal(writes, 1)
})

async function harness({ getFailure, extraTabs = [], onUpdate, initialPrefs } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = require('react-dom/client')
  const { Simulate } = require('react-dom/test-utils')
  const client = createSidebarSettingsClient(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? { Input: props => React.createElement('input', props) } : require(id))
  const t = (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), client.dictionaries.zh[key] ?? key)
  let prefs = initialPrefs ?? seed(), revision = 1, registryListener, externalListener, getAttempts = 0
  const calls = []
  const store = { getPrefs: () => prefs, setPrefs: next => { prefs = next } }
  const tabs = [
    { id: 'editor', title: 'Old files title', description: 'Legacy copy', order: 10, settings: { toggles: [{ key: 'editorExplorer', type: 'select', title: 'Old explorer title' }], pluginToggles: [{ key: 'openWithPluginTargets', title: 'Legacy targets' }], render: () => { throw new Error('the old editor UI must not render') } } },
    { id: 'subagent', title: 'Old tasks title', order: 30, settings: { toggles: [{ key: 'autoOpenSubagent' }, { key: 'autoOpenJobs' }, { key: 'tasksViewMode', type: 'select' }] } },
    ...extraTabs,
  ]
  const service = { getTabs: () => tabs, getFileViewers: () => [{ id: 'html', exts: ['html'], settings: { toggles: [{ key: 'htmlViewerNoSandbox' }, { key: 'htmlViewerDefaultUnsafe' }] } }, { id: 'custom:csv', title: () => 'CSV viewer', exts: ['csv'], priority: 10 }], subscribe: listener => { registryListener = listener; return () => { registryListener = null } } }
  const api = {
    settingsGet: async () => { if (getFailure && getAttempts++ === 0) throw new Error('offline'); return { value: structuredClone(prefs), revision: `r${revision}` } },
    settingsUpdate: async (patch, expected) => {
      assert.equal(expected, `r${revision}`)
      calls.push(structuredClone(patch)); onUpdate?.(patch)
      prefs = { ...prefs, ...patch }; revision++
      return { value: structuredClone(prefs), revision: `r${revision}` }
    },
  }
  const root = createRoot(document.getElementById('root'))
  const flush = action => React.act(async () => { action?.(); await flushPromises() })
  await flush(() => root.render(React.createElement(client.SidebarSettings, { t, store, service, api, parsePrefs: value => value, parseOpenWithConfig, shellPresets: () => [{ id: 'desktop', title: 'Desktop shell' }], subscribePreferences: listener => { externalListener = listener; return () => { externalListener = null } } })))
  let unmounted = false
  return {
    flush, Simulate, calls, tabs, client,
    prefs: () => prefs,
    label: label => document.querySelector(`[aria-label="${label}"]`),
    async toggle(label) { await flush(() => { const input = this.label(label); input.checked = !input.checked; Simulate.change(input) }) },
    async change(label, value) { await flush(() => { const input = this.label(label); input.value = value; Simulate.change(input) }) },
    async draft(label, value) { await flush(() => { const input = this.label(label); input.value = value; Simulate.change(input) }); await flush(() => Simulate.blur(this.label(label))) },
    async registry() { await flush(registryListener) },
    async external(patch) { prefs = { ...prefs, ...patch }; revision++; await flush(externalListener) },
    async unmount() { await flush(() => root.unmount()); unmounted = true },
    async close() { if (!unmounted) await flush(() => root.unmount()); dom.window.close(); for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] },
  }
}

test('General workbench settings retain dynamic features, typed preferences and editor targets without predecessor branding', async () => {
  const ui = await harness({ extraTabs: [{ id: 'third-party', title: () => 'Extension tools', settings: { pluginToggles: [{ key: 'width', type: 'number', title: 'Extension width', min: 1, max: 9 }], render: ({ prefs, pluginSettings, updatePluginSetting }) => React.createElement('button', { type: 'button', onClick: () => updatePluginSetting('marker', `${prefs.titleBarScheme}:${pluginSettings.width}`) }, 'Configure extension') } }] })
  try {
    assert.equal(document.querySelectorAll('.dsh-app-workbench-heading h2').length, 1)
    assert.doesNotMatch(document.body.textContent, /DSH-better-sidebar|v0\.24\.1|Legacy|Old .*title/)
    assert.equal(ui.label('CSV viewer').checked, true)
    assert.deepEqual(Object.keys(ui.client.dictionaries.zh).sort(), Object.keys(ui.client.dictionaries.en).sort())
    await ui.toggle('允许 Agent 控制侧栏')
    await ui.toggle('CSV viewer')
    assert.equal(ui.prefs().agentOpenTools, true)
    assert.deepEqual(ui.prefs().viewersEnabled, { 'custom:csv': false })
    await ui.change('文件浏览方式', '0')
    assert.equal(ui.prefs().editorExplorer, true, 'boolean select values are not persisted as DOM strings')
    await ui.change('默认任务视图', '1')
    assert.equal(ui.prefs().tasksViewMode, 'tree')
    await ui.change('窗口位置适配', '2')
    assert.equal(ui.prefs().titleBarScheme, 'preset')
    assert.equal(ui.prefs().titleBarPresetId, 'desktop')
    await ui.change('窗口位置适配', '3')
    await ui.draft('标题栏预留高度', '999')
    await ui.draft('自定义 CSS', '.workspace { gap: 8px; }')
    assert.equal(ui.prefs().titleBarStripPx, 120)
    assert.equal(ui.prefs().customCss, '.workspace { gap: 8px; }')
    await ui.draft('SSH 主机', 'my-server')
    assert.equal(ui.prefs().pluginSettings.editor.openWith.sshHost, 'my-server')
    await ui.flush(() => [...document.querySelectorAll('button')].find(button => button.textContent === '添加编辑器').click())
    await ui.draft('编辑器名称', 'My editor')
    await ui.draft('打开 URL 模板', 'custom://file/{path}')
    assert.equal(ui.prefs().pluginSettings.editor.openWith.customEditors[0].name, 'My editor')
    assert.deepEqual(ui.prefs().pluginSettings.editor.openWith.pinned, ['vscode'])
    await ui.draft('Extension width', '55')
    await ui.flush(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Configure extension').click())
    assert.deepEqual(ui.prefs().pluginSettings['third-party'], { width: 9, marker: 'custom:9' })
    assert.deepEqual(ui.prefs().pluginSettings.retained, { untouched: true })
    ui.tabs.push({ id: 'new-contribution', title: 'New contribution' }); await ui.registry()
    assert.ok(ui.label('New contribution'))
    await ui.external({ agentOpenTools: false })
    assert.equal(ui.label('允许 Agent 控制侧栏').checked, false)
  } finally { await ui.close() }
})

test('read failures are visible and retryable, and throwing contributed settings remain contained', async () => {
  const previousError = console.error
  const captured = []
  console.error = (...args) => captured.push(args)
  const ui = await harness({ getFailure: true, extraTabs: [{ id: 'broken-settings', title: 'Broken extension', settings: { render: () => { throw new Error('third-party panel failed') } } }] })
  try {
    assert.match(document.querySelector('[role=alert]').textContent, /无法读取工作台设置/)
    assert.equal(document.querySelector('fieldset').disabled, true)
    await ui.flush(() => [...document.querySelectorAll('button')].find(button => button.textContent === '重新加载').click())
    assert.equal(document.querySelector('fieldset').disabled, false)
    assert.match(document.body.textContent, /扩展设置暂不可用/)
    assert.ok(ui.label('允许 Agent 控制侧栏'))
    await ui.toggle('允许 Agent 控制侧栏')
    assert.equal(ui.prefs().agentOpenTools, true)
    assert.ok(captured.length > 0)
  } finally { await ui.close(); console.error = previousError }
})

test('the published locale formatter resolves every workbench label in both languages', t => {
  const core = process.env.DSH_APP_TEST_CORE_ROOT
  if (!core) { t.skip('Set DSH_APP_TEST_CORE_ROOT for the released locale runtime check'); return }
  let factory
  runInNewContext(readFileSync(join(core, 'node_modules/@deepseek-ai/dsh-client-locale/lib/client.js'), 'utf8'), { window: { __ModuleLoader__: { load: row => { factory = row.factory } } }, document: { querySelector: () => ({}) }, console })
  const seeds = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), '@deepseek-ai/dsh-client-ui-primitives': {}, '@deepseek-ai/dsh-client-store': {} }
  const locale = factory(id => seeds[id])
  const client = createSidebarSettingsClient(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id))
  for (const language of ['zh', 'en']) for (const key of Object.keys(client.dictionaries.en)) {
    const text = { zh: client.dictionaries.zh[key], en: client.dictionaries.en[key] }
    const resolved = locale.LocaleRuntime.prototype.resolveText.call({ snapshot: { active: language }, fallbackChain: () => [language, 'en'] }, text)
    assert.equal(resolved, text[language])
  }
})

test('historical malformed Open with values are normalized before rendering and editing', async () => {
  for (const legacy of [null, 'old value', {}, { customEditors: 'invalid', pinned: null }, { customEditors: [{ id: 'in-progress', name: '', urlTemplate: '', isVscodeFamily: false }, { id: 'missing-fields' }], pinned: ['vscode', 5] }]) {
    const initialPrefs = seed()
    initialPrefs.pluginSettings.editor.openWith = legacy
    const ui = await harness({ initialPrefs })
    try {
      assert.ok(ui.label('允许 Agent 控制侧栏'), 'General settings remain usable with legacy open-map values')
      await ui.draft('SSH 主机', 'remote')
      assert.equal(ui.prefs().pluginSettings.editor.openWith.sshHost, 'remote')
      assert.ok(Array.isArray(ui.prefs().pluginSettings.editor.openWith.customEditors))
      assert.ok(Array.isArray(ui.prefs().pluginSettings.editor.openWith.pinned))
      if (legacy?.customEditors?.[0]?.id === 'in-progress') {
        assert.equal(ui.prefs().pluginSettings.editor.openWith.customEditors.length, 1)
        assert.deepEqual(ui.prefs().pluginSettings.editor.openWith.pinned, ['vscode'])
      }
    } finally { await ui.close() }
  }
})
