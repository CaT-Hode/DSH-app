/** Forward DSH's live appearance preference separately from its resolved colors. */
export default function createThemeSyncClient() {
  const EVENT = 'dsh-app:theme-state'
  const sources = new Set(['system', 'light', 'dark'])
  const schemes = new Set(['light', 'dark'])

  /** Read the official presenter; a missing preference is not inferred from colors. */
  const read = view => {
    const root = view.document.documentElement
    const source = root.getAttribute('data-ds-theme-source')
    const scheme = root.style.colorScheme || view.getComputedStyle(root).colorScheme
    return sources.has(source) && schemes.has(scheme) ? { source, scheme } : null
  }

  /** Observe presenter changes without writing appearance preferences or theme tokens.
   * @param view Browser window whose official ThemePresenter owns the document.
   * @param publish Optional transport; defaults to the desktop preload's DOM event.
   * @returns Disposer that removes the observer and suppresses queued notifications.
   */
  const observe = (view, publish = state => view.dispatchEvent(new view.CustomEvent(EVENT, { detail: state }))) => {
    let disposed = false
    let queued = false
    let previous
    const sync = () => {
      queued = false
      if (disposed) return
      const state = read(view)
      if (!state || previous?.source === state.source && previous?.scheme === state.scheme) return
      previous = state
      publish(state)
    }
    const schedule = () => {
      if (queued || disposed) return
      queued = true
      view.queueMicrotask(sync)
    }
    const observer = new view.MutationObserver(schedule)
    observer.observe(view.document.documentElement, { attributes: true, attributeFilter: ['style', 'data-ds-theme-source'] })
    sync()
    return () => { disposed = true; observer.disconnect() }
  }

  /** Bind the observer to the plugin fiber's lifetime. */
  const install = ctx => ctx.effect(() => observe(window), 'dsh-app: desktop appearance state')
  return { EVENT, read, observe, install }
}
