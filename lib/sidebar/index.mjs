import { apply, Config, inject } from './upstream/index.mjs'

export { Config as SidebarConfig }

/** Mount the integrated file, changes, tasks, viewer and side-chat Host engine.
 * @param ctx DSH App Host context.
 * @param config Validated sidebar limits and preferences from Config.sidebar.
 * @returns The scoped dependency registration, disposed with DSH App.
 */
export function installSidebar(ctx, config = {}) {
  return ctx.inject(inject, scope => apply(scope, config))
}
