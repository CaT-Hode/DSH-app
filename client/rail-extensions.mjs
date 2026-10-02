/** Shipped settings remain on the gear; plugin sections use the rail launcher. */
const coreSections = new Set(['general', 'account', 'models', 'plugins', 'agent-presets', 'skills', 'skill', 'skill-center'])
export const isExtensionSection = id => typeof id === 'string' && !coreSections.has(id)

/** Match native ownership, never labels or id substrings. Sections without a
 * panel still get an entry; missing ownership must not merge unrelated plugins. */
export function groupRailExtensions(panels, sections) {
  const attached = new Set()
  const rows = panels.map(panel => {
    const settings = panel.registrant ? sections.filter(section => section.registrant === panel.registrant) : []
    settings.forEach(section => attached.add(section.id))
    return { ...panel, key: `panel:${panel.id}`, panelId: panel.id, settings }
  })
  for (const section of sections) {
    if (attached.has(section.id)) continue
    const settings = section.registrant ? sections.filter(value => value.registrant === section.registrant && !attached.has(value.id)) : [section]
    settings.forEach(value => attached.add(value.id))
    rows.push({ ...section, key: `section:${section.id}`, panelId: null, settings })
  }
  // A lone settings page is already the row's destination. A gear is useful
  // only when it leads to an additional page or a choice of settings pages.
  return rows.map(row => ({ ...row, showSettings: row.settings.length > 0 && (row.panelId !== null || row.settings.length > 1) }))
}

/** Live native slot ledger. Keep selection stable through locale changes and
 * remove it when a plugin unloads; never cache a plugin's rendered page. */
export function createRailExtensionCatalog() {
  let snapshot = { rows: [], selected: null }
  const listeners = new Set()
  const publish = next => { snapshot = next; for (const listener of listeners) listener() }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    sync(entries) {
      // Minified client fibers can share a name with core settings. Such a
      // diagnostic name is not trustworthy plugin ownership; do not attach
      // unrelated forms to whichever panel happened to register first.
      const shared = new Set(entries.filter(entry => coreSections.has(entry.options.id)).map(entry => entry.registrant).filter(Boolean))
      const rows = entries.filter(entry => isExtensionSection(entry.options.id) && !entry.registrant?.startsWith('@deepseek-ai/') && entry.registrant !== 'dsh-app').map(({ options, registrant }) => ({
        id: options.id, registrant: shared.has(registrant) ? undefined : registrant, label: typeof options.label === 'function' ? options.label() : options.label || options.id, order: options.order ?? 0,
      })).sort((a, b) => a.order - b.order)
      publish({ rows, selected: rows.some(row => row.id === snapshot.selected) ? snapshot.selected : null })
    },
    select(id) {
      const selected = snapshot.rows.some(row => row.id === id) ? id : null
      if (selected !== snapshot.selected) publish({ ...snapshot, selected })
      return selected
    },
  }
}
