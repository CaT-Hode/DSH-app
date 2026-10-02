/** Verify owned market requests and queued-change presentation without touching a profile. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import createPluginPagesClient from '../client/plugin-pages.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

async function harness(fetcher, props = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'HTMLElement', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.fetch = fetcher
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { Simulate } = require('react-dom/test-utils')
  const client = createPluginPagesClient(require)
  const t = key => client.dictionaries.zh[key]
  const root = createRoot(document.getElementById('root'))
  let unmounted = false
  const flush = action => React.act(async () => { action?.(); await Promise.resolve(); await Promise.resolve() })
  await flush(() => root.render(React.createElement(client.MarketPage, { t, locale: 'zh', ...props })))
  return {
    flush, Simulate, dom,
    button: label => [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label || button.textContent === label),
    async unmount() { if (!unmounted) { await flush(() => root.unmount()); unmounted = true } },
    async close() {
      if (!unmounted) { await flush(() => root.unmount()); unmounted = true }
      dom.window.close()
      for (const key of keys) {
        const descriptor = originals.get(key)
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value })
const catalog = { plugins: [
  { id: 'dsh-sample', packageName: 'dsh-sample', name: 'Sample', description: { zh: '示例插件' }, category: ['UI'], version: '1.0.1', install: 'dsh-sample', url: 'https://example.com/sample' },
  { id: 'github:owner/repository', packageName: null, name: 'GitHub only', description: { zh: '仅 GitHub 发布' }, category: ['UI'], install: 'github:owner/repository' },
], categories: { UI: { zh: '界面' } } }
const emptyState = () => ({ installed: [], pending: [], operation: null, restartRequired: false, capabilities: { install: true, uninstall: true, update: true, restart: true } })

test('market queues GitHub and npm changes, preserves installed state, cancels and requests restart', async () => {
  const calls = []
  const state = emptyState()
  state.installed = [{ name: 'dsh-sample', version: '1.0.0', updateAvailable: false }]
  let operation = 0
  const ui = await harness(async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, method: options.method, credentials: options.credentials, body })
    if (url.endsWith('/catalog')) return response(catalog)
    if (url.endsWith('/state')) return response(structuredClone(state))
    if (url.endsWith('/check-updates')) {
      state.installed[0].updateAvailable = true
      state.installed[0].latestVersion = '1.0.1'
      return response(structuredClone(state))
    }
    if (url.endsWith('/operations')) {
      const packageName = body.packageName || 'dsh-github-source'
      const id = `operation-${++operation}`
      state.pending.push({ id, packageName, kind: body.kind, spec: body.spec })
      state.operation = { id, packageName, kind: body.kind, state: 'queued' }
      return response({ operationId: id, state: 'queued' })
    }
    if (url.endsWith('/cancel')) {
      state.pending = state.pending.filter(item => item.packageName !== body.packageName)
      state.operation = null
      return response({ ok: true })
    }
    if (url.endsWith('/restart')) return response({ ok: true })
    assert.fail(`Unexpected owned market request: ${url}`)
  })
  try {
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 2)
    const github = document.querySelector('[data-dsh-app-market-package="github:owner/repository"]')
    assert.ok(github, 'GitHub-only catalog entries remain visible')
    await ui.flush(() => [...github.querySelectorAll('button')].find(button => button.textContent === '安装').click())
    assert.deepEqual(calls.find(call => call.url.endsWith('/operations')).body, { kind: 'install', spec: 'github:owner/repository' })
    assert.ok(document.body.textContent.includes('已加入待执行列表，重启后应用。'))
    assert.ok(document.body.textContent.includes('1 项变更等待重启后应用'))
    assert.equal(state.installed.length, 1, 'queueing does not claim an install succeeded')
    assert.equal(document.body.textContent.includes('已应用'), false)
    await ui.flush(() => ui.button('取消排队').click())
    assert.equal(state.pending.length, 0)
    assert.equal(ui.button('重启并应用'), undefined)
    await ui.flush(() => ui.button('检查更新').click())
    const sample = document.querySelector('[data-dsh-app-market-package="dsh-sample"]')
    assert.ok(sample.textContent.includes('1.0.0 → 1.0.1'))
    await ui.flush(() => [...sample.querySelectorAll('button')].find(button => button.textContent === '更新').click())
    assert.deepEqual(calls.filter(call => call.url.endsWith('/operations')).at(-1).body, { kind: 'update', packageName: 'dsh-sample' })
    await ui.flush(() => ui.button('重启并应用').click())
    assert.ok(calls.some(call => call.url === '/dsh-app/market/restart' && call.method === 'POST'))
    assert.ok(ui.button('正在重启并应用…').disabled)
    assert.ok(calls.every(call => call.credentials === 'same-origin'))
    assert.ok(calls.every(call => call.url.startsWith('/dsh-app/market/')))
  } finally { await ui.close() }
})

test('source install sends the exact source and installed filter includes packages outside the catalog', async () => {
  const calls = []
  const state = emptyState()
  state.installed = [{ name: '@deepseek-ai/dsh-official-sample', version: '0.2.0', description: 'Installed outside catalog' }]
  const ui = await harness(async (url, options) => {
    if (url.endsWith('/catalog')) return response(catalog)
    if (url.endsWith('/state')) return response(state)
    if (url.endsWith('/operations')) { calls.push(JSON.parse(options.body)); return response({ operationId: 'source-operation' }) }
    assert.fail(url)
  })
  try {
    const input = document.querySelector('[aria-label="从来源安装"]')
    const spec = 'git+https://github.com/owner/repository.git#stable'
    await ui.flush(() => ui.Simulate.change(input, { target: { value: spec } }))
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-market-source')))
    assert.deepEqual(calls[0], { kind: 'install', spec })
    await ui.flush(() => ui.button('已安装').click())
    const row = document.querySelector('[data-dsh-app-market-package="@deepseek-ai/dsh-official-sample"]')
    assert.ok(row, 'uncatalogued installed packages retain management actions')
    assert.ok(row.textContent.includes('卸载'), 'the host decides whether an installed plugin can be removed')
    await ui.flush(() => [...row.querySelectorAll('button')].find(button => button.textContent === '卸载').click())
    assert.deepEqual(calls.at(-1), { kind: 'uninstall', packageName: '@deepseek-ai/dsh-official-sample' })
  } finally { await ui.close() }
})

test('offline catalog preserves pending recovery and unmount aborts unfinished requests', async () => {
  const state = emptyState()
  state.capabilities.restart = false
  state.pending = [{ packageName: 'dsh-sample', kind: 'update' }]
  const ui = await harness(async url => url.endsWith('/catalog') ? response({ error: 'Catalog unavailable' }, 503) : response(state))
  try {
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('Catalog unavailable'))
    assert.ok(document.body.textContent.includes('1 项变更等待重启后应用'))
    assert.ok(document.body.textContent.includes('请重启 DSH 客户端以应用这些变更。'))
    assert.equal(ui.button('重启并应用'), undefined)
  } finally { await ui.close() }
  const signals = []
  const waiting = await harness((_, options) => new Promise((resolve, reject) => {
    signals.push(options.signal)
    options.signal.addEventListener('abort', () => reject(new DOMException('Page closed', 'AbortError')), { once: true })
  }))
  try {
    assert.equal(signals.length, 2)
    await waiting.unmount()
    assert.ok(signals.every(signal => signal.aborted), 'leaving the page releases catalog and state requests')
  } finally { await waiting.close() }
})

test('one discovery list merges uncatalogued installs and official features without duplicate cards', async () => {
  const state = emptyState()
  state.installed = [{ name: 'dsh-sample', version: '1.0.0', updateAvailable: true, latestVersion: '1.0.1' }, { name: 'dsh-local', version: '0.4.0', source: 'local' }]
  const configured = [], toggled = []
  const ui = await harness(async url => response(url.endsWith('/catalog') ? catalog : state), {
    officialPackages: [{ name: 'dsh-sample', installed: true, enabled: true, meta: { title: 'Sample configured', description: 'Configurable sample' } }, { name: '@deepseek-ai/dsh-official-feature', optional: true, installed: false, enabled: false, meta: { title: 'Official feature' } }, { name: '@deepseek-ai/dsh-base', installed: true, enabled: true }],
    resolveText: text => text,
    onConfigure: name => configured.push(name), onSetEnabled: (...args) => toggled.push(args),
  })
  try {
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 4)
    assert.equal(document.querySelectorAll('[data-dsh-app-market-package="dsh-sample"]').length, 1)
    assert.equal(document.querySelector('[data-dsh-app-market-package="@deepseek-ai/dsh-base"]'), null)
    await ui.flush(() => ui.button('可更新').click())
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 1)
    await ui.flush(() => ui.button('配置').click())
    assert.deepEqual(configured, ['dsh-sample'])
    await ui.flush(() => ui.button('可安装').click())
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 2)
    await ui.flush(() => ui.button('启用').click())
    assert.deepEqual(toggled, [['@deepseek-ai/dsh-official-feature', true]], 'shipped official features use the official activation interface')
    await ui.flush(() => ui.button('已安装').click())
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 2)
    await ui.flush(() => document.querySelector('[aria-label="详情: dsh-local"]').click())
    assert.ok(document.querySelector('.dsh-app-market-detail').textContent.includes('本地插件'))
    await ui.flush(() => ui.button('关闭详情').click())
    assert.equal(document.querySelector('.dsh-app-market-detail'), null)
  } finally { await ui.close() }
})

test('official optional plugins precede installed community plugins and show their runtime provenance', async () => {
  const schedule = '@deepseek-ai/dsh-experimental-schedule-bundle'
  const voice = '@deepseek-ai/dsh-experimental-voice-input-bundle'
  const state = emptyState()
  state.installed = [{ name: 'dsh-sample', version: '1.0.0', enabled: true }]
  const listed = { ...catalog, plugins: [...catalog.plugins, { packageName: schedule, name: 'Old schedule listing', version: '0.1.7-rc.2', url: 'https://example.com/old-source' }] }
  const configured = [], toggled = []
  const ui = await harness(async url => response(url.endsWith('/catalog') ? listed : state), {
    officialPackages: [
      { name: schedule, version: '0.2.0-rc.2', optional: true, installed: false, enabled: false, meta: { title: '自动化任务' } },
      { name: voice, version: '0.2.0-rc.2', optional: true, installed: false, enabled: true, meta: { title: '语音输入' } },
    ],
    onConfigure: name => configured.push(name), onSetEnabled: (...args) => toggled.push(args),
  })
  try {
    const cards = () => [...document.querySelectorAll('.dsh-app-market-card')]
    assert.deepEqual(cards().slice(0, 2).map(card => card.dataset.dshAppMarketPackage), [voice, schedule], 'even a disabled official bundle precedes an installed community plugin')
    assert.equal(document.querySelectorAll(`[data-dsh-app-market-package="${schedule}"]`).length, 1, 'the runtime and catalog share one official card')
    const scheduleCard = document.querySelector(`[data-dsh-app-market-package="${schedule}"]`)
    assert.ok(scheduleCard.textContent.includes('DeepSeek AI 官方'))
    assert.ok(scheduleCard.textContent.includes('DSH 内置 · 可选'))
    assert.ok(scheduleCard.textContent.includes('已停用'))
    assert.ok(scheduleCard.textContent.includes('版本: 0.2.0-rc.2'))
    assert.equal(scheduleCard.textContent.includes('0.1.7-rc.2'), false, 'an old community catalog version cannot override the installed DSH bundle')
    assert.equal(scheduleCard.querySelector('a').href, 'https://github.com/deepseek-ai/deepseek-harness')
    await ui.flush(() => ui.button('详情: 自动化任务').click())
    assert.deepEqual(configured, [schedule], 'provenance labels preserve official configuration navigation')
    await ui.flush(() => ui.button('可安装').click())
    assert.equal(cards()[0].dataset.dshAppMarketPackage, schedule)
    await ui.flush(() => ui.button('启用').click())
    assert.deepEqual(toggled, [[schedule, true]], 'shipped optional bundles still use the official enable action')
    await ui.flush(() => ui.button('已安装').click())
    assert.equal(cards()[0].dataset.dshAppMarketPackage, voice)
    assert.equal(cards().some(card => card.dataset.dshAppMarketPackage === schedule), false)
  } finally { await ui.close() }
})

test('released locale resolver renders packages with absent or partial metadata', async () => {
  const coreRoot = process.env.DSH_APP_TEST_CORE_ROOT
  assert.ok(coreRoot, 'Set DSH_APP_TEST_CORE_ROOT to the supported released DSH runtime')
  let factory
  runInNewContext(readFileSync(join(coreRoot, 'node_modules/@deepseek-ai/dsh-client-locale/lib/client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load: registration => { factory = registration.factory } } },
  })
  const { LocaleRuntime } = factory(id => ['react', 'react/jsx-runtime'].includes(id) ? require(id) : {})
  const localeRuntime = new LocaleRuntime({}, undefined, { languages: ['zh'], preference: 'zh' })
  assert.throws(() => localeRuntime.resolveText(undefined), /en/, 'the released resolver requires a supplied text value')
  const configured = []
  const ui = await harness(async url => response(url.endsWith('/catalog') ? { plugins: [], categories: {} } : emptyState()), {
    officialPackages: [
      { name: 'no-metadata', installed: true, enabled: true },
      { name: 'title-only', installed: true, enabled: true, meta: { title: 'Title only' } },
      { name: 'localized', installed: true, enabled: true, meta: { title: { en: 'Localized title', zh: '本地化标题' }, description: { en: 'English description' } } },
    ],
    resolveText: text => localeRuntime.resolveText(text),
    onConfigure: name => configured.push(name),
  })
  try {
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 3)
    assert.ok(document.querySelector('[data-dsh-app-market-package="no-metadata"]').textContent.includes('no-metadata'))
    assert.ok(document.querySelector('[data-dsh-app-market-package="title-only"]').textContent.includes('Title only'))
    const translated = document.querySelector('[data-dsh-app-market-package="localized"]')
    assert.ok(translated.textContent.includes('本地化标题'))
    assert.ok(translated.textContent.includes('English description'), 'the official resolver retains its English fallback')
    await ui.flush(() => ui.button('详情: no-metadata').click())
    assert.deepEqual(configured, ['no-metadata'], 'a missing title does not prevent official configuration')
  } finally { await ui.close() }
})

test('catalog failure still exposes installed management and the owned app cannot uninstall itself', async () => {
  const state = emptyState()
  state.installed = [{ name: 'dsh-app', version: '0.3.4', protected: true }, { name: 'offline-plugin', version: '1.0.0' }]
  const ui = await harness(async url => url.endsWith('/catalog') ? response({ error: 'offline' }, 503) : response(state))
  try {
    assert.equal(document.querySelectorAll('.dsh-app-market-card').length, 2)
    assert.ok(document.querySelector('[data-dsh-app-market-package="offline-plugin"]').textContent.includes('卸载'))
    assert.ok(document.querySelector('[data-dsh-app-market-package="dsh-app"]').textContent.includes('由 DSH App 管理'))
    assert.equal([...document.querySelectorAll('[data-dsh-app-market-package="dsh-app"] button')].some(button => button.textContent === '卸载'), false)
  } finally { await ui.close() }
})

test('official activation restart notice and stale discovery retain a working owned restart action', async () => {
  const calls = []
  const state = emptyState()
  const ui = await harness(async (url, options) => { calls.push(url); return response(url.endsWith('/catalog') ? { ...catalog, stale: true } : state) }, { officialNotice: { text: 'Official restart required', restart: true } })
  try {
    assert.ok(document.body.textContent.includes('Official restart required'))
    assert.ok(document.body.textContent.includes('目录暂时无法刷新，当前显示上次保存的内容。'))
    await ui.flush(() => ui.button('重启并应用').click())
    assert.ok(calls.includes('/dsh-app/market/restart'))
  } finally { await ui.close() }
})
