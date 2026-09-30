import createContextInsightClient from './context-insight.mjs'
import createPluginPagesClient from './plugin-pages.mjs'
import createMcpClient from './mcp.mjs'
import createThemeSyncClient from './theme-sync.mjs'
import createSidebarBridge from './sidebar-bridge.mjs'
import createSidebarSettingsClient from './sidebar-settings.mjs'

/** Build the browser half against DSH's shared module table, without bundling React. */
export default function createDshAppClient(require, css) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const { createElement: h, Children, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } = React
  const NS = 'dshApp'
  const contextInsight = createContextInsightClient(require)
  const pluginPages = createPluginPagesClient(require)
  const mcpClient = createMcpClient(require)
  const sidebarBridge = createSidebarBridge(require)
  const sidebarSettings = createSidebarSettingsClient(require)
  const dictionaries = {
    zh: {
      brand: 'DeepSeek Harness', home: '聊天', recent: '最近对话', new: '新聊天',
      search: '搜索会话', searchPlaceholder: '搜索标题与对话内容…', searchEmpty: '没有匹配的会话',
      searchPending: '正在搜索…', searchMore: '还有更多结果，请缩小搜索范围',
      more: '更多功能', sidebar: '切换侧边栏', settings: '设置', close: '关闭', mcp: 'MCP 连接器',
      cost: '费用与用量', costLoading: '正在读取统计…', costUnavailable: '统计暂不可用',
      unpriced: '未计价', unpricedCalls: '{count} 次调用未计价', unpricedBudget: '未计价费用未扣除',
      monthCost: '本月费用', tokens: 'Token', budgetRemaining: '预算剩余', budgetExceeded: '超出预算',
      balance: 'DeepSeek API 余额', balanceLoading: '正在查询余额…', balanceUnconfigured: '未配置官方 API 密钥',
      balanceUnavailable: '余额暂不可用', balanceUnauthorized: '密钥无效或无权查询', balanceRateLimited: '查询频率受限',
      balanceEndpoint: '需使用 DeepSeek 官方接口', balanceStale: '上次查询结果', balanceLow: '余额不可用', context: '上下文',
      balanceCredentialConflict: '需配置独立官方 API 密钥',
      balanceConfiguration: '官方提供商配置暂不可读', balanceTls: '官方接口证书验证失败', balanceDns: '无法解析官方接口域名', balanceConnection: '无法连接官方接口',
      backToChat: '返回聊天', features: '已安装功能', noFeatures: '尚无额外功能',
      searchError: '暂时无法搜索对话内容，请稍后重试。标题和项目路径搜索仍可使用。',
      searchDisabled: '全文搜索暂未启用，当前仅搜索会话标题和项目路径。',
    },
    en: {
      brand: 'DeepSeek Harness', home: 'Chat', recent: 'Recent chats', new: 'New chat',
      search: 'Search sessions', searchPlaceholder: 'Search titles and conversation content…', searchEmpty: 'No matching sessions',
      searchPending: 'Searching…', searchMore: 'More results are available; narrow your search',
      more: 'More features', sidebar: 'Toggle sidebar', settings: 'Settings', close: 'Close', mcp: 'MCP connectors',
      cost: 'Cost and usage', costLoading: 'Loading usage…', costUnavailable: 'Usage unavailable',
      unpriced: 'Unpriced', unpricedCalls: '{count} unpriced calls', unpricedBudget: 'Unpriced costs are not deducted',
      monthCost: 'This month', tokens: 'Tokens', budgetRemaining: 'Budget remaining', budgetExceeded: 'Over budget',
      balance: 'DeepSeek API balance', balanceLoading: 'Checking balance…', balanceUnconfigured: 'Official API key not configured',
      balanceUnavailable: 'Balance unavailable', balanceUnauthorized: 'Key invalid or unauthorized', balanceRateLimited: 'Too many balance requests',
      balanceEndpoint: 'Requires the official DeepSeek endpoint', balanceStale: 'Last query result', balanceLow: 'Balance unavailable for use', context: 'Context',
      balanceCredentialConflict: 'Configure a separate official API key',
      balanceConfiguration: 'Official provider configuration is unavailable', balanceTls: 'Official endpoint certificate validation failed', balanceDns: 'Could not resolve the official endpoint', balanceConnection: 'Could not connect to the official endpoint',
      backToChat: 'Back to chat', features: 'Installed features', noFeatures: 'No additional features',
      searchError: 'Conversation content could not be searched. Try again later; title and project path search remains available.',
      searchDisabled: 'Full-text search is not enabled. Showing matches from session titles and project paths.',
    },
  }
  const paths = {
    home: ['M3 10.5 12 3l9 7.5', 'M5 9v12h5v-7h4v7h5V9'],
    recent: ['M12 8v5l3 2', 'M3 8a10 10 0 1 1-.2 7', 'M3 3v5h5'],
    search: ['M21 21l-5-5', 'circle:10.5,10.5,6.5'],
    new: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'm15 5 4 4', 'm13 11 7-7-3-3-7 7-1 5 4-2'],
    sidebar: ['M8 3v18', 'M3 3h18v18H3z'],
    more: ['circle:5,12,1', 'circle:12,12,1', 'circle:19,12,1'],
    cost: ['M4 5h16v16H4z', 'M8 2v6m8-6v6', 'M8 12h8m-8 4h5'],
    close: ['m6 6 12 12', 'M6 18 18 6'],
    back: ['m14 5-7 7 7 7', 'M7 12h14'],
    puzzle: ['M8 3h3a2 2 0 1 1 4 0h4v5a2 2 0 1 1 0 4v7h-5a2 2 0 1 0-4 0H3v-5a2 2 0 1 0 0-4V3h5'],
    settings: ['M9.5 3h5l.7 2.4 2.1 1.2 2.5-.6 2.5 4.3-1.8 1.8v2.4l1.8 1.8-2.5 4.3-2.5-.6-2.1 1.2-.7 2.4h-5l-.7-2.4-2.1-1.2-2.5.6L1.7 16.3l1.8-1.8v-2.4L1.7 10.3 4.2 6l2.5.6 2.1-1.2Z', 'circle:12,13.3,3'],
  }
  function Icon({ name, size = 20 }) {
    return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      (paths[name] ?? paths.more).map((path, index) => path.startsWith('circle:')
        ? h('circle', { key: index, cx: path.slice(7).split(',')[0], cy: path.slice(7).split(',')[1], r: path.slice(7).split(',')[2] })
        : h('path', { key: index, d: path })))
  }
  function Button({ label, icon, onClick, active, className = '', children, ...props }) {
    return h('button', { type: 'button', title: label, 'aria-label': label, onClick, className: `dsh-app-button ${active ? 'is-active' : ''} ${className}`, ...props },
      icon ? h(Icon, { name: icon }) : null, children)
  }
  let inlineSnapshot = { settings: null }
  const inlineListeners = new Set()
  const inlineActions = new Map()
  const inlineWanted = new Set()
  const inlineSource = { getSnapshot: () => inlineSnapshot, subscribe: listener => { inlineListeners.add(listener); return () => inlineListeners.delete(listener) } }
  function setInlineTarget(name, node) {
    if (inlineSnapshot[name] === node) return
    inlineSnapshot = { ...inlineSnapshot, [name]: node }
    for (const listener of inlineListeners) listener()
  }
  /** Mount the original owner's section tree inside the selected main pane. */
  function InlinePanelHost({ name, t, selectPanel }) {
    const targetRef = useMemo(() => node => setInlineTarget(name, node), [name])
    useEffect(() => {
      inlineWanted.add(name)
      inlineActions.get(name)?.open()
      return () => { inlineWanted.delete(name); inlineActions.get(name)?.close() }
    }, [name])
    return h('section', { className: `dsh-app-inline-panel dsh-app-inline-${name}`, 'aria-label': t(name === 'mcp' ? 'mcp' : 'settings') },
      h('header', { className: 'dsh-app-inline-header' }, h(Button, { label: t('backToChat'), icon: 'back', onClick: () => selectPanel(null) }), h('strong', {}, t(name === 'mcp' ? 'mcp' : 'settings'))),
      h('div', { ref: targetRef, className: 'dsh-app-inline-target' }))
  }
  function InlineSettings({ rows, renderSlot, activeId, onSelect, onClose }) {
    rows = rows.filter(row => !/^(skills?|skill-center)$/i.test(row.id))
    const active = rows.find(row => row.id === activeId)?.id ?? rows[0]?.id
    return h('div', { className: 'dsh-app-settings-page' },
      h('nav', { className: 'dsh-app-settings-nav' },
        rows.map(row => h('button', { key: row.id, type: 'button', 'aria-current': row.id === active ? 'page' : undefined, onClick: () => onSelect(row.id) }, row.label))),
      h('div', { className: 'dsh-app-settings-body' }, h('div', { className: 'dsh-app-settings-actions' }, renderSlot('settings.action', {})),
        h('div', { className: 'dsh-app-settings-options' }, active !== undefined ? renderSlot('settings.section', { close: onClose }, { only: active }) : null)))
  }
  const embeddedTypography = `body{font-family:var(--dsh-app-font);font-size:var(--dsh-app-ui-font-size,14px);line-height:1.55}body :where(button,input,select,textarea){font-family:inherit}:where(code,pre,kbd,samp){font-family:var(--dsh-app-code-font)}`
  /** Keep the official settings controller and authorized slots inside the main pane. */
  function installInlinePanels(ctx) {
    let owner
    let restore
    let publishing = false
    const publish = entry => {
      if (!ctx.slots.entries('sidebar.settings').includes(entry)) return
      const priority = Math.max(...ctx.slots.entries('sidebar.settings').map(value => value.options.priority ?? 0)) + 1
      publishing = true
      try { ctx.slots.register({ name: 'sidebar.settings', id: entry.options.id, priority }, () => null)() }
      finally { publishing = false }
    }
    const closePanel = () => {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === 'dsh-app-settings') ctx.layout.selectPanel(null)
    }
    const sync = () => {
      if (publishing) return
      const entry = ctx.slots.entriesOfSlot('sidebar.settings')[0]
      if (entry === owner) return
      restore?.(); restore = undefined; owner = entry
      if (!entry) return
      const original = entry.component
      function InlineSettingsOwner(props) {
        const snapshot = useSyncExternalStore(inlineSource.subscribe, inlineSource.getSnapshot, inlineSource.getSnapshot)
        const open = props.useStore(state => state.open)
        const wasOpen = useRef(open)
        const actions = useMemo(() => ({ ...props.actions, close: () => { props.actions.close(); closePanel() } }), [props.actions])
        useEffect(() => {
          inlineActions.set('settings', props.actions)
          if (inlineWanted.has('settings')) props.actions.open()
          return () => { if (inlineActions.get('settings') === props.actions) inlineActions.delete('settings') }
        }, [props.actions])
        useEffect(() => {
          if (open) ctx.layout.selectPanel('dsh-app-settings')
          else if (wasOpen.current) closePanel()
          wasOpen.current = open
        }, [open])
        const rendered = original({ ...props, actions })
        const children = Children.toArray(rendered?.props?.children)
        const panel = children.find(child => typeof child?.props?.renderSlot === 'function' && Array.isArray(child.props.rows) && typeof child.props.onSelect === 'function')
        const remainder = children.filter(child => child !== panel)
        return h(React.Fragment, {}, h('div', { hidden: true, 'data-dsh-app-settings-owner': '' }, remainder[0]), ...remainder.slice(1),
          panel && snapshot.settings ? createPortal(h(InlineSettings, panel.props), snapshot.settings) : null)
      }
      entry.component = InlineSettingsOwner
      restore = () => { if (entry.component === InlineSettingsOwner) { entry.component = original; publish(entry) } }
      publish(entry)
    }
    const stop = ctx.slots.subscribe('sidebar.settings', sync)
    sync()
    return () => { stop(); restore?.(); inlineActions.clear(); inlineWanted.clear() }
  }
  function money(amount, currency) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: amount < 0.01 && amount > 0 ? 4 : 2 }).format(amount)
  }
  function searchIsDisabled(error) {
    if (error.code === 'SESSION_QUERY_SEARCH_DISABLED' || error.details?.code === 'SESSION_QUERY_SEARCH_DISABLED') return true
    // DSH 0.2.0-rc.2 wraps SessionQueryError without preserving its code.
    return error.code === 'gateway/internal' && /session search is disabled:.*openAt ["']never["']/i.test(error.message)
  }
  /** A request is cancelled when superseded or when its rendering owner leaves. */
  function useCostSummary() {
    const [state, setState] = useState({ phase: 'loading' })
    useEffect(() => {
      let request
      let disposed = false
      const refresh = async () => {
        if (document.visibilityState === 'hidden') return
        request?.abort()
        request = new AbortController()
        const current = request
        try {
          const response = await fetch('/dsh-app/cost.json', { signal: current.signal, cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const value = await response.json()
          if (!value || !value.config || !['USD', 'CNY'].includes(value.config.currency)) throw new Error('Invalid cost summary currency')
          for (const period of [value.month, value.today]) {
            if (!period || ['apiCost', 'calls', 'input', 'cacheRead', 'cacheWrite', 'output', 'unpricedCalls'].some(key => typeof period[key] !== 'number' || !Number.isFinite(period[key]) || period[key] < 0)) throw new Error('Invalid cost summary counters')
          }
          if (value.config.currency === 'CNY' && !(Number.isFinite(value.config.exchangeRate) && value.config.exchangeRate > 0)) throw new Error('Invalid cost summary exchange rate')
          if (!disposed && !current.signal.aborted) setState({ phase: 'ready', value })
        } catch (error) {
          if (!disposed && !current.signal.aborted) setState({ phase: 'error', error: String(error) })
        }
      }
      void refresh()
      const acceptCostChange = event => {
        const frame = document.querySelector('.dsh-app-cost-frame')
        if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.type === 'dsh-app:cost-changed') void refresh()
      }
      const timer = setInterval(refresh, 60_000)
      window.addEventListener('focus', refresh)
      document.addEventListener('visibilitychange', refresh)
      window.addEventListener('message', acceptCostChange)
      return () => {
        disposed = true
        request?.abort()
        clearInterval(timer)
        window.removeEventListener('focus', refresh)
        document.removeEventListener('visibilitychange', refresh)
        window.removeEventListener('message', acceptCostChange)
      }
    }, [])
    return state
  }
  function useBalanceSummary() {
    const [state, setState] = useState({ phase: 'loading' })
    useEffect(() => {
      let request
      let disposed = false
      const refresh = async () => {
        if (document.visibilityState === 'hidden') return
        request?.abort()
        request = new AbortController()
        const current = request
        try {
          const response = await fetch('/dsh-app/balance.json', { signal: current.signal, cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const value = await response.json()
          if (!value || !['unconfigured', 'loading', 'ready', 'error'].includes(value.status) || !Array.isArray(value.balances) || value.balances.some(row => !['CNY', 'USD'].includes(row.currency) || typeof row.totalBalance !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(row.totalBalance))) throw new Error('Invalid balance response')
          if (!disposed && !current.signal.aborted) setState({ phase: 'ready', value })
        } catch (error) {
          if (!disposed && !current.signal.aborted) setState(previous => ({ phase: 'error', value: previous.value }))
        }
      }
      void refresh()
      const acceptChange = event => {
        const frame = document.querySelector('.dsh-app-cost-frame')
        if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.type === 'dsh-app:balance-changed') void refresh()
      }
      const timer = setInterval(refresh, 60_000)
      window.addEventListener('focus', refresh)
      window.addEventListener('message', acceptChange)
      document.addEventListener('visibilitychange', refresh)
      return () => {
        disposed = true
        request?.abort()
        clearInterval(timer)
        window.removeEventListener('focus', refresh)
        window.removeEventListener('message', acceptChange)
        document.removeEventListener('visibilitychange', refresh)
      }
    }, [])
    return state
  }
  function CostSummary({ t, wide, onOpen }) {
    const state = useCostSummary()
    const balanceState = useBalanceSummary()
    let amount = t('costLoading')
    let detail = ''
    let warning = false
    if (state.phase === 'error') amount = t('costUnavailable')
    if (state.phase === 'ready') {
      const { month, today, config } = state.value
      const currency = config.currency === 'CNY' ? 'CNY' : 'USD'
      const rate = currency === 'CNY' ? config.exchangeRate : 1
      const unpriced = month.unpricedCalls ?? 0
      warning = unpriced > 0
      amount = unpriced > 0 && unpriced >= month.calls ? t('unpriced') : money(month.apiCost * rate, currency)
      detail = unpriced > 0 ? t('unpricedCalls', { count: unpriced }) : t('monthCost')
      const tokens = month.input + month.cacheRead + month.cacheWrite + month.output
      detail = `${t('tokens')} ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens)} · ${detail}`
      if (config.budget?.enabled && config.budget.amount > 0) {
        const period = config.budget.period === 'day' ? today : month
        const remainder = config.budget.amount - period.apiCost * rate
        detail += ` · ${t(remainder >= 0 ? 'budgetRemaining' : 'budgetExceeded')} ${money(Math.abs(remainder), currency)}`
        if (period.unpricedCalls > 0) detail += ` · ${t('unpricedBudget')}`
      }
    }
    const balance = balanceState.value
    const hasBalance = balance?.balances.length > 0
    const reason = {
      'missing-key': 'balanceUnconfigured', 'official-provider-unavailable': 'balanceUnconfigured',
      'non-official-endpoint': 'balanceEndpoint', unauthorized: 'balanceUnauthorized', 'rate-limited': 'balanceRateLimited',
      'credential-conflict': 'balanceCredentialConflict',
      'configuration-error': 'balanceConfiguration', 'tls-error': 'balanceTls', 'dns-error': 'balanceDns', 'connection-error': 'balanceConnection',
    }
    const balanceAmount = hasBalance ? balance.balances.map(row => `${row.currency === 'CNY' ? '¥' : 'US$'}${row.totalBalance}`).join(' / ')
      : t(balance?.status === 'unconfigured' ? reason[balance.error] ?? 'balanceUnconfigured' : balanceState.phase === 'loading' || balance?.status === 'loading' ? 'balanceLoading' : reason[balance?.error] ?? 'balanceUnavailable')
    const stale = hasBalance && (balance.stale || balanceState.phase === 'error' || balance.status === 'error')
    let balanceDetail = stale ? `${t('balanceStale')}${Number.isFinite(balance.updatedAt) ? ` ${new Date(balance.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''} · ` : ''
    if (balance?.isAvailable === false) balanceDetail += `${t('balanceLow')} · `
    balanceDetail += `${t('monthCost')} ${amount}${detail ? ` · ${detail}` : ''}`
    return h('button', { type: 'button', onClick: onOpen, className: `dsh-app-cost ${wide ? '' : 'is-compact'} ${warning || stale ? 'has-warning' : ''}`, title: `${t('balance')}: ${balanceAmount} · ${balanceDetail}`, 'aria-label': t('cost'), 'data-dsh-app-action': 'cost' },
      h(Icon, { name: 'cost', size: 19 }), wide ? h('span', { className: 'dsh-app-cost-text' },
        h('span', { className: 'dsh-app-cost-heading' }, t('balance'), h('strong', {}, balanceAmount)),
        h('small', {}, balanceDetail)) : null)
  }
  /** Search names immediately and merge cancellable Host content hits after a short debounce. */
  function SearchDialog({ t, list, search, openSession, onClose }) {
    const [query, setQuery] = useState('')
    const [content, setContent] = useState({ query: '', items: [], phase: 'ready', hasMore: false })
    const inputRef = useRef(null)
    const previousFocus = useRef(document.activeElement)
    useEffect(() => {
      const outside = [...document.body.children].filter(child => !child.hasAttribute('data-dsh-app-search-portal') && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE')
      const previous = outside.map(child => [child, child.inert])
      for (const [child] of previous) child.inert = true
      inputRef.current?.focus()
      return () => {
        for (const [child, inert] of previous) child.inert = inert
        if (previousFocus.current?.isConnected) previousFocus.current.focus()
      }
    }, [])
    useEffect(() => {
      const needle = query.trim()
      if (!needle) { setContent({ query: '', items: [], phase: 'ready', hasMore: false }); return }
      const controller = new AbortController()
      const timer = setTimeout(async () => {
        setContent({ query: needle, items: [], phase: 'pending', hasMore: false })
        try {
          const value = await search(needle, controller.signal)
          if (!controller.signal.aborted) setContent({ query: needle, items: value.items, hasMore: value.hasMore, phase: 'ready' })
        } catch (error) {
          if (!controller.signal.aborted) setContent({ query: needle, items: [], hasMore: false, phase: 'error', disabled: searchIsDisabled(error) })
        }
      }, 250)
      return () => { clearTimeout(timer); controller.abort() }
    }, [query, search])
    const needle = query.trim().toLocaleLowerCase()
    const rows = list.ids.map(id => list.byId[id]).filter(row => row && (needle ? `${row.displayTitle} ${row.title ?? ''} ${row.cwd ?? ''}`.toLocaleLowerCase().includes(needle) : !row.blank)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30).map(row => ({ ...row, snippet: '' }))
    const ids = new Set(rows.map(row => row.id))
    if (content.query.toLocaleLowerCase() === needle) for (const hit of content.items) {
      if (ids.has(hit.sessionId)) continue
      const row = list.byId[hit.sessionId]
      if (row) { rows.push({ ...row, snippet: hit.snippet }); ids.add(row.id) }
    }
    const select = id => { openSession(id); onClose() }
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Enter' && event.target === inputRef.current && rows[0]) { event.preventDefault(); select(rows[0].id) }
      if (event.key === 'Tab') {
        const controls = [...event.currentTarget.querySelectorAll('button,input')]
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    return h('div', { className: 'dsh-app-search-mask', onPointerDown: event => { if (event.target === event.currentTarget) onClose() } },
      h('section', { className: 'dsh-app-search-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('search'), onKeyDown: keydown },
        h('div', { className: 'dsh-app-search-field' }, h(Icon, { name: 'search' }), h('input', { ref: inputRef, value: query, maxLength: 500, onChange: event => setQuery(event.target.value.replaceAll('\0', '')), placeholder: t('searchPlaceholder'), 'aria-label': t('search') }), h(Button, { label: t('close'), icon: 'close', onClick: onClose })),
        h('div', { className: 'dsh-app-search-results' }, rows.map(row => h('button', { key: row.id, type: 'button', className: 'dsh-app-search-result', onClick: () => select(row.id) }, h('strong', {}, row.displayTitle || row.title || row.id), h('small', {}, row.snippet || row.cwd || ''))),
          rows.length === 0 && content.phase !== 'pending' ? h('p', { className: 'dsh-app-search-status' }, t('searchEmpty')) : null),
        content.phase === 'pending' ? h('p', { className: 'dsh-app-search-status', role: 'status' }, t('searchPending')) : null,
        content.phase === 'error' ? h('p', { className: `dsh-app-search-status ${content.disabled ? '' : 'has-error'}`, role: content.disabled ? 'status' : 'alert' }, t(content.disabled ? 'searchDisabled' : 'searchError')) : null,
        content.hasMore ? h('p', { className: 'dsh-app-search-status' }, t('searchMore')) : null))
  }
  function Sidebar({ collapsed, width, renderSlot, t, startSession, toggleSidebar, selectPanel, searchSessions, openSession, useSessions, panelsSource, footersSource, localeSource, usePanelInfo }) {
    const panels = useSyncExternalStore(panelsSource.subscribe, panelsSource.getSnapshot, panelsSource.getSnapshot)
    const footerIds = useSyncExternalStore(footersSource.subscribe, footersSource.getSnapshot, footersSource.getSnapshot)
    useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot, localeSource.getSnapshot)
    const list = useSessions(snapshot => snapshot)
    const activePanel = usePanelInfo(snapshot => snapshot.activePanelId)
    const [searchOpen, setSearchOpen] = useState(false)
    const sidebarRef = useRef(null)
    const portal = useRef(null)
    const featureTimer = useRef(null)
    const sidebarFeatures = useRef(new Set())
    useEffect(() => () => { clearTimeout(featureTimer.current); delete document.documentElement.dataset.dshAppActions }, [])
    useEffect(() => {
      const matchesTab = (name, button) => (name === 'im' ? /^(频道|channels)$/i : /^(定时|定时任务|scheduled tasks|schedule|automations)$/i).test(button.textContent.trim())
      const sync = () => {
        if (!collapsed) {
          for (const name of ['im', 'schedule']) {
            const available = [...sidebarRef.current.querySelectorAll('[data-dsh-app-workspaces] [role="tab"]')].some(button => matchesTab(name, button))
            if (available) sidebarFeatures.current.add(name)
            else sidebarFeatures.current.delete(name)
          }
        }
        const actions = new Set(['new', 'sidebar', 'search', 'cost', 'settings', 'skills', ...sidebarFeatures.current])
        if (document.querySelector('[data-composer-card] .aag-btn')) actions.add('experts')
        if (sidebarRef.current.querySelector('[data-dsh-app-action="connector"]')) actions.add('connector')
        if (panels.some(panel => /plugin|插件/i.test(panel.label))) actions.add('plugins')
        const value = [...actions].join(' ')
        if (document.documentElement.dataset.dshAppActions !== value) document.documentElement.dataset.dshAppActions = value
      }
      const observer = new MutationObserver(sync)
      observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
      sync()
      return () => observer.disconnect()
    }, [panels, collapsed])
    useEffect(() => {
      const host = document.createElement('div')
      host.dataset.dshAppSearchPortal = ''
      document.body.append(host)
      portal.current = host
      return () => { portal.current = null; host.remove() }
    }, [])
    useEffect(() => {
      const action = event => {
        const id = event.detail?.action
        if (id === 'new') startSession()
        else if (id === 'search') setSearchOpen(true)
        else if (id === 'sidebar') toggleSidebar()
        else if (id === 'home') selectPanel(null)
        else if (id === 'cost') selectPanel('dsh-app-cost')
        else if (id === 'settings') selectPanel('dsh-app-settings')
        else if (id === 'skills') pluginPages.openPage({ layout: { selectPanel } }, 'skills')
        else if (id === 'plugins') pluginPages.openPage({ layout: { selectPanel } }, 'plugins')
        else if (id === 'connector') pluginPages.openPage({ layout: { selectPanel } }, 'mcp')
        else if (id === 'experts') document.querySelector('[data-composer-card] .aag-btn')?.click()
        else if (id === 'schedule' || id === 'im') {
          if (collapsed) toggleSidebar()
          clearTimeout(featureTimer.current)
          featureTimer.current = setTimeout(() => {
            const pattern = id === 'im' ? /^(频道|channels)$/i : /^(定时|定时任务|scheduled tasks|schedule|automations)$/i
            const tab = [...sidebarRef.current.querySelectorAll('[data-dsh-app-workspaces] [role="tab"]')].find(button => pattern.test(button.textContent.trim()))
            tab?.click()
          }, collapsed ? 150 : 0)
        }
        else {
          const patterns = {
            plugins: /plugin|插件/i, skills: /skill|技能/i, experts: /expert|专家/i,
            connector: /connector|连接器/i, schedule: /schedule|定时/i, im: /IM|助理/i,
          }
          const panel = panels.find(value => value.id === id || patterns[id]?.test(value.label))
          if (panel) selectPanel(panel.id)
        }
      }
      const shortcut = event => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
          const key = event.key.toLowerCase()
          if (key === 'k' || key === 'f') { event.preventDefault(); event.stopImmediatePropagation(); setSearchOpen(true) }
          else if (key === 'n') { event.preventDefault(); event.stopImmediatePropagation(); startSession() }
          else if (key === 'b') { event.preventDefault(); event.stopImmediatePropagation(); toggleSidebar() }
        }
      }
      window.addEventListener('dsh-app:action', action)
      document.addEventListener('keydown', shortcut, true)
      return () => { window.removeEventListener('dsh-app:action', action); document.removeEventListener('keydown', shortcut, true) }
    }, [panels, collapsed, startSession, toggleSidebar, selectPanel])
    const choose = id => { if (id === 'plugins') pluginPages.openPage({ layout: { selectPanel } }, 'plugins'); else selectPanel(id) }
    const primaryPanels = panels.filter(panel => panel.id !== 'dsh-app-cost' && !/skill|技能|mcp/i.test(panel.label))
      .sort((a, b) => Number(!/automation|自动化|定时任务/i.test(a.label)) - Number(!/automation|自动化|定时任务/i.test(b.label)))
    return h('div', { ref: sidebarRef, className: 'dsh-app-sidebar', 'data-dsh-app-sidebar': '', 'data-collapsed': collapsed || undefined, style: { width } },
      h('nav', { className: 'dsh-app-rail', 'aria-label': t('features') },
        h(Button, { label: t('home'), icon: 'home', active: activePanel === null, onClick: () => choose(null), className: 'dsh-app-rail-home', 'data-dsh-app-action': 'home' }),
        ...primaryPanels.map(panel => h(Button, { key: panel.id, label: panel.label, active: activePanel === panel.id, onClick: () => choose(panel.id), 'data-dsh-app-panel': panel.id }, renderSlot('sidebar.panellist', { size: 22, active: activePanel === panel.id }, { only: panel.id }))),
        h(Button, { label: t('settings'), icon: 'settings', active: activePanel === 'dsh-app-settings', onClick: () => choose('dsh-app-settings'), 'data-dsh-app-action': 'settings' }),
        h('div', { className: 'dsh-app-rail-spacer' }),
        collapsed ? h(CostSummary, { t, wide: false, onOpen: () => choose('dsh-app-cost') }) : null,
        h('div', { className: 'dsh-app-rail-footer' }, footerIds.map(id => h(React.Fragment, { key: id }, renderSlot('sidebar.footer.action', { wide: false }, { only: id })))),
        h('div', { hidden: true, 'data-dsh-app-settings': '' }, renderSlot('sidebar.settings', { wide: false })),
        h(Button, { label: t('sidebar'), icon: 'sidebar', onClick: toggleSidebar, 'data-dsh-app-action': 'sidebar' })),
      !collapsed ? h('aside', { className: 'dsh-app-session-sidebar' },
        h('div', { className: 'dsh-app-brand-row' }, h('strong', {}, t('brand')), h(Button, { label: t('search'), icon: 'search', onClick: () => setSearchOpen(true), 'data-dsh-app-action': 'search' })),
        h(Button, { label: t('new'), icon: 'new', onClick: startSession, className: 'dsh-app-new-chat', 'data-dsh-app-action': 'new' }, h('span', {}, t('new'))),
        h('div', { className: 'dsh-app-workspaces', 'data-dsh-app-workspaces': '', 'data-slot': 'sidebar.workspaces' }, renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })),
        h('footer', { className: 'dsh-app-sidebar-foot' }, h(CostSummary, { t, wide: true, onOpen: () => choose('dsh-app-cost') }))) : null,
      searchOpen && portal.current ? createPortal(h(SearchDialog, { t, list, search: searchSessions, openSession, onClose: () => setSearchOpen(false) }), portal.current) : null)
  }
  /** Render one scroll document while keeping projections inside the current Session's slot. */
  function UsageBody({ sessionId, useProjection, t }) {
    const frameRef = useRef(null)
    const [target, setTarget] = useState(null)
    const sheetRef = useRef(null)
    const bindFrame = useMemo(() => node => { sheetRef.current?.remove(); sheetRef.current = null; frameRef.current = node; setTarget(null) }, [])
    const sameOrigin = frame => {
      try { return frame?.contentWindow.location.origin === location.origin }
      catch (error) {
        if (error.name === 'SecurityError') return false
        throw error
      }
    }
    const synchronize = () => {
      const frame = frameRef.current
      const doc = frame?.contentDocument
      if (!doc || !sameOrigin(frame)) return
      const theme = getComputedStyle(document.body)
      const root = doc.documentElement
      root.dataset.dshAppEmbedded = 'true'
      root.lang = document.documentElement.lang
      for (const name of ['surface', 'border', 'hover', 'label', 'text', 'warning', 'muted', 'font', 'ui-font-size', 'code-font']) root.style.setProperty(`--dsh-app-${name}`, theme.getPropertyValue(`--dsh-app-${name}`))
      root.style.colorScheme = theme.colorScheme
      root.style.backgroundColor = theme.getPropertyValue('--dsh-app-surface')
      root.style.color = theme.getPropertyValue('--dsh-app-label')
    }
    const loaded = () => {
      const frame = frameRef.current
      if (!sameOrigin(frame)) return
      const doc = frame.contentDocument
      const anchor = doc.getElementById('session-insight')
      if (!anchor) throw new Error('The cost page is missing its current-session insight mount')
      sheetRef.current?.remove()
      const sheet = doc.createElement('style')
      sheet.dataset.dshAppContextStyle = ''
      sheet.textContent = `${contextInsight.styles}\n${embeddedTypography}`
      doc.head.append(sheet)
      sheetRef.current = sheet
      synchronize()
      setTarget(anchor)
    }
    useEffect(() => {
      const observer = new MutationObserver(synchronize)
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'class', 'style', 'data-theme'] })
      return () => { observer.disconnect(); sheetRef.current?.remove(); sheetRef.current = null }
    }, [])
    return h(React.Fragment, {}, h('iframe', { ref: bindFrame, key: t('unifiedUsage'), src: '/dsh-app/cost', title: t('unifiedUsage'), className: 'dsh-app-cost-frame', onLoad: loaded }),
      target?.isConnected && target.ownerDocument === frameRef.current?.contentDocument ? createPortal(h(contextInsight.ContextInsight, { sessionId, useProjection, t, embedded: true }), target) : null)
  }
  function CostPanel({ t, selectPanel, renderSlot }) {
    return h('section', { className: 'dsh-app-cost-panel', 'aria-label': t('cost') },
      h('header', {}, h(Button, { label: t('backToChat'), icon: 'back', onClick: () => selectPanel(null) }),
        h('strong', {}, t('cost'))), renderSlot('dsh-app.usage.body', {}))
  }
  /** Decorate official frame hooks; no hashed CSS class names or React internals are read. */
  function installFramePresentation() {
    const touched = new Set()
    let frame
    let queued = false
    let pendingFrame
    let disposed = false
    const frameObserver = new MutationObserver(() => schedule())
    const sync = () => {
      queued = false
      pendingFrame = undefined
      if (disposed) return
      const next = document.querySelector('[data-shell-overlay]')?.parentElement
      if (next && next !== frame) {
        frame = next
        frameObserver.disconnect()
        frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'data-sidebar-collapsed'] })
        frame.dataset.dshAppFrame = ''
        touched.add(frame)
        const sidebar = frame.firstElementChild
        const main = sidebar?.nextElementSibling
        if (sidebar) { sidebar.dataset.dshAppSidebarColumn = ''; touched.add(sidebar) }
        if (main) { main.dataset.dshAppMain = ''; touched.add(main) }
      }
      if (frame) {
        const mainTracks = frame.style.gridTemplateColumns.replace(/^[\d.]+px\s+/, '')
        if (mainTracks && frame.style.getPropertyValue('--dsh-app-main-tracks') !== mainTracks) frame.style.setProperty('--dsh-app-main-tracks', mainTracks)
      }
    }
    const schedule = () => { if (!disposed && !queued) { queued = true; pendingFrame = requestAnimationFrame(sync) } }
    const observer = new MutationObserver(schedule)
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    sync()
    return () => {
      disposed = true
      if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
      observer.disconnect()
      frameObserver.disconnect()
      frame?.style.removeProperty('--dsh-app-main-tracks')
      for (const element of touched) {
        delete element.dataset.dshAppFrame
        delete element.dataset.dshAppSidebarColumn
        delete element.dataset.dshAppMain
      }
    }
  }
  const inject = [...new Set(['slots', 'layout', 'uiWorkspace', 'locale', 'sessions', 'conversation', ...sidebarBridge.inject])]
  /** Claim only the sidebar shell; the official workspace, input and settings plugins retain their logic. */
  function apply(ctx) {
    const sidebarPreferences = sidebarBridge.install(ctx)
    createThemeSyncClient().install(ctx)
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: client dictionaries')
    ctx.effect(() => ctx.locale.register(contextInsight.NS, contextInsight.dictionaries), 'dsh-app: context dictionaries')
    ctx.effect(() => ctx.locale.register(pluginPages.NS, pluginPages.dictionaries), 'dsh-app: plugin page dictionaries')
    ctx.effect(() => ctx.locale.register(mcpClient.NS, mcpClient.dictionaries), 'dsh-app: MCP dictionaries')
    ctx.effect(() => ctx.locale.register(sidebarSettings.NS, sidebarSettings.dictionaries), 'dsh-app: workbench settings dictionaries')
    ctx.effect(() => {
      const sheet = document.createElement('style')
      sheet.dataset.pluginCss = 'dsh-app/client-ui'
      sheet.textContent = `${css}\n${contextInsight.styles}\n${pluginPages.styles}`
      document.head.append(sheet)
      document.documentElement.dataset.dshAppUi = 'true'
      return () => { sheet.remove(); delete document.documentElement.dataset.dshAppUi }
    }, 'dsh-app: client styles')
    ctx.effect(installFramePresentation, 'dsh-app: frame presentation')
    let panelSnapshot = []
    const syncPanels = () => {
      panelSnapshot = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => ({ id: options.id, label: typeof options.label === 'function' ? options.label() : options.label ?? options.id, order: options.order ?? 0 })).sort((a, b) => a.order - b.order)
    }
    const listeners = new Set()
    const notify = () => { syncPanels(); for (const listener of listeners) listener() }
    ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', notify), 'dsh-app: panel catalog')
    ctx.effect(() => ctx.locale.subscribe(notify), 'dsh-app: panel translations')
    const panelStore = { getSnapshot: () => panelSnapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
    let footerSnapshot = []
    const footerListeners = new Set()
    const syncFooters = () => {
      footerSnapshot = ctx.slots.entriesOfSlot('sidebar.footer.action').map(entry => entry.options.id).filter(id => id !== 'mcp-connector')
      for (const listener of footerListeners) listener()
    }
    const footerStore = { getSnapshot: () => footerSnapshot, subscribe: listener => { footerListeners.add(listener); return () => footerListeners.delete(listener) } }
    ctx.effect(() => ctx.slots.subscribe('sidebar.footer.action', syncFooters), 'dsh-app: footer catalog')
    const localeSource = { subscribe: listener => ctx.locale.subscribe(listener), getSnapshot: () => ctx.locale.getLocale() }
    const injection = () => ({
      startSession: () => ctx.uiWorkspace.startSession(),
      toggleSidebar: () => ctx.layout.toggleSidebar(),
      selectPanel: id => ctx.layout.selectPanel(id),
      openSession: id => ctx.uiWorkspace.openSession(id),
      searchSessions: async (query, signal) => {
        const result = await ctx.sessions.search(query, signal)
        if (!result.ok) throw Object.assign(new Error(result.error.message, { cause: result.error }), { code: result.error.code, details: result.error.details })
        return result.value
      },
      panelsSource: panelStore, footersSource: footerStore, localeSource,
    })
    ctx.slots.inject('sidebar', () => ctx.slots.register({
      name: 'sidebar', locale: NS, registrant: 'dsh-app',
      children: {
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      }, inject: injection,
    }, Sidebar))
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-app-cost', locale: NS, registrant: 'dsh-app', children: { 'dsh-app.usage.body': { kind: 'single', scope: 'session-maybe' } }, inject: () => ({ selectPanel: id => ctx.layout.selectPanel(id) }) }, CostPanel))
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-app-settings', locale: NS, registrant: 'dsh-app', inject: () => ({ name: 'settings', selectPanel: id => ctx.layout.selectPanel(id) }) }, InlinePanelHost))
    ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({ name: 'settings.general.item', id: 'dsh-app-workbench', order: 30, locale: sidebarSettings.NS, registrant: 'dsh-app', inject: () => sidebarPreferences }, sidebarSettings.SidebarSettings)), 'dsh-app: General workbench settings')
    ctx.slots.inject('dsh-app.usage.body', () => ctx.slots.register({ name: 'dsh-app.usage.body', locale: contextInsight.NS, registrant: 'dsh-app' }, UsageBody))
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-app-context', order: 90, locale: contextInsight.NS, registrant: 'dsh-app', inject: () => ({ onOpen: () => {
      ctx.layout.selectPanel('dsh-app-cost')
    } }) }, contextInsight.ContextSummary))
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-app-cost', order: 90, label: () => ctx.locale.bind(NS)('cost'), registrant: 'dsh-app' }, () => h(Icon, { name: 'cost' })))
    syncPanels()
    syncFooters()
    ctx.effect(() => installInlinePanels(ctx), 'dsh-app: inline settings presentation')
    ctx.effect(() => pluginPages.install(ctx), 'dsh-app: plugin subpages')
  }
  return { name: 'dsh-app-client', inject, apply, sidebarEngine: sidebarBridge.engine }
}
