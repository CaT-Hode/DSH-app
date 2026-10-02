/** Promote third-party settings tabs through native settings registrations.
 * Retain the contributor's component, injections, store and ownership. */
export function installRailNestedSettings(ctx, { useMemo }) {
  const aliases = new Map()
  let decorated, syncing = false, disposed = false
  const coreTabs = new Set(['all', 'mcp', 'skills', 'skill', 'skill-center', 'cost', 'cost-meter'])
  const external = entry => !coreTabs.has(entry.options.id) && Boolean(entry.registrant) && !entry.registrant.startsWith('@deepseek-ai/') && entry.registrant !== 'dsh-app'
  const publish = entry => {
    if (!ctx.slots.entriesOfSlot('settings.section').includes(entry)) return
    ctx.slots.register({ name: 'settings.section', id: entry.options.id, priority: (entry.options.priority ?? 0) + 1 }, () => null)()
  }
  const restore = () => {
    if (decorated && decorated.entry.component === decorated.wrapper) { decorated.entry.component = decorated.original; publish(decorated.entry) }
    decorated = undefined
  }
  function sync() {
    if (syncing || disposed) return
    syncing = true
    try {
      const tabs = ctx.slots.entriesOfSlot('settings.plugins.tab').filter(external)
      const sections = ctx.slots.entriesOfSlot('settings.section').filter(entry => !entry.options.id?.startsWith('dsh-app-extension-tab:'))
      for (const [id, alias] of aliases) {
        if (!tabs.includes(alias.entry) || sections.some(section => section.registrant === alias.entry.registrant && section.component === alias.entry.component)) {
          alias.dispose(); aliases.delete(id)
        }
      }
      for (const entry of tabs) {
        const id = entry.options.id
        if (aliases.has(id) || sections.some(section => section.registrant === entry.registrant && section.component === entry.component)) continue
        const dispose = ctx.slots.register({
          ...entry.options, name: 'settings.section', id: `dsh-app-extension-tab:${id}`,
          registrant: entry.registrant, locale: entry.locale, select: entry.select,
          inject: entry.inject, children: entry.children, store: entry.store,
        }, entry.component)
        aliases.set(id, { entry, dispose })
      }
      const entry = sections.find(section => section.options.id === 'plugins')
      if (decorated?.entry !== entry) {
        restore()
        if (entry) {
          const original = entry.component
          function CorePluginSettings(props) {
            const useTabs = useMemo(() => {
              let previous, filtered, hiddenKey
              return selector => props.useTabs(rows => {
                  const hidden = new Set(ctx.slots.entriesOfSlot('settings.plugins.tab').filter(external).map(tab => tab.options.id))
                  const key = [...hidden].join('\0')
                  if (rows !== previous || key !== hiddenKey) {
                    previous = rows; hiddenKey = key; filtered = rows.filter(row => !hidden.has(row.id))
                  }
                  return selector(filtered)
              })
            }, [props.useTabs])
            return original({ ...props, useTabs })
          }
          entry.component = CorePluginSettings
          decorated = { entry, original, wrapper: CorePluginSettings }
          publish(entry)
        }
      }
    } finally { syncing = false }
  }
  const offTabs = ctx.slots.subscribe('settings.plugins.tab', sync)
  const offSections = ctx.slots.subscribe('settings.section', sync)
  sync()
  return () => {
    disposed = true; offTabs(); offSections(); restore()
    for (const alias of aliases.values()) alias.dispose()
    aliases.clear()
  }
}
