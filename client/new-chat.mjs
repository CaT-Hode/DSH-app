/** Own the welcome chrome while the native composer retains drafts and controls. */
export default function createNewChatClient(require) {
  const { createElement: h, useCallback, useSyncExternalStore } = require('react')
  const { FishLogo } = require('@deepseek-ai/dsh-client-ui-primitives')
  const NS = 'dshAppNewChat'
  const dictionaries = {
    zh: { headline: '我们应该在 {project} 中做些什么？', unknown: '探索未至之境' },
    en: { headline: 'What should we do in {project}?', unknown: 'Into the Unknown' },
  }
  function Welcome({ ctx }) {
    const workspaces = useSyncExternalStore(useCallback(fn => ctx.workspaces.list.subscribe(fn), [ctx]), useCallback(() => ctx.workspaces.list.getSnapshot(), [ctx]))
    const current = useSyncExternalStore(useCallback(fn => ctx.uiSession.adapter.current.subscribe(fn), [ctx]), useCallback(() => ctx.uiSession.adapter.current.getSnapshot(), [ctx]))
    const project = welcomeProject(workspaces, current?.key)
    const t = ctx.locale.bind(NS)
    return h('span', { className: 'dsh-app-new-chat-heading', 'data-dsh-app-new-chat-heading': '' },
      h(FishLogo, { size: 56 }),
      h('span', { role: 'heading', 'aria-level': 1 }, project ? t('headline', { project }) : t('unknown')))
  }
  function install(ctx) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: new chat dictionaries')
    ctx.effect(() => ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
      name: 'conversation.hero.brand.mark', priority: -100, registrant: 'dsh-app', inject: () => ({ ctx }),
    }, Welcome)), 'dsh-app: Codex new chat welcome')
  }
  return { install }
}

export function welcomeProject(workspaces, sessionId) {
  const workspace = workspaces?.items?.find(item => sessionId !== undefined && item.sessionIds.includes(sessionId))
  const title = workspace?.title?.trim()
  return title && title !== 'default-workspace' ? title : undefined
}
