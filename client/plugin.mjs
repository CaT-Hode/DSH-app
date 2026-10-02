import createContextInsightClient from './context-insight.mjs'
import createPluginPagesClient from './plugin-pages.mjs'
import createMcpClient from './mcp.mjs'
import createThemeSyncClient from './theme-sync.mjs'
import createSidebarBridge from './sidebar-bridge.mjs'
import createSidebarSettingsClient from './sidebar-settings.mjs'
import createUsageHeatmapClient from './usage-heatmap.mjs'
import createSidebarAgentClient from './sidebar-agent.mjs'
import createSidebarWorkbenchClient from './sidebar-workbench.mjs'
import createSidebarSummaryClient from './sidebar-summary.mjs'
import createSidebarSidechatClient from './sidebar-sidechat.mjs'
import createSidebarMotionClient from './sidebar-motion.mjs'
import createSidebarNewChatClient from './sidebar-new-chat.mjs'
import createNewChatClient from './new-chat.mjs'
import createSidebarInformationClient from './sidebar-information.mjs'
import createModelPricesClient from './model-prices.mjs'
import createConversationMenuClient from './conversation-menu.mjs'
import { createRailExtensionCatalog, isExtensionSection, groupRailExtensions } from './rail-extensions.mjs'
import { installRailNestedSettings } from './rail-nested-settings.mjs'

/** Token volume in the largest unit that keeps the number short: 1.2B, 26.8M, 950K, 800. */
export function compactTokens(value) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [index, [size, suffix]] of units.entries()) {
    if (safe < size) continue
    const scaled = safe / size, rounded = scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))
    // A value that would read 1000 belongs to the next unit instead.
    if (rounded < 1000 || index === 0) return `${rounded}${suffix}`
    return `${Number((safe / units[index - 1][0]).toFixed(1))}${units[index - 1][1]}`
  }
  return String(Math.round(safe))
}

/** Fields the sidebar totals; every period row exposes them, weekly buckets only as currency fields. */
const usageFields = ['input', 'cacheRead', 'cacheWrite', 'output', 'apiCost', 'apiCostCny', 'calls', 'unpricedCalls']

/** Totals of the period the heatmap shows: 今天, the current week (summed buckets) or the current month. */
export function periodUsage(summary, period) {
  if (!summary) return null
  if (period === 'month') return summary.month
  if (period !== 'week') return summary.today
  return (summary.week ?? []).flatMap(day => day.buckets ?? []).reduce((total, row) => {
    for (const key of usageFields) total[key] += Number.isFinite(row?.[key]) ? row[key] : 0
    return total
  }, Object.fromEntries(usageFields.map(key => [key, 0])))
}

/** Build the browser half against DSH's shared module table, without bundling React. */
export default function createDshAppClient(require, css) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const { createElement: h, Children, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } = React
  const { Menu, MenuItemButton } = require('@deepseek-ai/dsh-client-ui-primitives')
  const extensionCatalog = createRailExtensionCatalog()
  const NS = 'dshApp'
  const contextInsight = createContextInsightClient(require)
  const pluginPages = createPluginPagesClient(require)
  const mcpClient = createMcpClient(require)
  const sidebarBridge = createSidebarBridge(require)
  const sidebarSettings = createSidebarSettingsClient(require)
  const sidebarNewChat = createSidebarNewChatClient()
  const modelPrices = createModelPricesClient(require)
  const { UsageHeatmap } = createUsageHeatmapClient(require)
  const dictionaries = {
    zh: {
      brand: 'DeepSeek Harness', home: '聊天', recent: '最近对话', new: '新聊天',
      search: '搜索会话', searchPlaceholder: '搜索标题与对话内容…', searchEmpty: '没有匹配的会话',
      searchPending: '正在搜索…', searchMore: '还有更多结果，请缩小搜索范围',
      more: '更多功能', noPluginPages: '尚无插件页面', skills: '技能', sidebar: '切换侧边栏', settings: '设置', close: '关闭', mcp: 'MCP 连接器',
      cost: '费用与用量', costLoading: '正在读取统计…', costUnavailable: '统计暂不可用',
      unpriced: '未计价', unpricedCalls: '{count} 次调用未计价', unpricedBudget: '未计价费用未扣除',
      monthCost: '本月费用', tokens: 'Token', budgetRemaining: '预算剩余', budgetExceeded: '超出预算',
      today: '今天', week: '本周', month: '本月', periodToday: '本日', usagePeriod: 'Token 用量周期', hourlyTokens: '今日每小时 Token 用量', weekTokens: '本周每 8 小时 Token 用量', monthTokens: '本月每日 Token 用量',
      usageInput: '输入', usageCache: '缓存', usageOutput: '输出', futureUsage: '尚未到达', unknownHours: '部分历史用量缺少小时记录', noDay: '本月没有此日期',
      remainingMoney: '剩余金额', estimatedToday: '今日估算费用', expandSidebar: '展开侧边栏', collapseSidebar: '收起侧边栏',
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
      more: 'More features', noPluginPages: 'No plugin pages yet', skills: 'Skills', sidebar: 'Toggle sidebar', settings: 'Settings', close: 'Close', mcp: 'MCP connectors',
      cost: 'Cost and usage', costLoading: 'Loading usage…', costUnavailable: 'Usage unavailable',
      unpriced: 'Unpriced', unpricedCalls: '{count} unpriced calls', unpricedBudget: 'Unpriced costs are not deducted',
      monthCost: 'This month', tokens: 'Tokens', budgetRemaining: 'Budget remaining', budgetExceeded: 'Over budget',
      today: 'Today', week: 'This week', month: 'Month', periodToday: 'Today', usagePeriod: 'Token usage period', hourlyTokens: 'Hourly tokens today', weekTokens: 'Tokens per 8 hours this week', monthTokens: 'Daily tokens this month',
      usageInput: 'Input', usageCache: 'Cache', usageOutput: 'Output', futureUsage: 'Upcoming', unknownHours: 'Some older usage has no hourly timestamp', noDay: 'No such date in this month',
      remainingMoney: 'Remaining balance', estimatedToday: 'Estimated cost today', expandSidebar: 'Expand sidebar', collapseSidebar: 'Collapse sidebar',
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
    recent: ['circle:12,12,9', 'M12 6.5v6l-3.5 3'],
    plugins: ['M4 8c-2 1-2 4 1 5 4 3 12 3 15 0 3-2 1-5-3-6-5-2-11-1-13 1', 'M9 4c-2 3-2 11 1 15 2 4 5 2 6-2 2-5 1-11-1-13-2-3-5-2-6 0'],
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
  function Icon({ name, size = 20, filled = false }) {
    if (name === 'home' && filled) return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', 'aria-hidden': true }, h('path', { d: 'M10.6 3.1a2.1 2.1 0 0 1 2.8 0l8.1 7a1.2 1.2 0 0 1-1.6 1.8l-.9-.8V20a1.5 1.5 0 0 1-1.5 1.5H15v-7h-6v7H6.5A1.5 1.5 0 0 1 5 20v-8.9l-.9.8a1.2 1.2 0 1 1-1.6-1.8z' }))
    return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      (paths[name] ?? paths.more).map((path, index) => path.startsWith('circle:')
        ? h('circle', { key: index, cx: path.slice(7).split(',')[0], cy: path.slice(7).split(',')[1], r: path.slice(7).split(',')[2] })
        : h('path', { key: index, d: path })))
  }
  function Button({ label, icon, onClick, active, className = '', children, ...props }) {
    return h('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': active === undefined ? undefined : active, onClick, className: `dsh-app-button ${active ? 'is-active' : ''} ${className}`, ...props },
      icon ? h(Icon, { name: icon, filled: active && icon === 'home' }) : null, children)
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
    const extension = useSyncExternalStore(extensionCatalog.subscribe, extensionCatalog.getSnapshot, extensionCatalog.getSnapshot)
    const selected = extension.rows.find(row => row.id === extension.selected)
    const targetRef = useMemo(() => node => setInlineTarget(name, node), [name])
    useEffect(() => {
      inlineWanted.add(name)
      const actions = inlineActions.get(name)
      if (selected) actions?.openSection(selected.id)
      else actions?.open()
      return () => { inlineWanted.delete(name); inlineActions.get(name)?.close() }
    }, [name])
    return h('section', { className: `dsh-app-inline-panel dsh-app-inline-${name}`, 'aria-label': t(name === 'mcp' ? 'mcp' : 'settings') },
      h('header', { className: 'dsh-app-inline-header' }, h(Button, { label: t('backToChat'), icon: 'back', onClick: () => selectPanel(null) }), h('strong', {}, selected?.label ?? t(name === 'mcp' ? 'mcp' : 'settings'))),
      h('div', { ref: targetRef, className: 'dsh-app-inline-target' }))
  }
  function InlineSettings({ rows, renderSlot, activeId, onSelect, onClose }) {
    const extension = rows.find(row => row.id === activeId && isExtensionSection(row.id))
    rows = rows.filter(row => !isExtensionSection(row.id) && !/^(skills?|skill-center)$/i.test(row.id))
    const active = extension?.id ?? rows.find(row => row.id === activeId)?.id ?? rows[0]?.id
    return h('div', { className: `dsh-app-settings-page${extension ? ' dsh-app-extension-page' : ''}`, 'data-dsh-app-extension-page': extension?.id },
      !extension && h('nav', { className: 'dsh-app-settings-nav' },
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
        const activeId = props.useStore(state => state.activeId)
        const wasOpen = useRef(open)
        const actions = useMemo(() => ({ ...props.actions, close: () => { props.actions.close(); closePanel() } }), [props.actions])
        useEffect(() => {
          inlineActions.set('settings', props.actions)
          if (inlineWanted.has('settings')) props.actions.open()
          return () => { if (inlineActions.get('settings') === props.actions) inlineActions.delete('settings') }
        }, [props.actions])
        useEffect(() => {
          extensionCatalog.select(open ? activeId : null)
          if (open) ctx.layout.selectPanel('dsh-app-settings')
          else if (wasOpen.current) closePanel()
          wasOpen.current = open
        }, [open, activeId])
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
    const summary = state.phase === 'ready' ? state.value : null
    const period = ['today', 'week', 'month'].includes(summary?.config.heatmapPeriod) ? summary.config.heatmapPeriod : 'today'
    const summaryRef = useRef(null), moneyRef = useRef(null), usageFit = useRef(() => {})
    const [usageCell, setUsageCell] = useState(null)
    /** Size one square cell of the 8-column 今天 grid so 本周 and 本月 keep the same block size. */
    useLayoutEffect(() => {
      const root = summaryRef.current, money = moneyRef.current
      if (!root || !money) return
      const fit = () => {
        const style = getComputedStyle(root), moneyStyle = getComputedStyle(money)
        const base = Number.parseFloat(style.getPropertyValue('--dsh-app-cost-size')) || 15
        const strong = money.querySelector('strong'), size = strong ? Number.parseFloat(getComputedStyle(strong).fontSize) || base : base
        const moneyPadding = (Number.parseFloat(moneyStyle.paddingLeft) || 0) + (Number.parseFloat(moneyStyle.paddingRight) || 0)
        // Normalize the money column to its unscaled width: it animates between the two periods.
        const reserved = (money.getBoundingClientRect().width - moneyPadding) * (base / size) + moneyPadding
        const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
        const gap = Number.parseFloat(style.columnGap) || 0
        const row = root.querySelector('.dsh-app-usage-grid-row')
        const cellGap = row ? Number.parseFloat(getComputedStyle(row).columnGap) || 0 : 0
        const cell = Math.max(8, (root.clientWidth - padding - gap - reserved - 7 * cellGap) / 8)
        if (!Number.isFinite(cell)) return
        setUsageCell(current => current !== null && Math.abs(current - cell) < 0.05 ? current : cell)
      }
      usageFit.current = fit
      if (typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(() => usageFit.current())
      observer.observe(root); observer.observe(money)
      return () => observer.disconnect()
    }, [])
    useLayoutEffect(() => usageFit.current())
    const balance = balanceState.value
    const balanceRow = balance?.balances.find(row => row.currency === 'CNY') ?? balance?.balances[0]
    const currency = balanceRow?.currency ?? summary?.config.currency ?? 'CNY'
    const usage = periodUsage(summary, period)
    const amount = usage ? currency === 'CNY' ? usage.apiCostCny ?? usage.apiCost * summary.config.exchangeRate : usage.apiCost : null
    const unpriced = usage?.unpricedCalls ?? 0
    const spent = amount === null || (unpriced > 0 && unpriced >= usage.calls) ? '—' : money(amount, currency)
    const hasBalance = Boolean(balanceRow)
    const reason = {
      'missing-key': 'balanceUnconfigured', 'official-provider-unavailable': 'balanceUnconfigured',
      'non-official-endpoint': 'balanceEndpoint', unauthorized: 'balanceUnauthorized', 'rate-limited': 'balanceRateLimited',
      'credential-conflict': 'balanceCredentialConflict',
      'configuration-error': 'balanceConfiguration', 'tls-error': 'balanceTls', 'dns-error': 'balanceDns', 'connection-error': 'balanceConnection',
    }
    const balanceDescription = hasBalance ? balance.balances.map(row => `${row.currency === 'CNY' ? '¥' : 'US$'}${row.totalBalance}`).join(' / ')
      : t(balance?.status === 'unconfigured' ? reason[balance.error] ?? 'balanceUnconfigured' : balanceState.phase === 'loading' || balance?.status === 'loading' ? 'balanceLoading' : reason[balance?.error] ?? 'balanceUnavailable')
    const stale = hasBalance && (balance.stale || balanceState.phase === 'error' || balance.status === 'error')
    let balanceDetail = stale ? `${t('balanceStale')}${Number.isFinite(balance.updatedAt) ? ` ${new Date(balance.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''} · ` : ''
    if (balance?.isAvailable === false) balanceDetail += `${t('balanceLow')} · `
    const tokenTotal = usage ? ['input', 'cacheRead', 'cacheWrite', 'output'].reduce((total, key) => total + (Number.isFinite(usage[key]) ? usage[key] : 0), 0) : null
    const tokenText = tokenTotal === null ? '—' : compactTokens(tokenTotal)
    /** 本日 / 本周 / 本月 — the same period the heatmap beside it shows. */
    const periodLabel = t(period === 'today' ? 'periodToday' : period)
    balanceDetail += `${periodLabel} ${spent}${unpriced ? ` · ${t('unpricedCalls', { count: unpriced })}` : ''} · ${periodLabel} ${t('tokens')} ${tokenText}`
    return h('div', { ref: summaryRef, className: `dsh-app-cost-summary ${unpriced || stale ? 'has-warning' : ''}`, 'aria-label': t('cost'), 'data-dsh-app-usage-summary': '', 'data-usage-period': period, style: usageCell === null ? undefined : { '--dsh-usage-cell': `${usageCell}px` } },
      h(UsageHeatmap, { summary, period, onOpen, t }),
      h('button', { ref: moneyRef, type: 'button', onClick: onOpen, className: 'dsh-app-cost-money', title: `${t('remainingMoney')}: ${balanceDescription} · ${balanceDetail}`, 'aria-label': `${t('cost')} · ${t('remainingMoney')} ${balanceDescription} · ${balanceDetail}`, 'data-dsh-app-action': 'cost' },
        h('strong', { 'data-balance-stale': stale || undefined }, hasBalance ? money(Number(balanceRow.totalBalance), balanceRow.currency) : '—'),
        h('small', {}, `${periodLabel} ${spent}${unpriced && amount !== null && unpriced < usage.calls ? '+' : ''}`),
        h('small', { 'data-dsh-app-usage-tokens': '' }, tokenText)))
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
  /** Morph one folder's body and cover; the owner's aria-expanded controls the row. */
  function WorkspaceFolderIcons({ rootRef }) {
    const [hosts, setHosts] = useState([])
    useEffect(() => {
      const root = rootRef.current
      if (!root) return
      const selector = '[data-dsh-app-workspaces] [data-row-key^="workspace:"]'
      const entries = new Map()
      const remove = (slot, host) => { host.remove(); delete slot.dataset.dshAppFolder }
      const sync = () => {
        let changed = false
        for (const [slot, host] of entries) if (!root.contains(slot)) {
          remove(slot, host); entries.delete(slot); changed = true
        }
        for (const row of root.querySelectorAll(selector)) {
          const slot = row.firstElementChild
          if (slot?.tagName !== 'SPAN' || !slot.querySelector(':scope > svg') || entries.has(slot)) continue
          const host = document.createElement('span')
          host.dataset.dshAppFolderLayers = ''
          host.setAttribute('aria-hidden', 'true')
          slot.dataset.dshAppFolder = ''
          slot.append(host)
          entries.set(slot, host)
          changed = true
        }
        if (changed) setHosts([...entries.values()])
      }
      const observer = new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches('[data-row-key^="workspace:"]') || node.querySelector('[data-row-key^="workspace:"]'))))) sync()
      })
      observer.observe(root, { childList: true, subtree: true })
      const keyboard = event => { if (event.target.closest?.('[data-dsh-app-workspaces]')) root.dataset.dshAppFolderInstant = '' }
      const pointer = () => { delete root.dataset.dshAppFolderInstant }
      root.addEventListener('keydown', keyboard, true)
      root.addEventListener('pointerdown', pointer, true)
      sync()
      return () => {
        observer.disconnect()
        root.removeEventListener('keydown', keyboard, true)
        root.removeEventListener('pointerdown', pointer, true)
        for (const [slot, host] of entries) remove(slot, host)
        delete root.dataset.dshAppFolderInstant
      }
    }, [rootRef])
    return hosts.map(host => createPortal(h('svg', { className: 'dsh-app-folder-icon', width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { className: 'dsh-app-folder-back', d: 'M2.5 2.5 H5.4 Q5.75 2.5 6.1 2.8 L7.45 4 Q7.8 4.3 8.15 4.3 H13.5 Q14.5 4.3 14.5 5.3 V12.5 Q14.5 13.5 13.5 13.5 H2.5 Q1.5 13.5 1.5 12.5 V3.5 Q1.5 2.5 2.5 2.5 Z' }),
      h('path', { className: 'dsh-app-folder-front', d: 'M2.5 7.7 H13.5 Q14.5 7.7 14.5 8.7 L14.5 12.5 Q14.5 13.5 13.5 13.5 H2.5 Q1.5 13.5 1.5 12.5 L1.5 8.7 Q1.5 7.7 2.5 7.7 Z' })), host))
  }
  function RailMore({ t, panels, sections, selected, activePanel, choose, openSection }) {
    const [open, setOpen] = useState(false)
    const [settingsFor, setSettingsFor] = useState(null)
    const rows = groupRailExtensions(panels, sections)
    const close = () => { setOpen(false); setSettingsFor(null) }
    const configure = id => { close(); openSection(id) }
    const active = selected !== null || panels.some(panel => panel.id === activePanel)
    return h('div', { className: 'dsh-app-rail-more', 'data-dsh-app-rail-more': '' }, h(Menu, {
      open, align: 'start', side: 'right', portal: true, dense: true, onClose: close, listClassName: 'dsh-app-extension-menu',
      anchor: h(Button, { label: t('more'), icon: 'more', active: active || open, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(value => !value), 'data-dsh-app-action': 'more' }),
    }, rows.length ? rows.map(row => h(React.Fragment, { key: row.key },
      h('div', { className: 'dsh-app-extension-row', 'data-dsh-app-extension': row.key },
        h(MenuItemButton, { icon: h(Icon, { name: 'puzzle', size: 18 }), onSelect: () => { close(); if (row.panelId) choose(row.panelId); else openSection(row.settings[0].id) } }, row.label),
        row.showSettings ? h('div', { className: 'dsh-app-extension-gear' }, h(MenuItemButton, { onSelect: () => row.settings.length === 1 ? configure(row.settings[0].id) : setSettingsFor(value => value === row.key ? null : row.key) },
          h('span', { className: 'dsh-app-sr-only' }, `${row.label} · ${t('settings')}`), h(Icon, { name: 'settings', size: 17 }))) : null),
      settingsFor === row.key && row.settings.length > 1 ? h('div', { className: 'dsh-app-extension-sections' }, row.settings.map(section => h(MenuItemButton, { key: section.id, onSelect: () => configure(section.id) }, section.label))) : null))
      : h('div', { className: 'dsh-app-extension-empty' }, t('noPluginPages'))))
  }
  function Sidebar({ collapsed, width, renderSlot, t, startSession, toggleSidebar, selectPanel, searchSessions, openSession, useSessions, panelsSource, footersSource, localeSource, usePanelInfo }) {
    const panels = useSyncExternalStore(panelsSource.subscribe, panelsSource.getSnapshot, panelsSource.getSnapshot)
    const footerIds = useSyncExternalStore(footersSource.subscribe, footersSource.getSnapshot, footersSource.getSnapshot)
    const extension = useSyncExternalStore(extensionCatalog.subscribe, extensionCatalog.getSnapshot, extensionCatalog.getSnapshot)
    useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot, localeSource.getSnapshot)
    const list = useSessions(snapshot => snapshot)
    const activePanel = usePanelInfo(snapshot => snapshot.activePanelId)
    const [searchOpen, setSearchOpen] = useState(false)
    const sidebarRef = useRef(null)
    const expandedWidth = useRef(collapsed ? 280 : width)
    if (!collapsed) expandedWidth.current = width
    useLayoutEffect(() => {
      document.documentElement.dataset.dshAppSidebarCollapsed = String(Boolean(collapsed))
      return () => { delete document.documentElement.dataset.dshAppSidebarCollapsed }
    }, [collapsed])
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
        else if (id === 'settings') { extensionCatalog.select(null); inlineActions.get('settings')?.openSection('general'); selectPanel('dsh-app-settings') }
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
    const choose = id => {
      if (id === 'dsh-app-settings') { extensionCatalog.select(null); inlineActions.get('settings')?.openSection('general') }
      if (id === 'plugins') pluginPages.openPage({ layout: { selectPanel } }, 'plugins')
      else selectPanel(id)
    }
    const openExtension = id => {
      if (!extensionCatalog.select(id)) return
      inlineActions.get('settings')?.openSection(id)
      selectPanel('dsh-app-settings')
    }
    const primaryPanels = panels.filter(panel => ['schedules', 'plugins'].includes(panel.id))
      .sort((a, b) => Number(!/automation|自动化|定时任务/i.test(a.label)) - Number(!/automation|自动化|定时任务/i.test(b.label)))
    const extraPanels = panels.filter(panel => !['schedules', 'plugins', 'dsh-app-cost'].includes(panel.id) && !/skill|技能|mcp/i.test(panel.label))
    return h('div', { ref: sidebarRef, className: 'dsh-app-sidebar', 'data-dsh-app-sidebar': '', 'data-collapsed': collapsed || undefined, style: { width: expandedWidth.current } },
      h(WorkspaceFolderIcons, { rootRef: sidebarRef }),
      createPortal(h('header', { className: 'dsh-app-topbar', 'aria-label': t('brand') },
        h(Button, { label: t(collapsed ? 'expandSidebar' : 'collapseSidebar'), icon: 'sidebar', onClick: toggleSidebar, 'aria-expanded': !collapsed, 'aria-controls': 'dsh-app-session-sidebar', 'data-dsh-app-action': 'sidebar' })), document.body),
      h('nav', { className: 'dsh-app-rail', 'aria-label': t('features') },
        h(Button, { label: t('home'), icon: 'home', active: activePanel === null, onClick: () => choose(null), className: 'dsh-app-rail-home', 'data-dsh-app-action': 'home' }),
        ...primaryPanels.map(panel => h(Button, { key: panel.id, label: panel.label, icon: panel.id === 'schedules' ? 'recent' : 'plugins', active: activePanel === panel.id, onClick: () => choose(panel.id), 'data-dsh-app-panel': panel.id })),
        h(RailMore, { t, panels: extraPanels, sections: extension.rows, selected: activePanel === 'dsh-app-settings' ? extension.selected : null, activePanel, choose, openSection: openExtension }),
        h('div', { className: 'dsh-app-rail-spacer' }),
        collapsed ? h(Button, { label: t('cost'), icon: 'cost', onClick: () => choose('dsh-app-cost'), 'data-dsh-app-action': 'cost' }) : null,
        h('div', { className: 'dsh-app-rail-footer' }, footerIds.map(id => h(React.Fragment, { key: id }, renderSlot('sidebar.footer.action', { wide: false }, { only: id })))),
        h('div', { hidden: true, 'data-dsh-app-settings': '' }, renderSlot('sidebar.settings', { wide: false })),
        h(Button, { label: t('settings'), icon: 'settings', active: activePanel === 'dsh-app-settings' && !extension.selected, onClick: () => choose('dsh-app-settings'), 'data-dsh-app-action': 'settings' })),
      h('aside', { id: 'dsh-app-session-sidebar', className: 'dsh-app-session-sidebar', inert: collapsed ? '' : undefined, 'aria-hidden': collapsed || undefined },
        h('div', { className: 'dsh-app-brand-row' }, h('strong', {}, t('brand')), h(Button, { label: t('search'), icon: 'search', onClick: () => setSearchOpen(true), 'data-dsh-app-action': 'search' })),
        h(Button, { label: t('new'), icon: 'new', onClick: startSession, className: 'dsh-app-new-chat', 'data-dsh-app-action': 'new' }, h('span', {}, t('new'))),
        h('div', { className: 'dsh-app-workspaces', 'data-dsh-app-workspaces': '', 'data-slot': 'sidebar.workspaces' }, renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })),
        h('footer', { className: 'dsh-app-sidebar-foot' }, h(CostSummary, { t, wide: true, onOpen: () => choose('dsh-app-cost') }))),
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
  const inject = [...new Set(['slots', 'layout', 'uiWorkspace', 'workspaces', 'uiSession', 'sidebarRight', 'locale', 'sessions', 'conversation', ...sidebarBridge.inject])]
  /** Claim only the sidebar shell; the official workspace, input and settings plugins retain their logic. */
  function apply(ctx) {
    ctx.effect(() => () => sidebarNewChat.dispose(), 'dsh-app: new conversation sidebar lifecycle')
    const sidebarPreferences = sidebarBridge.install(ctx)
    createConversationMenuClient(require).install(ctx)
    const sidebarInformation = createSidebarInformationClient(require)
    sidebarInformation.install(ctx)
    sidebarPreferences.Information = sidebarInformation.Information
    createSidebarWorkbenchClient(require).install(ctx, sidebarPreferences)
    createNewChatClient(require).install(ctx)
    createSidebarSummaryClient(require).install(ctx, sidebarPreferences)
    createSidebarSidechatClient(require).install(ctx, sidebarPreferences)
    createSidebarMotionClient().install(ctx)
    createSidebarAgentClient().install(ctx, sidebarPreferences)
    createThemeSyncClient().install(ctx)
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: client dictionaries')
    ctx.effect(() => ctx.locale.register(contextInsight.NS, contextInsight.dictionaries), 'dsh-app: context dictionaries')
    ctx.effect(() => ctx.locale.register(pluginPages.NS, pluginPages.dictionaries), 'dsh-app: plugin page dictionaries')
    ctx.effect(() => ctx.locale.register(mcpClient.NS, mcpClient.dictionaries), 'dsh-app: MCP dictionaries')
    ctx.effect(() => ctx.locale.register(sidebarSettings.NS, sidebarSettings.dictionaries), 'dsh-app: workbench settings dictionaries')
    ctx.effect(() => ctx.locale.register(modelPrices.NS, modelPrices.dictionaries), 'dsh-app: model price dictionaries')
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
      panelSnapshot = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options, registrant }) => ({ id: options.id, registrant, label: typeof options.label === 'function' ? options.label() : options.label ?? options.id, order: options.order ?? 0 })).sort((a, b) => a.order - b.order)
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
      startSession: () => sidebarNewChat.startSession(ctx),
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
    ctx.effect(() => ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
      name: 'settings.models.footer', id: 'dsh-app-model-prices', order: 20, locale: modelPrices.NS, registrant: 'dsh-app',
      inject: () => ({ remote: ctx.remote }),
    }, modelPrices.ModelPrices)), 'dsh-app: model prices in the Models settings page')
    ctx.slots.inject('dsh-app.usage.body', () => ctx.slots.register({ name: 'dsh-app.usage.body', locale: contextInsight.NS, registrant: 'dsh-app' }, UsageBody))
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-app-context', order: 90, locale: contextInsight.NS, registrant: 'dsh-app', inject: () => ({ onOpen: () => {
      ctx.layout.selectPanel('dsh-app-cost')
    } }) }, contextInsight.ContextSummary))
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-app-cost', order: 90, label: () => ctx.locale.bind(NS)('cost'), registrant: 'dsh-app' }, () => h(Icon, { name: 'cost' })))
    syncPanels()
    syncFooters()
    ctx.effect(() => installRailNestedSettings(ctx, React), 'dsh-app: Native plugin settings tabs in rail')
    const syncExtensions = () => extensionCatalog.sync(ctx.slots.entriesOfSlot('settings.section'))
    ctx.effect(() => ctx.slots.subscribe('settings.section', syncExtensions), 'dsh-app: extension settings catalog')
    ctx.effect(() => ctx.locale.subscribe(syncExtensions), 'dsh-app: extension labels')
    syncExtensions()
    ctx.effect(() => installInlinePanels(ctx), 'dsh-app: inline settings presentation')
    ctx.effect(() => {
      // The cost page is its own document: it asks the shell to show the Models settings section.
      const jump = event => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type !== 'dsh-app:open-model-prices') return
        const actions = inlineActions.get('settings')
        if (actions?.openSection) actions.openSection('models')
        else ctx.layout.selectPanel('dsh-app-settings')
      }
      window.addEventListener('message', jump)
      return () => window.removeEventListener('message', jump)
    }, 'dsh-app: open the Models settings from the cost page')
    ctx.effect(() => pluginPages.install(ctx), 'dsh-app: plugin subpages')
  }
  return { name: 'dsh-app-client', inject, apply, sidebarEngine: sidebarBridge.engine }
}
