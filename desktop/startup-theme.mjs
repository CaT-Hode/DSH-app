import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

const PREFERENCES = new Set(['light', 'dark', 'system'])

/** Read DSH's saved Appearance preference without evaluating JavaScript tags.
 * @param profile Active DSH profile directory.
 * @returns Built-in preference, or system when no readable preference exists.
 */
export function readStartupPreference(profile) {
  let source
  try { source = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8') }
  catch { return 'system' } // Recovery pages must remain visible when the profile is missing or unreadable.
  const document = parseDocument(source, { logLevel: 'silent', uniqueKeys: true })
  if (document.errors.length || !isSeq(document.contents)) return 'system'
  let preference = 'system'
  for (const entry of document.contents.items) {
    if (!isMap(entry) || entry.get('id') !== 'ui-theme' || entry.has('insert')) continue
    const config = entry.get('config', true)
    if (!isMap(config) || !config.has('preference')) continue
    const value = config.get('preference', true)
    preference = isScalar(value) && (!value.tag || value.tag === 'tag:yaml.org,2002:str') && PREFERENCES.has(value.value) ? value.value : 'system'
  }
  return preference
}

/** Native canvas and caption colors shared by loading and failure pages.
 * @param dark Whether the effective appearance is dark.
 * @returns Matching background and foreground colors.
 */
export function startupColors(dark) {
  return dark ? { background: '#191919', foreground: '#dce0df' } : { background: '#ffffff', foreground: '#253039' }
}

/** Adopt the profile preference before local HTML paints, without a backend call.
 * @param theme Electron nativeTheme.
 * @param profile Active DSH profile directory.
 * @param window Optional live desktop window.
 * @param controlsHeight Native caption controls height.
 * @param scheme Optional effective scheme reported by the loaded DSH page.
 * @param source Optional validated live preference from the official theme presenter.
 * @returns Colors used for the native canvas and caption.
 */
export function applyStartupTheme(theme, profile, window, controlsHeight, scheme, source) {
  const preference = source ?? readStartupPreference(profile)
  if (theme.themeSource !== preference) theme.themeSource = preference
  const palette = startupColors(scheme === undefined ? theme.shouldUseDarkColors : scheme === 'dark')
  if (window && !window.isDestroyed()) {
    window.setBackgroundColor(palette.background)
    window.setTitleBarOverlay({ color: palette.background, symbolColor: palette.foreground, height: controlsHeight })
  }
  return palette
}
