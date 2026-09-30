import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import createThemeSyncClient from '../client/theme-sync.mjs'

const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : createRequire(import.meta.url)
const { JSDOM } = dependencies('jsdom')
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

test('appearance transport publishes source changes with identical colors and stops after unload', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const { window } = dom
  const sync = createThemeSyncClient()
  const events = []
  window.addEventListener(sync.EVENT, event => events.push(event.detail))
  const stop = sync.observe(window)
  t.after(() => { stop(); dom.window.close() })
  assert.equal(events.length, 0, 'no preference is guessed before the official presenter publishes')
  const root = window.document.documentElement
  root.style.colorScheme = 'dark'
  root.setAttribute('data-ds-theme-source', 'dark')
  await settle()
  root.setAttribute('data-ds-theme-source', 'system')
  await settle()
  assert.deepEqual(events, [{ source: 'dark', scheme: 'dark' }, { source: 'system', scheme: 'dark' }])
  root.style.setProperty('--unrelated-token', '1')
  await settle()
  assert.equal(events.length, 2, 'unrelated token writes do not emit repeated IPC')
  root.style.colorScheme = 'light'
  stop()
  await settle()
  assert.equal(events.length, 2, 'an already queued change is suppressed when the fiber unloads')
  root.setAttribute('data-ds-theme-source', 'light')
  await settle()
  assert.equal(events.length, 2)
})

test('released rc.2 presenter and theme service follow system live without rewriting its preference', async t => {
  const coreRoot = process.env.DSH_APP_TEST_CORE_ROOT
  assert.ok(coreRoot, 'Set DSH_APP_TEST_CORE_ROOT to the separately installed DSH 0.2.0-rc.2 runtime')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const { window } = dom
  const disposers = []
  let stop = () => {}
  let presenter
  t.after(() => { stop(); for (const dispose of disposers.reverse()) dispose(); presenter?.dispose(); dom.window.close() })
  let systemDark = true
  let nativeSource = 'dark'
  const mediaListeners = new Set()
  const media = {
    get matches() { return nativeSource === 'dark' || nativeSource === 'system' && systemDark },
    addEventListener: (name, listener) => { assert.equal(name, 'change'); mediaListeners.add(listener) },
    removeEventListener: (name, listener) => { assert.equal(name, 'change'); mediaListeners.delete(listener) },
  }
  const loadPublished = (name, additions = '') => {
    let factory
    window.__ModuleLoader__ = { load: descriptor => { factory = descriptor.factory } }
    const source = readFileSync(join(coreRoot, `node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`), 'utf8').replace('return module.exports;', `${additions}\nreturn module.exports;`)
    runInNewContext(source, { window, document: window.document, getComputedStyle: window.getComputedStyle.bind(window), matchMedia: () => media, console })
    return factory(() => ({}))
  }
  const { ThemeRuntime } = loadPublished('theme')
  const { testThemePresenter: ThemePresenter } = loadPublished('layout', 'exports.testThemePresenter = ThemePresenter;')
  presenter = new ThemePresenter()
  const writes = []
  // Persisted dark intentionally remains stale while the UI changes to system.
  const host = { getSnapshot: () => ({ value: { preference: 'dark', fontSize: 16 } }), subscribe: () => () => {}, set: (key, value) => writes.push({ key, value }) }
  const ctx = { effect: install => { const dispose = install(); if (dispose) disposers.push(dispose) }, emit: (name, snapshot) => { assert.equal(name, 'theme/change'); presenter.apply(snapshot) } }
  const runtime = new ThemeRuntime(ctx, host)
  const states = []
  stop = createThemeSyncClient().observe(window, state => {
    states.push(state)
    const previousMatches = media.matches
    nativeSource = state.source
    if (previousMatches !== media.matches) for (const listener of mediaListeners) listener()
  })
  assert.equal(nativeSource, 'dark')
  runtime.setTheme('system')
  await settle()
  assert.equal(nativeSource, 'system', 'identical dark colors still release Electron from fixed dark')
  assert.equal(window.document.documentElement.style.colorScheme, 'dark')
  for (const dark of [false, true, false]) {
    systemDark = dark
    for (const listener of mediaListeners) listener()
    await settle()
    assert.equal(runtime.getTheme().preference, 'system')
    assert.equal(window.document.documentElement.style.colorScheme, dark ? 'dark' : 'light')
    assert.deepEqual(states.at(-1), { source: 'system', scheme: dark ? 'dark' : 'light' })
  }
  assert.deepEqual(writes, [{ key: 'preference', value: 'system' }], 'system changes do not persist an effective light/dark preference')
  assert.equal(window.document.body.style.getPropertyValue('--dsh-content-font-size'), '16px')
  runtime.setTheme('light')
  await settle()
  systemDark = true
  const revision = runtime.getTheme().revision
  for (const listener of mediaListeners) listener()
  await settle()
  assert.equal(runtime.getTheme().revision, revision, 'fixed light ignores OS appearance changes')
  assert.equal(window.document.documentElement.style.colorScheme, 'light')
})
