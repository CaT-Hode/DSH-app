/** Extend the Session menu with its native view ledger and selection action. */
export default function createConversationMenuClient(require) {
  const { createElement: h, createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } = require('react')
  const { Menu, Modal, Button, IconEllipsisOutlineRegular, IconDownloadOutlineRegular, IconPaperPlaneOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
  const Views = createContext(null)
  let activeViews = null
  const publishViews = value => {
    activeViews = value
    if (typeof window !== 'undefined') window.dispatchEvent(new window.CustomEvent('dsh-app:conversation-view-state', { detail: {
      sessionId: value?.sessionId, views: value?.tabs.map(({ id, label }) => ({ id, label })) ?? [], active: value?.active,
    } }))
  }
  function MenuAction(props) {
    const { sessionId, useSessionLogDownload, useFeedbackAvailable, request, openFeedback, dismiss, t } = props
    const views = useContext(Views)
    const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])
    const feedback = useFeedbackAvailable(value => value)
    const [open, setOpen] = useState(false)
    useEffect(() => setOpen(false), [sessionId])
    const busy = entry?.status === 'downloading'
    const desktop = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-dsh-desktop-chrome')
    const items = (desktop ? [] : views?.tabs ?? []).map(view => ({
      id: `view:${view.id}`,
      label: h('span', { className: 'dsh-app-view-menu-label' }, h('span', {}, view.label),
        view.id === views.active && h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('path', { d: 'm5 12 4 4L19 6' }))),
    }))
    if (items.length) items.push({ type: 'separator', id: 'views-end' })
    items.push({ id: 'download', label: t('menu.download'), icon: h(IconDownloadOutlineRegular), disabled: busy })
    if (feedback) items.push({ id: 'feedback', label: t('menu.feedback'), icon: h(IconPaperPlaneOutlineRegular) })
    return h('div', { className: 'dsh-app-conversation-menu', 'data-dsh-app-conversation-menu': '' },
      h(Menu, { open, align: 'end', dense: true, items, onClose: () => setOpen(false),
        onSelect: id => {
          setOpen(false)
          if (id.startsWith('view:')) views?.selectView(id.slice(5))
          else if (id === 'feedback') openFeedback(sessionId)
          else if (id === 'download') request(sessionId)
        },
        anchor: h(Button, { size: 'sm', className: 'dsh-app-conversation-more', title: t('header.more'), 'aria-label': t('header.more'), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-busy': busy, onClick: () => setOpen(value => !value) }, h(IconEllipsisOutlineRegular)) }),
      // The original download controller remains authoritative, including its
      // /export command, busy/error state and Session-scoped dismissal.
      h(Modal, { open: entry?.open === true, onClose: () => dismiss(sessionId),
        title: t(entry?.status === 'downloading' ? 'dialog.preparingTitle' : entry?.status === 'success' ? 'dialog.successTitle' : 'dialog.errorTitle'),
        description: entry?.status === 'downloading' ? t('dialog.preparingDescription') : entry?.status === 'success' ? t('dialog.successDescription') : entry?.error || t('dialog.commandFailed'),
        closeLabel: t('dialog.close'), footer: h(Button, { variant: 'primary', onClick: () => dismiss(sessionId) }, t('dialog.close')) }))
  }
  function install(ctx) {
    ctx.effect(() => {
      if (typeof window === 'undefined') return () => {}
      const select = event => {
        const id = event.detail?.view
        if (activeViews && (ctx.uiSession?.adapter.current.getSnapshot()?.key ?? activeViews.sessionId) === activeViews.sessionId && activeViews.tabs.some(view => view.id === id)) activeViews.selectView(id)
      }
      const open = event => {
        const id = event.detail?.sessionId
        if (typeof id === 'string' && ctx.sessions?.list.getSnapshot().byId[id]) ctx.uiWorkspace.openSession(id)
      }
      window.addEventListener('dsh-app:conversation-view-select', select)
      window.addEventListener('dsh-app:conversation-session-open', open)
      return () => { window.removeEventListener('dsh-app:conversation-view-select', select); window.removeEventListener('dsh-app:conversation-session-open', open); publishViews(null) }
    }, 'dsh-app: desktop Session view actions')
    ctx.effect(() => {
      const slots = ['conversation.session.header', 'conversation.session.header.utilities']
      const decorated = new Map()
      let disposed = false, publishing = false
      const publish = name => {
        publishing = true
        try { ctx.slots.register({ name, id: 'dsh-app:view-menu-refresh', priority: -999 }, () => null)() }
        finally { publishing = false }
      }
      const restore = entry => {
        const record = decorated.get(entry)
        if (entry.component === record.wrapper) entry.component = record.original
        decorated.delete(entry)
      }
      const sync = name => {
        if (disposed || publishing) return
        const entries = ctx.slots.entries(name)
        for (const [entry, record] of decorated) if (record.name === name && !entries.includes(entry)) restore(entry)
        let changed = false
        for (const entry of entries) {
          if (decorated.has(entry) || entry.options.id === 'dsh-app:view-menu-refresh') continue
          if (name === slots[1] && entry.options.id !== 'session-log-download') continue
          const original = entry.component
          function Header(props) {
            const tabs = props.useConversationViews(value => value)
            const selected = props.useStore(state => state.view)
            const active = tabs.find(view => view.id === selected)?.id ?? tabs.find(view => view.id === 'chat')?.id
            const value = useMemo(() => ({ tabs, active, selectView: props.selectView }), [tabs, active, props.selectView])
            const current = useSyncExternalStore(fn => ctx.uiSession?.adapter.current.subscribe(fn) ?? (() => {}), () => ctx.uiSession?.adapter.current.getSnapshot()?.key ?? props.sessionId)
            useEffect(() => {
              if (current !== props.sessionId) return
              const ledger = { ...value, sessionId: props.sessionId, tabs: props.hideChrome ? [] : tabs }
              publishViews(ledger)
              return () => { if (activeViews === ledger) publishViews(null) }
            }, [value, current, props.sessionId, props.hideChrome])
            return h(Views.Provider, { value }, h(original, props))
          }
          function HeaderBoundary(props) {
            return props.useConversationViews && props.useStore && props.selectView ? h(Header, props) : h(original, props)
          }
          const wrapper = name === slots[0] ? HeaderBoundary : MenuAction
          entry.component = wrapper
          decorated.set(entry, { original, wrapper, name }); changed = true
        }
        if (changed) publish(name)
      }
      const offs = slots.map(name => ctx.slots.subscribe(name, () => sync(name)))
      for (const name of slots) sync(name)
      return () => {
        disposed = true; for (const off of offs) off()
        for (const entry of [...decorated.keys()]) restore(entry)
        for (const name of slots) if (ctx.slots.entries(name).length) publish(name)
      }
    }, 'dsh-app: native view choices in Session more menu')
  }
  return { install }
}
