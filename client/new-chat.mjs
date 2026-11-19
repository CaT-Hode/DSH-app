/** Own the welcome chrome while the native composer retains drafts and controls. */
export default function createNewChatClient(require) {
  const { createElement: h, useCallback, useSyncExternalStore } = require('react')
  const { FishLogo } = require('@deepseek-ai/dsh-client-ui-primitives')
  const NS = 'dshAppNewChat'
  const prompt = 'Work with DeepSeek Harness'
  const dictionaries = {
    zh: { headline: '我们应该在 {project} 中做些什么？', unknown: '探索未至之境', prompt },
    en: { headline: 'What should we do in {project}?', unknown: 'Into the Unknown', prompt },
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
    ctx.effect(() => {
      const name = 'conversation.composer.bar'
      const t = ctx.locale.bind(NS)
      const decorated = new Map()
      const refresh = () => ctx.slots.register({ name, id: 'dsh-app:composer-prompt-refresh', priority: -999 }, () => null)()
      const restore = entry => {
        const { original, wrapper } = decorated.get(entry)
        if (entry.component === wrapper) entry.component = original
        decorated.delete(entry)
      }
      const sync = () => {
        const entries = ctx.slots.entries(name)
        for (const entry of decorated.keys()) if (!entries.includes(entry)) restore(entry)
        let changed = false
        for (const entry of entries) {
          if (entry.locale !== 'conversation' || decorated.has(entry)) continue
          const original = entry.component
          function Composer(props) {
            const placeholder = props.variant === 'hero' && !props.disabled && !props.blocked && props.placeholder === props.t('placeholder.hero')
              ? t('prompt') : props.placeholder
            return h(original, { ...props, placeholder, t: (key, ...args) => key === 'placeholder.default' ? t('prompt') : props.t(key, ...args) })
          }
          decorated.set(entry, { original, wrapper: Composer })
          entry.component = Composer
          changed = true
        }
        if (changed) refresh()
      }
      const unsubscribe = ctx.slots.subscribe(name, sync)
      sync()
      return () => {
        unsubscribe()
        const changed = decorated.size > 0
        for (const entry of decorated.keys()) restore(entry)
        if (changed) refresh()
      }
    }, 'dsh-app: default composer prompt')
  }
  return { install }
}

export function welcomeProject(workspaces, sessionId) {
  const workspace = workspaces?.items?.find(item => sessionId !== undefined && item.sessionIds.includes(sessionId))
  const title = workspace?.title?.trim()
  return title && title !== 'default-workspace' ? title : undefined
}
