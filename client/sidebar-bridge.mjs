import createOwnedSidebarEngine from '../lib/sidebar/upstream/client-factory.mjs'

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
  return { engine, inject: engine.inject, install: ctx => engine.apply(ctx) }
}
