import createOwnedSidebarEngine from '../lib/sidebar/upstream/client-factory.mjs'

/** Keep inherited shell themes from replacing DSH App's own presentation.
 * Title-bar sizing is managed by the engine independently of these style tags.
 * Disable only predecessor preset/custom CSS for the app UI's lifetime, and
 * restore the exact previous media attribute when the UI or plugin unmounts.
 */
export function installSidebarPresentation(ctx) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  ctx.effect(() => {
    const inherited = new Map()
    const selector = 'style[data-dsh-preset-css], style[data-dsh-custom-css]'
    const restore = () => {
      for (const [tag, previous] of inherited) {
        if (previous === null) tag.removeAttribute('media')
        else tag.setAttribute('media', previous)
      }
      inherited.clear()
    }
    const sync = () => {
      if (!document.documentElement.hasAttribute('data-dsh-app-ui')) { restore(); return }
      for (const tag of document.head.querySelectorAll(selector)) {
        if (!inherited.has(tag)) inherited.set(tag, tag.getAttribute('media'))
        tag.setAttribute('media', 'not all')
      }
      for (const [tag, previous] of inherited) if (!tag.isConnected) {
        if (previous === null) tag.removeAttribute('media')
        else tag.setAttribute('media', previous)
        inherited.delete(tag)
      }
    }
    const headObserver = new MutationObserver(sync)
    headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-preset-css', 'data-dsh-custom-css'] })
    const uiObserver = new MutationObserver(sync)
    uiObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dsh-app-ui'] })
    sync()
    return () => { headObserver.disconnect(); uiObserver.disconnect(); restore() }
  }, 'dsh-app: owned workbench presentation')
}

/** Register the predecessor's public browser module names without another plugin mount.
 * @param target Official client module registration facade.
 * @returns Nothing; aliases delegate to the current DSH App materialization.
 */
export function registerSidebarAliases(target) {
  const marker = '__dshAppSidebarAliases__'
  if (target[marker]) return
  const names = ['dsh-better-sidebar', 'dsh-better-sidebar/client/service', 'dsh-better-sidebar/client/api', 'dsh-external/dsh-better-sidebar']
  for (const id of names) target.load({ id, factory: require => {
    const resolve = () => {
      const engine = require('dsh-app').sidebarEngine
      if (engine === undefined) throw new Error('DSH App sidebar module is not available')
      return engine
    }
    return new Proxy({}, {
      get: (_target, key) => Reflect.get(resolve(), key),
      has: (_target, key) => Reflect.has(resolve(), key),
      ownKeys: () => Reflect.ownKeys(resolve()),
      getOwnPropertyDescriptor: (_target, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), key)
        return descriptor && { ...descriptor, configurable: true }
      },
    })
  } })
  target[marker] = true
}

/** Build one integrated engine; its public service remains ctx.betterSidebar.
 * @param require DSH's synchronous module table resolver.
 * @returns Engine exports, required services and activation returning internal General settings resources.
 */
export default function createSidebarBridge(require) {
  const engine = createOwnedSidebarEngine(require)
  return { engine, inject: engine.inject, install: ctx => {
    installSidebarPresentation(ctx)
    return engine.apply(ctx)
  } }
}
