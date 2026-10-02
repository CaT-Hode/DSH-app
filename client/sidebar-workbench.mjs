/** DSH App owns workbench visibility, its content menu and the Web-profile browser fallback. */
export default function createSidebarWorkbenchClient(require) {
  const React = require('react')
  const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = React
  const NS = 'dshAppWorkbench'
  const dictionaries = {
    zh: { workbench: '工作台', newTab: '新标签页', tools: '工具', sidechat: '侧边聊天', browser: '网页预览', browserDesc: '预览网页或本地开发服务', url: '输入网址或 localhost 地址', go: '打开', reload: '重新加载', external: '在浏览器中打开', embed: '部分网站限制嵌入，可在浏览器中打开。', empty: '打开网页或本地预览', error: '请输入有效的 HTTP 或 HTTPS 地址。', hide: '收起侧栏', show: '展开侧栏' },
    en: { workbench: 'Workbench', newTab: 'New tab', tools: 'Tools', sidechat: 'Side chat', browser: 'Web preview', browserDesc: 'Preview a website or local development server', url: 'Enter a URL or localhost address', go: 'Open', reload: 'Reload', external: 'Open in browser', embed: 'Some websites restrict embedding. Open them in your browser.', empty: 'Open a website or local preview', error: 'Enter a valid HTTP or HTTPS address.', hide: 'Hide sidebar', show: 'Show sidebar' },
  }
  function normalizeUrl(value) {
    let text = String(value ?? '').trim()
    if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(text)) text = `http://${text}`
    let url
    try { url = new URL(text) } catch { throw new Error('Invalid HTTP or HTTPS address') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid HTTP or HTTPS address')
    return url.href
  }
  function BrowserPreview({ ctx, store, scope, tab, visible }) {
    const t = ctx.locale.bind(NS)
    const metaUrl = tab.meta?.url ?? tab.path ?? ''
    const [address, setAddress] = useState(metaUrl)
    const [url, setUrl] = useState(() => { try { return metaUrl ? normalizeUrl(metaUrl) : '' } catch { return '' } })
    const [revision, setRevision] = useState(0)
    const [error, setError] = useState(false)
    useEffect(() => { setAddress(metaUrl); try { setUrl(metaUrl ? normalizeUrl(metaUrl) : ''); setError(false) } catch { setError(true) } }, [metaUrl])
    const navigate = event => {
      event.preventDefault()
      try {
        const next = normalizeUrl(address)
        setUrl(next); setAddress(next); setError(false)
        ctx.get('betterSidebar').updateTab(tab.id, { meta: { ...tab.meta, url: next }, title: new URL(next).host }, scope)
      } catch { setError(true) }
    }
    return h('section', { className: 'dsh-app-web-preview', 'data-dsh-app-web-preview': '', 'aria-label': t('browser') },
      h('form', { className: 'dsh-app-web-toolbar', onSubmit: navigate },
        h('input', { type: 'text', value: address, placeholder: t('url'), 'aria-label': t('url'), 'aria-invalid': error || undefined, onChange: event => setAddress(event.target.value), spellCheck: false }),
        h('button', { type: 'submit' }, t('go')),
        h('button', { type: 'button', title: t('reload'), 'aria-label': t('reload'), disabled: !url, onClick: () => setRevision(value => value + 1) }, '↻'),
        url && h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', title: t('external'), 'aria-label': t('external') }, '↗')),
      error && h('p', { className: 'dsh-app-web-error', role: 'alert' }, t('error')),
      url ? h('iframe', { key: `${url}:${revision}`, src: url, title: t('browser'), sandbox: 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads', referrerPolicy: 'no-referrer' })
        : h('div', { className: 'dsh-app-web-empty' }, h('strong', {}, t('empty')), h('span', {}, t('browserDesc'))),
      url && h('footer', {}, t('embed')))
  }
  function WorkbenchMenu({ ctx, resources, compact = false }) {
    const t = ctx.locale.bind(NS)
    const [open, setOpen] = useState(false)
    const [error, setError] = useState('')
    const root = useRef(null)
    useSyncExternalStore(resources.service.subscribeState, resources.service.getSnapshot)
    const registry = ctx.get('sidebarRightTabs')
    const readTabs = () => {
      const owned = resources.service.getTabs().filter(tab => !tab.hidden && resources.service.isTabEnabled(tab.id)).map(tab => ({ ...tab, owned: true }))
      const extras = (registry?.guide?.() ?? []).filter(tab => !owned.some(own => own.id === tab.kind || own.id === 'editor' && tab.kind === 'files')).map(tab => ({ id: tab.kind, title: tab.title, icon: tab.icon ? size => h(tab.icon, { size }) : undefined, owned: false }))
      return [...owned, ...extras]
    }
    const [tabs, setTabs] = useState(readTabs)
    useEffect(() => { const refresh = () => setTabs(readTabs()); refresh(); const off = resources.service.subscribe(refresh), offNative = registry?.subscribe(refresh); return () => { off(); offNative?.() } }, [resources, registry])
    useEffect(() => {
      if (!open) return
      const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
      const escape = event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus() } }
      document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape)
      return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
    }, [open])
    const launch = tab => {
      try { if (tab.owned) resources.service.openTab({ type: tab.id }); else ctx.get('sidebarRight').openTab(tab.id); setOpen(false); setError('') }
      catch (error) { setError(error.message) }
    }
    if (compact) return h('button', { type: 'button', className: 'dsh-app-workbench-trigger', 'aria-label': t('newTab'), title: t('newTab'), onClick: () => resources.service.openTab({ type: 'launcher' }) }, '+')
    return h('div', { ref: root, className: 'dsh-app-workbench-menu', 'data-dsh-app-workbench-menu': '' },
      h('button', { type: 'button', className: 'dsh-app-workbench-trigger', 'aria-label': t('workbench'), title: t('workbench'), 'aria-expanded': open, 'aria-haspopup': 'dialog', onClick: () => setOpen(value => !value) },
        compact ? '+' : h('svg', { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 5, cy: 7, r: 2.3 }), h('circle', { cx: 5, cy: 17, r: 2.3 }), h('path', { d: 'M12 7h9M12 17h9' }))),
      open && h('div', { className: 'dsh-app-workbench-popover', role: 'dialog', 'aria-label': t('workbench') },
        tabs.map(tab => h('button', { key: tab.id, type: 'button', className: 'dsh-app-workbench-entry', onClick: () => launch(tab) },
          h('span', { 'aria-hidden': true }, typeof tab.icon === 'function' ? tab.icon(16) : tab.icon), typeof tab.title === 'function' ? tab.title() : tab.title)),
        h('button', { type: 'button', className: 'dsh-app-workbench-entry', onClick: () => { const column = ctx.get('sidebarRight'); if (column?.isExpanded()) column.toggleExpanded(); setOpen(false) } }, t('hide')),
        error && h('p', { role: 'alert' }, error)))
  }
  function ToolsPage({ ctx, resources, scope, visible }) {
    const t = ctx.locale.bind(NS)
    const [error, setError] = useState('')
    const registry = ctx.get('sidebarRightTabs')
    const [, refresh] = useState(0)
    useSyncExternalStore(resources.service.subscribeState, resources.service.getSnapshot)
    useEffect(() => { const off = resources.service.subscribe(() => refresh(value => value + 1)), offNative = registry?.subscribe(() => refresh(value => value + 1)); return () => { off(); offNative?.() } }, [resources, registry])
    const owned = resources.service.getTabs().filter(tab => !tab.hidden && resources.service.isTabEnabled(tab.id)).map(tab => ({ ...tab, owned: true }))
    const extras = (registry?.guide?.() ?? []).filter(tab => !owned.some(own => own.id === tab.kind || own.id === 'editor' && tab.kind === 'files')).map(tab => ({ id: tab.kind, title: tab.title, icon: tab.icon ? size => h(tab.icon, { size }) : undefined }))
    const entries = [...owned, ...extras].sort((a, b) => (['git', 'changes', 'terminal', 'editor', 'files', 'sidechat', 'browser', 'subagent', 'jobs'].indexOf(a.id) + 1 || 100) - (['git', 'changes', 'terminal', 'editor', 'files', 'sidechat', 'browser', 'subagent', 'jobs'].indexOf(b.id) + 1 || 100))
    const open = entry => {
      try { if (entry.owned) resources.service.openTab({ type: entry.id }, scope); else ctx.get('sidebarRight').openTab(entry.id); setError('') }
      catch (reason) { setError(reason.message) }
    }
    return h('section', { className: 'dsh-app-tools-page', 'data-dsh-app-tools-page': '', 'aria-label': t('tools') },
      h('h2', {}, t('tools')),
      h('div', { className: 'dsh-app-tools-grid' }, entries.map(entry => h('button', { key: entry.id, type: 'button', 'data-dsh-app-tool': entry.id, onClick: () => open(entry) },
        h(ToolGlyph, { kind: entry.id }),
        h('span', {}, entry.id === 'sidechat' ? t('sidechat') : typeof entry.title === 'function' ? entry.title() : entry.title),
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'm9 6 6 6-6 6' }))))),
      error && h('p', { role: 'alert' }, error),
      resources.Information && h(resources.Information, { sessionId: scope?.sessionId, visible }))
  }
  function ToolGlyph({ kind }) {
    const path = ({ editor: 'M3 7h7l2-3h9v16H3z', files: 'M3 7h7l2-3h9v16H3z', terminal: 'm7 8 4 4-4 4m6 0h4M3 3h18v18H3z', sidechat: 'M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 1 1 18-4ZM8 11h8m-4-4v8', browser: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c-5 5-5 15 0 20 5-5 5-15 0-20ZM2 12h20', git: 'M6 3v13a4 4 0 0 0 8 0V8m-2-2 2 2 2-2M4 3h4m4 13h4', changes: 'M6 3v13a4 4 0 0 0 8 0V8m-2-2 2 2 2-2', subagent: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5' })[kind] ?? 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z'
    return h('svg', { className: 'dsh-app-tool-icon', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: path }))
  }
  function VisibilityToggle({ ctx, sessionId, useStore }) {
    const t = ctx.locale.bind(NS)
    // This is the native session store's selector hook, shared with its panel
    // and expand seat. External commands and session changes have one truth.
    const expanded = useStore(state => state.bySession[sessionId]?.layout.expanded ?? false)
    const label = t(expanded ? 'hide' : 'show')
    return h('button', { type: 'button', className: 'dsh-app-workbench-visibility', 'data-dsh-app-workbench-visibility': '',
      title: label, 'aria-label': label, 'aria-pressed': expanded, onClick: () => ctx.get('sidebarRight').toggleExpanded() },
      h('svg', { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
        h('circle', { cx: 5, cy: 7, r: 2.3 }), h('circle', { cx: 5, cy: 17, r: 2.3 }), h('path', { d: 'M12 7h9M12 17h9' })))
  }
  function install(ctx, resources) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: workbench navigation dictionaries')
    ctx.effect(() => resources.service.registerTab({ id: 'launcher', hidden: true, title: () => ctx.locale.bind(NS)('newTab'), order: 0,
      createTab: () => ({ tab: { id: `launcher:${crypto.randomUUID()}`, type: 'launcher', title: ctx.locale.bind(NS)('newTab') } }),
      component: props => h(ToolsPage, { ...props, ctx, resources }),
    }), 'dsh-app: workbench new tab tools')
    ctx.inject(['sidebarRightTabs'], scope => {
      // A native browser keeps its implementation; the Web profile receives this fallback.
      if (!scope.get('sidebarRightTabs').get('browser')) scope.effect(() => resources.service.registerTab({
        id: 'browser', title: () => ctx.locale.bind(NS)('browser'), description: () => ctx.locale.bind(NS)('browserDesc'), order: 50,
        createTab: () => ({ tab: { id: `browser:${crypto.randomUUID()}`, type: 'browser', title: ctx.locale.bind(NS)('browser') } }),
        component: BrowserPreview,
      }), 'dsh-app: Web browser preview')
    })
    ctx.inject(['sidebarRight', 'sidebarRightTabs'], scope => scope.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => {
      const corner = 'conversation.session.header.corner', panel = 'rightbar.session'
      let handle, disposeToggle
      const sync = () => {
        // Slots publicly exposes each registration's shared store handle. Both
        // native seats use the same session-scoped handle; reuse that exact seat
        // rather than creating another store or treating tab inventory as state.
        const panels = ctx.slots.entries(panel)
        const native = ctx.slots.entries(corner).find(entry => entry.store && panels.some(seat => seat.store === entry.store))?.store
        if (native === handle) return
        disposeToggle?.(); disposeToggle = undefined; handle = native
        if (handle) disposeToggle = ctx.slots.register({
          name: 'conversation.session.header.utilities', id: 'dsh-app:workbench-visibility', order: 9, registrant: 'dsh-app',
          store: handle, inject: () => ({ ctx: scope }),
        }, VisibilityToggle)
      }
      const offCorner = ctx.slots.subscribe(corner, sync), offPanel = ctx.slots.subscribe(panel, sync)
      sync()
      return () => { offCorner(); offPanel(); disposeToggle?.() }
    }), 'dsh-app: workbench visibility toggle'))
    const NewWorkbenchTab = ({ resources }) => {
      const t = ctx.locale.bind(NS)
      useSyncExternalStore(resources.service.subscribeState, resources.service.getSnapshot)
      return h('button', { type: 'button', className: 'dsh-app-workbench-new', title: t('newTab'), 'aria-label': t('newTab'), onClick: () => resources.service.openTab({ type: 'launcher' }) },
        h('svg', { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true }, h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }), h('path', { d: 'M12 7v10M7 12h10' })))
    }
    ctx.inject(['sidebarRight', 'sidebarRightTabs'], scope => scope.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
      name: 'conversation.session.header.utilities', id: 'dsh-app:workbench-new', order: 10, registrant: 'dsh-app', inject: () => ({ resources }),
    }, NewWorkbenchTab)), 'dsh-app: new workbench tab shortcut'))
  }
  return { install, normalizeUrl, BrowserPreview, WorkbenchMenu, VisibilityToggle, ToolsPage }
}
