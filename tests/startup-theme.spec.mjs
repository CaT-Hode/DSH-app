import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { applyStartupTheme, readStartupPreference } from '../desktop/startup-theme.mjs'
import { startupPage } from '../desktop/startup-page.mjs'

function profileFixture(t) {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-startup-theme-'))
  t.after(() => rmSync(profile, { recursive: true, force: true }))
  return { profile, save: source => writeFileSync(join(profile, 'cordis.patch.yml'), source) }
}

test('Live system preference replaces stale fixed preference even when its resolved color is unchanged', t => {
  const { profile, save } = profileFixture(t)
  save('- id: ui-theme\n  config: { preference: dark }\n')
  const theme = { themeSource: 'dark', shouldUseDarkColors: true }
  assert.equal(applyStartupTheme(theme, profile, undefined, 30, 'dark', 'system').background, '#191919')
  assert.equal(theme.themeSource, 'system')
  theme.shouldUseDarkColors = false
  assert.equal(applyStartupTheme(theme, profile, undefined, 30, undefined, 'system').background, '#ffffff')
  assert.equal(readStartupPreference(profile), 'dark', 'live transport does not rewrite the official persistence document')
})

test('Appearance reads the current profile override and ignores missing, malformed and executable values', t => {
  const { profile, save } = profileFixture(t)
  assert.equal(readStartupPreference(profile), 'system')
  save('- id: another-plugin\n  config: { preference: dark }\n')
  assert.equal(readStartupPreference(profile), 'system')
  for (const preference of ['light', 'dark', 'system']) {
    save(`- id: ui-theme\n  config: { preference: ${preference}, fontSize: 14 }\n`)
    assert.equal(readStartupPreference(profile), preference)
  }
  save('- id: ui-theme\n  config: { preference: dark }\n- id: ui-theme\n  config: { preference: light }\n')
  assert.equal(readStartupPreference(profile), 'light')
  for (const source of ['[broken', 'ui-theme: { preference: dark }', '- id: ui-theme\n  config: { preference: unknown }', '- id: ui-theme\n  config:\n    preference: !!js dark']) {
    save(source)
    assert.equal(readStartupPreference(profile), 'system')
  }
  delete globalThis.dshThemeExpressionExecuted
  save('- id: ui-theme\n  config:\n    preference: !!js "(globalThis.dshThemeExpressionExecuted = true, \'dark\')"\n')
  assert.equal(readStartupPreference(profile), 'system')
  assert.equal(globalThis.dshThemeExpressionExecuted, undefined)
})

test('Native canvas follows saved light/dark, resolves system locally, refreshes saved changes and keeps compact controls', t => {
  const { profile, save } = profileFixture(t)
  let source = 'system'
  let systemDark = true
  let sourceChanges = 0
  const nativeTheme = {
    get themeSource() { return source },
    set themeSource(value) { source = value; sourceChanges++ },
    get shouldUseDarkColors() { return source === 'dark' || source === 'system' && systemDark },
  }
  const paints = []
  const overlays = []
  const window = { isDestroyed: () => false, setBackgroundColor: value => paints.push(value), setTitleBarOverlay: value => overlays.push(value) }
  assert.equal(applyStartupTheme(nativeTheme, profile, undefined, 30).background, '#191919')
  assert.equal(paints.length, 0, 'appearance is available before a window or backend exists')
  save('- id: ui-theme\n  config: { preference: light }\n')
  applyStartupTheme(nativeTheme, profile, window, 30)
  assert.equal(paints.at(-1), '#ffffff')
  assert.equal(overlays.at(-1).symbolColor, '#253039')
  const updates = sourceChanges
  applyStartupTheme(nativeTheme, profile, window, 30)
  assert.equal(sourceChanges, updates, 'unchanged preference does not emit another native theme update')
  save('- id: ui-theme\n  config: { preference: dark }\n')
  systemDark = false
  applyStartupTheme(nativeTheme, profile, window, 30)
  assert.equal(paints.at(-1), '#191919')
  assert.equal(overlays.at(-1).symbolColor, '#dce0df')
  save('- id: ui-theme\n  config: { preference: system }\n')
  applyStartupTheme(nativeTheme, profile, window, 30)
  assert.equal(paints.at(-1), '#ffffff')
  systemDark = true
  applyStartupTheme(nativeTheme, profile, window, 30)
  assert.equal(paints.at(-1), '#191919')
  assert.ok(overlays.every(value => value.height === 30))
})

test('Loading and recovery HTML share light and dark palettes before scripts or backend calls', () => {
  const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : createRequire(import.meta.url)
  const { JSDOM } = dependencies('jsdom')
  const page = new JSDOM(startupPage(''))
  try {
    const { document } = page.window
    const rules = [...document.styleSheets[0].cssRules]
    const light = rules.find(rule => rule.selectorText === ':root')
    const dark = rules.find(rule => rule.conditionText === '(prefers-color-scheme: dark)').cssRules[0]
    assert.equal(light.style.getPropertyValue('--background'), '#ffffff')
    assert.equal(dark.style.getPropertyValue('--background'), '#191919')
    assert.equal(light.style.getPropertyValue('color-scheme'), 'light')
    assert.equal(dark.style.getPropertyValue('color-scheme'), 'dark')
    const console = rules.find(rule => rule.selectorText === '.console')
    assert.equal(console.style.getPropertyValue('background'), 'var(--console)')
    document.body.dataset.phase = 'error'
    assert.ok(document.getElementById('diagnostics'))
    assert.ok(document.getElementById('recover'))
    assert.ok(document.getElementById('restart'))
    assert.equal(document.documentElement.style.getPropertyValue('background'), '', 'phase updates do not install a conflicting palette')
  } finally { page.window.close() }
})
