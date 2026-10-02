/** Combine discovery and installed management while retaining official configuration views. */
import createSkillsClient from './skills.mjs'
import createMcpClient from './mcp.mjs'

export default function createPluginPagesClient(require) {
  const { createElement: h, Fragment: ReactFragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } = require('react')
  const skillsClient = createSkillsClient(require)
  const mcpClient = createMcpClient(require)
  const NS = 'dshAppPluginPages'
  const eventName = 'dsh-app:plugin-page'
  const dictionaries = {
    zh: {
      title: '插件', pages: '插件页面', plugins: '插件', pluginsTab: '浏览', skills: '技能中心', market: '市场', skillsTab: '技能',
      installed: '已安装插件', installedTab: '已安装', mcpTab: 'MCP', browse: '浏览插件市场',
      search: '搜索插件', allPlugins: '全部', installedFilter: '已安装', updatesFilter: '可更新', availableFilter: '可安装',
      details: '详情', closeDetails: '关闭详情', configure: '配置', enable: '启用', disable: '停用', official: '官方功能', community: '社区插件', local: '本地插件', active: '已启用', disabled: '已停用', failed: '启动失败', managedByApp: '由 DSH App 管理', description: '说明', noDescription: '此插件尚未提供说明。', sourceInstallTitle: '从来源安装', pendingDetails: '查看变更', author: '作者',
      officialSource: 'DeepSeek AI 官方', shippedOfficial: 'DSH 内置', optionalOfficial: 'DSH 内置 · 可选',
      allCategories: '全部分类', loading: '正在读取插件…', noResults: '没有匹配的插件。', staleCatalog: '目录暂时无法刷新，当前显示上次保存的内容。',
      refresh: '刷新', checkUpdates: '检查更新', checking: '正在检查…',
      install: '安装', update: '更新', uninstall: '卸载', cancel: '取消排队',
      pendingInstall: '待安装', pendingUpdate: '待更新', pendingUninstall: '待卸载',
      queued: '已加入待执行列表，重启后应用。', pending: '{count} 项变更等待重启后应用',
      restart: '重启并应用', restarting: '正在重启并应用…', manualRestart: '请重启 DSH 客户端以应用这些变更。',
      source: '项目主页', version: '版本', perPage: '每页', previous: '上一页', next: '下一页',
      pageCount: '第 {page} / {pages} 页，共 {count} 项', operationFailed: '操作失败', retry: '重试',
      invalidResponse: '插件服务返回了无效数据。', refreshState: '更新状态', operation: '最近操作',
      queuedState: '等待重启', runningState: '正在应用', succeededState: '已应用', cancelledState: '已取消',
      installSource: '从来源安装', sourcePlaceholder: 'npm 包名、包名@版本或 github:作者/仓库',
      ...skillsClient.dictionaries.zh,
    },
    en: {
      title: 'Plugins', pages: 'Plugin pages', plugins: 'Plugins', pluginsTab: 'Browse', skills: 'Skill center', market: 'Market', skillsTab: 'Skills',
      installed: 'Installed plugins', installedTab: 'Installed', mcpTab: 'MCP', browse: 'Browse plugin market',
      search: 'Search plugins', allPlugins: 'All', installedFilter: 'Installed', updatesFilter: 'Updates', availableFilter: 'Available',
      details: 'Details', closeDetails: 'Close details', configure: 'Configure', enable: 'Enable', disable: 'Disable', official: 'Official feature', community: 'Community plugin', local: 'Local plugin', active: 'Enabled', disabled: 'Disabled', failed: 'Failed to start', managedByApp: 'Managed by DSH App', description: 'Description', noDescription: 'This plugin has no description yet.', sourceInstallTitle: 'Install from source', pendingDetails: 'View changes', author: 'Author',
      officialSource: 'Official · DeepSeek AI', shippedOfficial: 'Bundled with DSH', optionalOfficial: 'Bundled with DSH · Optional',
      allCategories: 'All categories', loading: 'Loading plugins…', noResults: 'No plugins match.', staleCatalog: 'The catalog could not refresh. Showing the last saved copy.',
      refresh: 'Refresh', checkUpdates: 'Check for updates', checking: 'Checking…',
      install: 'Install', update: 'Update', uninstall: 'Uninstall', cancel: 'Cancel queued change',
      pendingInstall: 'Install queued', pendingUpdate: 'Update queued', pendingUninstall: 'Removal queued',
      queued: 'Change queued. Restart to apply it.', pending: '{count} changes will apply after restart',
      restart: 'Restart and apply', restarting: 'Restarting and applying…', manualRestart: 'Restart the DSH client to apply these changes.',
      source: 'Project page', version: 'Version', perPage: 'Per page', previous: 'Previous', next: 'Next',
      pageCount: 'Page {page} of {pages}, {count} items', operationFailed: 'Operation failed', retry: 'Retry',
      invalidResponse: 'The plugin service returned invalid data.', refreshState: 'Refresh status', operation: 'Latest operation',
      queuedState: 'Waiting for restart', runningState: 'Applying', succeededState: 'Applied', cancelledState: 'Cancelled',
      installSource: 'Install from source', sourcePlaceholder: 'npm package, package@version, or github:owner/repository',
      ...skillsClient.dictionaries.en,
    },
  }
  const styles = skillsClient.styles
  const isOfficialPackage = item => item.packageName?.startsWith('@deepseek-ai/') === true
  const officialRepository = 'https://github.com/deepseek-ai/deepseek-harness'
  function source(initial) {
    let snapshot = initial
    const listeners = new Set()
    return {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      set(value) {
        if (Object.is(snapshot, value)) return
        snapshot = value
        for (const listener of listeners) listener()
      },
    }
  }
  const selection = source({ page: 'plugins' })
  let explicitNavigation = 0
  function change(next) {
    const previous = selection.getSnapshot()
    if (Object.entries(next).every(([key, value]) => previous[key] === value)) return
    selection.set({ ...previous, ...next })
  }
  /** Select a plugin subpage; callers control whether its main panel should open. */
  function selectPage(page) {
    if (!['plugins', 'skills', 'mcp'].includes(page)) throw new Error('Unknown plugin subpage')
    change({ page })
  }
  /** Open one of the owned Plugins pages. */
  function openPage(ctx, page = 'plugins') {
    selectPage(page)
    explicitNavigation++
    try { ctx.layout.selectPanel('plugins') } finally { explicitNavigation-- }
  }
  /** Open the owned discovery page; updater guidance uses this without the retired market service. */
  function openMarket(ctx) {
    change({ page: 'plugins' })
    explicitNavigation++
    try { ctx.layout.selectPanel('plugins') } finally { explicitNavigation-- }
  }
  function MarketPage({ t, locale, officialPackages = [], resolveText, onConfigure, onSetEnabled, officialBusy = [], officialNotice, onRefreshOfficial }) {
    const [catalog, setCatalog] = useState({ plugins: [], categories: {} })
    const [state, setState] = useState(null)
    const [query, setQuery] = useState('')
    const [installSpec, setInstallSpec] = useState('')
    const [category, setCategory] = useState('')
    const [filter, setFilter] = useState('all')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(24)
    const [selectedId, setSelectedId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [restarting, setRestarting] = useState(false)
    const [error, setError] = useState(null)
    const [notice, setNotice] = useState(null)
    const requests = useRef(new Set())
    const mounted = useRef(false)
    const message = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key))
    const localized = value => typeof value === 'string' ? value : value?.[locale] ?? value?.zh ?? value?.en ?? ''
    const metadataText = value => value === undefined ? '' : resolveText ? resolveText(value) : localized(value)
    async function request(path, body) {
      const controller = new AbortController()
      requests.current.add(controller)
      try {
        const response = await fetch(`/dsh-app/market/${path}`, {
          method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
        const value = await response.json()
        if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : value.error?.message ?? t('operationFailed'))
        if (!value || typeof value !== 'object') throw new Error(t('invalidResponse'))
        return value
      } finally { requests.current.delete(controller) }
    }
    async function readState() {
      const next = await request('state')
      if (!Array.isArray(next.installed) || !Array.isArray(next.pending)) throw new Error(t('invalidResponse'))
      if (mounted.current) setState(next)
      return next
    }
    async function load() {
      onRefreshOfficial?.()
      if (mounted.current) { setLoading(true); setError(null) }
      const results = await Promise.allSettled([request('catalog'), readState()])
      if (!mounted.current) return
      if (results[0].status === 'fulfilled' && Array.isArray(results[0].value.plugins)) setCatalog(results[0].value)
      else setError(results[0].status === 'rejected' ? String(results[0].reason.message) : t('invalidResponse'))
      if (results[1].status === 'rejected') setError(String(results[1].reason.message))
      setLoading(false)
    }
    useEffect(() => {
      mounted.current = true
      void load()
      const focus = () => { void readState().catch(reason => { if (mounted.current) setError(reason.message) }) }
      window.addEventListener('focus', focus)
      return () => {
        mounted.current = false
        window.removeEventListener('focus', focus)
        for (const controller of requests.current) controller.abort()
        requests.current.clear()
      }
    }, [])
    async function action(path, body) {
      if (busy || restarting) return
      setBusy(true); setError(null); setNotice(null)
      try {
        const value = await request(path, body)
        if (path === 'operations' && typeof value.operationId !== 'string') throw new Error(t('invalidResponse'))
        if (path === 'check-updates') {
          if (!Array.isArray(value.installed) || !Array.isArray(value.pending)) throw new Error(t('invalidResponse'))
          if (mounted.current) setState(value)
        } else await readState()
        if (mounted.current && path === 'operations') setNotice(t('queued'))
      } catch (reason) { if (mounted.current && reason.name !== 'AbortError') setError(reason.message) }
      finally { if (mounted.current) setBusy(false) }
    }
    async function restart() {
      if (busy || restarting || state?.capabilities?.restart !== true) return
      setRestarting(true); setError(null)
      try { await request('restart', {}) }
      catch (reason) { if (mounted.current) { setRestarting(false); setError(reason.message) } }
    }
    const official = useMemo(() => new Map(officialPackages.filter(item => !['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].includes(item.name)).map(item => [item.name, item])), [officialPackages])
    const installed = useMemo(() => {
      const items = new Map((state?.installed ?? []).map(item => [item.name, item]))
      for (const pkg of official.values()) {
        const previous = items.get(pkg.name)
        if (previous || pkg.installed || pkg.enabled) items.set(pkg.name, { ...previous, name: pkg.name, version: previous?.version ?? pkg.version, enabled: pkg.enabled, phase: pkg.error ? 'failed' : pkg.enabled ? 'active' : 'disabled', protected: previous?.protected ?? pkg.readOnlyReason !== undefined, shipped: !previous && !pkg.installed })
      }
      return items
    }, [state, official])
    const pending = useMemo(() => new Map((state?.pending ?? []).map(item => [item.packageName, item])), [state])
    const rows = useMemo(() => {
      const items = new Map()
      for (const item of catalog.plugins) {
        const key = item.packageName || item.id
        if (typeof key === 'string') items.set(key, item)
      }
      for (const item of installed.values()) if (!items.has(item.name)) items.set(item.name, { packageName: item.name, name: item.name, version: item.version, description: item.description })
      for (const pkg of official.values()) {
        const previous = items.get(pkg.name)
        items.set(pkg.name, { ...previous, packageName: pkg.name, name: metadataText(pkg.meta?.title) || previous?.name || pkg.name, description: metadataText(pkg.meta?.description) || previous?.description || '', version: pkg.version ?? previous?.version, url: pkg.name.startsWith('@deepseek-ai/') ? officialRepository : previous?.url, officialPackage: pkg, id: pkg.name })
      }
      const needle = query.trim().toLocaleLowerCase()
      return [...items.values()].filter(item => {
        const own = installed.get(item.packageName)
        const categories = Array.isArray(item.category) ? item.category : [item.category]
        if (filter === 'installed' && !own) return false
        if (filter === 'updates' && own?.updateAvailable !== true) return false
        if (filter === 'available' && own) return false
        if (category && !categories.includes(category)) return false
        return !needle || `${localized(item.name)} ${item.packageName || item.install || item.id} ${localized(item.description)}`.toLocaleLowerCase().includes(needle)
      }).sort((left, right) => Number(isOfficialPackage(right)) - Number(isOfficialPackage(left)) || Number(!installed.has(left.packageName)) - Number(!installed.has(right.packageName)))
    }, [catalog, installed, official, filter, query, category, locale, resolveText])
    const pages = Math.max(1, Math.ceil(rows.length / pageSize))
    const current = Math.min(page, pages)
    const visible = rows.slice((current - 1) * pageSize, current * pageSize)
    const categoryIds = [...new Set(catalog.plugins.flatMap(item => Array.isArray(item.category) ? item.category : typeof item.category === 'string' ? [item.category] : []))]
    const pendingLabel = kind => t(kind === 'install' ? 'pendingInstall' : kind === 'update' ? 'pendingUpdate' : 'pendingUninstall')
    const operation = state?.operation
    const operationLabel = operation ? t(operation.state === 'queued' ? 'queuedState' : operation.state === 'running' ? 'runningState' : operation.state === 'succeeded' ? 'succeededState' : operation.state === 'cancelled' ? 'cancelledState' : 'operationFailed') : ''
    const identityOf = item => item.packageName || item.id
    const selected = rows.find(item => identityOf(item) === selectedId)
    const urlOf = item => { try { const url = new URL(item.url); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null } }
    const kindOf = item => isOfficialPackage(item) ? 'official' : installed.get(item.packageName)?.source === 'local' ? 'local' : 'community'
    const statusOf = item => {
      const own = installed.get(item.packageName), queued = pending.get(item.packageName)
      return queued ? pendingLabel(queued.kind) : own ? t(own.phase === 'failed' ? 'failed' : own.enabled === false ? 'disabled' : 'installedFilter') : item.officialPackage ? t(item.officialPackage.error ? 'failed' : item.officialPackage.enabled ? 'active' : 'disabled') : t(kindOf(item))
    }
    const openDetails = item => {
      if (item.officialPackage && onConfigure) onConfigure(item.packageName)
      else setSelectedId(identityOf(item))
    }
    const actionsFor = item => {
      const own = installed.get(item.packageName), queued = pending.get(item.packageName)
      const disabled = busy || restarting || officialBusy.includes(item.packageName)
      if (queued) return h('span', { className: 'dsh-app-market-badge' }, pendingLabel(queued.kind))
      if (item.officialPackage && (!own || own.shipped)) return h('button', { type: 'button', disabled: disabled || item.officialPackage.readOnlyReason !== undefined, onClick: () => onSetEnabled?.(item.packageName, !item.officialPackage.enabled) }, t(item.officialPackage.enabled ? 'disable' : 'enable'))
      if (!own) return h('button', { type: 'button', disabled: disabled || state?.capabilities?.install !== true, onClick: () => action('operations', item.packageName ? { kind: 'install', packageName: item.packageName } : { kind: 'install', spec: item.install }) }, t('install'))
      return h(ReactFragment, {},
        own.updateAvailable === true ? h('button', { type: 'button', disabled: disabled || state?.capabilities?.update !== true, onClick: () => action('operations', { kind: 'update', packageName: item.packageName }) }, t('update')) : null,
        item.officialPackage && onConfigure ? h('button', { type: 'button', disabled, onClick: () => onConfigure(item.packageName) }, t('configure')) : null,
        own.protected !== true && item.packageName !== 'dsh-app' ? h('button', { type: 'button', disabled: disabled || state?.capabilities?.uninstall !== true, onClick: () => action('operations', { kind: 'uninstall', packageName: item.packageName }) }, t('uninstall')) : h('small', {}, t('managedByApp')))
    }
    return h('section', { className: 'dsh-app-market', 'data-dsh-app-market': '' },
      officialNotice ? h('div', { className: `dsh-app-market-notice${officialNotice.failed ? ' dsh-app-market-error' : ''}`, role: officialNotice.failed ? 'alert' : 'status' }, h('span', {}, officialNotice.text), officialNotice.restart && state?.capabilities?.restart === true ? h('button', { type: 'button', disabled: busy || restarting, onClick: restart }, t(restarting ? 'restarting' : 'restart')) : null) : null,
      state?.pending?.length ? h('div', { className: 'dsh-app-market-notice', role: 'status' },
        h('strong', {}, message('pending', { count: state.pending.length })),
        state.capabilities?.restart === true ? h('button', { type: 'button', disabled: busy || restarting, onClick: restart }, t(restarting ? 'restarting' : 'restart')) : h('span', {}, t('manualRestart')),
        h('details', { className: 'dsh-app-market-pending' }, h('summary', {}, t('pendingDetails')), ...state.pending.map(item => h('div', { key: item.packageName }, h('small', {}, `${item.packageName} · ${pendingLabel(item.kind)}`), h('button', { type: 'button', disabled: busy || restarting, onClick: () => action('cancel', { packageName: item.packageName }) }, t('cancel')))))) : null,
      h('div', { className: 'dsh-app-market-toolbar' },
        h('input', { type: 'search', value: query, placeholder: t('search'), 'aria-label': t('search'), onChange: event => { setQuery(event.target.value); setPage(1) } }),
        h('select', { value: category, 'aria-label': t('allCategories'), onChange: event => { setCategory(event.target.value); setPage(1) } }, h('option', { value: '' }, t('allCategories')), ...categoryIds.map(id => h('option', { key: id, value: id }, localized(catalog.categories?.[id]) || id))),
        h('button', { type: 'button', disabled: busy || restarting, onClick: load }, t('refresh')),
        h('button', { type: 'button', disabled: busy || restarting, onClick: () => action('check-updates', {}) }, t(busy ? 'checking' : 'checkUpdates'))),
      h('details', { className: 'dsh-app-market-source-disclosure' }, h('summary', {}, t('sourceInstallTitle')), h('form', { className: 'dsh-app-market-source', onSubmit: event => { event.preventDefault(); if (installSpec.trim()) void action('operations', { kind: 'install', spec: installSpec.trim() }) } },
        h('input', { value: installSpec, placeholder: t('sourcePlaceholder'), 'aria-label': t('installSource'), onChange: event => setInstallSpec(event.target.value), disabled: busy || restarting }),
        h('button', { type: 'submit', disabled: busy || restarting || !installSpec.trim() || state?.capabilities?.install !== true }, t('installSource')))),
      h('div', { className: 'dsh-app-market-filters' }, ...[['all', 'allPlugins'], ['installed', 'installedFilter'], ['updates', 'updatesFilter'], ['available', 'availableFilter']].map(([id, key]) => h('button', { key: id, type: 'button', 'aria-label': t(key), 'aria-pressed': filter === id, onClick: () => { setFilter(id); setPage(1) } }, t(key), id === 'installed' || id === 'updates' ? h('span', { className: 'dsh-app-market-count' }, id === 'installed' ? installed.size : [...installed.values()].filter(row => row.updateAvailable).length) : null))),
      error ? h('div', { className: 'dsh-app-market-notice dsh-app-market-error', role: 'alert' }, h('span', {}, error), h('button', { type: 'button', disabled: busy || restarting, onClick: load }, t('retry'))) : null,
      notice ? h('p', { className: 'dsh-app-market-status', role: 'status' }, notice) : null,
      operation ? h('p', { className: `dsh-app-market-status${operation.state === 'failed' ? ' dsh-app-market-error' : ''}` }, `${t('operation')}: ${operation.packageName ?? ''} · ${operationLabel}${operation.detail ? ` · ${operation.detail}` : ''}${operation.error ? ` · ${typeof operation.error === 'string' ? operation.error : operation.error.message ?? ''}` : ''}`) : null,
      loading ? h('p', { className: 'dsh-app-market-status', role: 'status' }, t('loading')) : null,
      catalog.stale ? h('p', { className: 'dsh-app-market-status', role: 'status' }, t('staleCatalog')) : null,
      !loading && !visible.length ? h('p', { className: 'dsh-app-market-status' }, t('noResults')) : null,
      h('div', { className: 'dsh-app-market-content', 'data-has-detail': selected ? 'true' : undefined }, h('div', { className: 'dsh-app-market-grid' }, visible.map(item => {
        const own = installed.get(item.packageName), queued = pending.get(item.packageName)
        let url = null
        try { const parsed = new URL(item.url); if (parsed.protocol === 'https:') url = parsed.href } catch { /* Catalog rows without a valid HTTPS project URL have no external link. */ }
        const identity = item.packageName || item.id
        return h('article', { key: identity, className: 'dsh-app-market-card', 'data-dsh-app-market-package': identity, 'data-dsh-app-plugin-source': kindOf(item) },
          h('button', { type: 'button', className: 'dsh-app-market-card-head', onClick: () => openDetails(item), 'aria-label': `${t('details')}: ${localized(item.name) || identity}` }, h('span', { className: 'dsh-app-market-artwork', 'aria-hidden': true }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }, h('path', { d: 'M9 3h6v5h5v6h-5v7H9v-7H4V8h5Z' }))), h('span', {}, h('h3', {}, localized(item.name) || identity), h('small', {}, statusOf(item)))), h('p', {}, localized(item.description) || t('noDescription')),
          isOfficialPackage(item) ? h('div', { className: 'dsh-app-market-origin' }, h('span', { className: 'dsh-app-market-origin-badge' }, t('officialSource')), item.officialPackage && !item.officialPackage.installed ? h('small', {}, t(item.officialPackage.optional ? 'optionalOfficial' : 'shippedOfficial')) : null) : null,
          h('small', {}, `${t('version')}: ${own?.version ?? item.version ?? '—'}${own?.updateAvailable && own.latestVersion ? ` → ${own.latestVersion}` : ''}`),
          h('footer', {}, actionsFor(item),
          url ? h('a', { href: url, target: '_blank', rel: 'noreferrer noopener' }, t('source')) : null))
      })), selected ? h('aside', { className: 'dsh-app-market-detail', 'aria-label': t('details') }, h('header', {}, h('h2', {}, localized(selected.name)), h('button', { type: 'button', 'aria-label': t('closeDetails'), onClick: () => setSelectedId(null) }, '×')), h('p', { className: 'dsh-app-market-detail-id' }, identityOf(selected)), h('small', {}, `${t(kindOf(selected))} · ${statusOf(selected)}`), h('h3', {}, t('description')), h('p', {}, localized(selected.description) || t('noDescription')), h('p', {}, `${t('version')}: ${installed.get(selected.packageName)?.version ?? selected.version ?? '—'}`), selected.owner ? h('p', {}, `${t('author')}: ${selected.owner}`) : null, h('div', { className: 'dsh-app-market-detail-actions' }, actionsFor(selected)), urlOf(selected) ? h('a', { href: urlOf(selected), target: '_blank', rel: 'noreferrer noopener' }, t('source')) : null) : null),
      h('footer', { className: 'dsh-app-market-pager' }, h('label', {}, t('perPage'), ' ', h('select', { value: pageSize, onChange: event => { setPageSize(Number(event.target.value)); setPage(1) } }, ...[12, 24, 48].map(size => h('option', { key: size, value: size }, size)))),
        h('span', {}, message('pageCount', { page: current, pages, count: rows.length })),
        h('button', { type: 'button', disabled: current <= 1, onClick: () => setPage(current - 1) }, t('previous')),
        h('button', { type: 'button', disabled: current >= pages, onClick: () => setPage(current + 1) }, t('next'))))
  }
  function PluginsPage({ t, locale, renderOfficial, officialView, marketProps, workspaces, pickDirectory, mcpT, onPrompt, onBrowse }) {
    const state = useSyncExternalStore(selection.subscribe, selection.getSnapshot)
    const activeTab = state.page
    const tabs = [['plugins', 'pluginsTab'], ['skills', 'skillsTab'], ['mcp', 'mcpTab']]
    let content
    if (state.page === 'plugins') {
      content = officialView && officialView.kind !== 'list'
        ? h('div', { className: 'dsh-app-plugin-configuration' }, h('button', { type: 'button', className: 'dsh-app-plugin-back', onClick: onBrowse }, '← ', t('pluginsTab')), renderOfficial())
        : h(MarketPage, { t, locale, ...marketProps })
    } else if (state.page === 'mcp') {
      content = h(mcpClient.McpPage, { t: mcpT ?? (key => mcpClient.dictionaries[locale]?.[key] ?? mcpClient.dictionaries.en[key]), onPrompt })
    } else {
      content = h(skillsClient.SkillsPage, { t, workspaces, pickDirectory })
    }
    return h('section', { className: 'dsh-app-plugin-pages', 'data-dsh-app-plugin-page': state.page },
      h('header', { className: 'dsh-app-plugin-pages-head' }, h('h1', {}, t('title')),
        h('nav', { className: 'dsh-app-plugin-pages-nav', role: 'tablist', 'aria-label': t('pages') },
          tabs.map(([page, key]) => h('button', { key: page, type: 'button', role: 'tab', 'aria-selected': activeTab === page,
            onClick: () => { selectPage(page); if (page === 'plugins') onBrowse?.() },
            'data-dsh-app-plugin-tab': page }, t(key))))),
      h('div', { className: 'dsh-app-plugin-pages-body' }, content))
  }
  /** Preserve the winning Plugins entry and add owned pages without changing its Store or child slots. */
  function install(ctx) {
    let decorated = null
    let disposed = false
    let publishing = false
    const localeSource = { subscribe: listener => ctx.locale.subscribe(listener), getSnapshot: () => ctx.locale.getLocale() }
    const t = ctx.locale.bind(NS)
    const winner = key => ctx.slots.entries('main').filter(entry => entry.options.key === key)
      .sort((left, right) => (left.options.priority ?? 0) - (right.options.priority ?? 0))[0]
    function publish(entry) {
      if (!ctx.slots.entries('main').includes(entry)) return
      const priority = Math.max(...ctx.slots.entries('main').map(value => value.options.priority ?? 0)) + 1
      publishing = true
      try { ctx.slots.register({ name: 'main', key: entry.options.key, priority }, () => null)() }
      finally { publishing = false }
    }
    function restore() {
      if (!decorated) return
      const { entry, original, wrapper } = decorated
      decorated = null
      if (entry.component === wrapper) { entry.component = original; publish(entry) }
    }
    function sync() {
      if (disposed || publishing) return
      const entry = winner('plugins')
      if (decorated?.entry !== entry || (decorated && entry.component !== decorated.wrapper)) {
        restore()
        if (entry) {
          const original = entry.component
          function WrappedPlugins(props) {
            const [operationError, setOperationError] = useState(null)
            const pendingRequests = useRef(new Set())
            useEffect(() => () => { for (const request of pendingRequests.current) request.abort(); pendingRequests.current.clear() }, [])
            const uninstall = async packageName => {
              const controller = new AbortController()
              pendingRequests.current.add(controller)
              setOperationError(null)
              try {
                const response = await fetch('/dsh-app/market/operations', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'uninstall', packageName }), signal: controller.signal })
                const result = await response.json()
                if (!response.ok) throw new Error(result.error?.message ?? result.error ?? t('operationFailed'))
                if (typeof result.operationId !== 'string') throw new Error(t('invalidResponse'))
                if (!controller.signal.aborted) { props.actions?.setView({ kind: 'list' }); openMarket(ctx) }
              } catch (error) {
                if (!controller.signal.aborted) setOperationError(error.message)
              } finally { pendingRequests.current.delete(controller) }
            }
            const locale = useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot)
            const view = props.useStore ? props.useStore(state => state.view) : undefined
            const manager = props.usePluginManager ? props.usePluginManager(state => state) : undefined
            useEffect(() => { props.ensure?.() }, [props.ensure])
            const managerNotice = manager?.notice
            const noticeKeys = { restart: 'restartNotice', overridden: 'overriddenNotice', cancelled: 'installCancelled', 'refresh-failed': 'refreshError' }
            const officialNotice = managerNotice && (noticeKeys[managerNotice.kind] || managerNotice.kind === 'failed') ? {
              text: managerNotice.kind === 'failed' ? `${t('operationFailed')}: ${managerNotice.reason || managerNotice.code || t('retry')}` : props.t?.(noticeKeys[managerNotice.kind], { name: managerNotice.packageName }) ?? t('manualRestart'),
              failed: managerNotice.kind === 'failed' || managerNotice.kind === 'refresh-failed', restart: managerNotice.kind === 'restart',
            } : null
            const sessions = props.useSessions ? props.useSessions(state => state) : undefined
            const workspaces = [...new Set(Object.values(sessions?.byId ?? {}).map(session => session.cwd).filter(path => typeof path === 'string' && path))]
            const previousView = useRef(view)
            useEffect(() => {
              if (previousView.current !== view && view?.kind !== undefined && view.kind !== 'list') change({ page: 'plugins' })
              previousView.current = view
            }, [view])
            return h(ReactFragment, {}, operationError ? h('p', { role: 'alert', className: 'dsh-app-market-error' }, operationError) : null,
              h(PluginsPage, { t, locale, officialView: view, onBrowse: () => props.actions?.setView({ kind: 'list' }),
                marketProps: { officialPackages: (manager?.packages ?? []).filter(pkg => pkg.installed || pkg.optional || pkg.error !== undefined), resolveText: props.resolveText,
                  officialBusy: manager?.busy ?? [], officialNotice, onRefreshOfficial: props.refresh,
                  onConfigure: props.actions ? name => props.actions.setView({ kind: 'package', name }) : undefined,
                  onSetEnabled: props.setEnabled ? (name, enabled) => props.setEnabled(name, enabled) : undefined },
                renderOfficial: () => h(original, { ...props, uninstall }), workspaces,
                mcpT: ctx.locale.bind(mcpClient.NS), onPrompt: async (text, workspaceId) => {
                  const sessionId = await ctx.uiWorkspace.connectWorkspace(workspaceId)
                  ctx.conversation.input.shell(sessionId).setDraft(text)
                  ctx.sessions.open(sessionId)
                  ctx.layout.selectPanel(null)
                },
                pickDirectory: ctx.uiWorkspace?.pickDirectory ? () => ctx.uiWorkspace.pickDirectory() : undefined }))
          }
          decorated = { entry, original, wrapper: WrappedPlugins }
          entry.component = WrappedPlugins
          publish(entry)
        }
      }
    }
    const onPage = event => {
      const page = event.detail?.page
      if (['plugins', 'skills', 'mcp'].includes(page)) openPage(ctx, page)
    }
    const offMain = ctx.slots.subscribe('main', sync)
    let previousPanel = ctx.layout.panelInfo.getSnapshot().activePanelId
    const offPanel = ctx.layout.panelInfo.subscribe(() => {
      const current = ctx.layout.panelInfo.getSnapshot().activePanelId
      if (current === 'plugins' && previousPanel !== current && !explicitNavigation) change({ page: 'plugins' })
      previousPanel = current
    })
    window.addEventListener(eventName, onPage)
    sync()
    return () => {
      disposed = true
      offMain()
      offPanel()
      window.removeEventListener(eventName, onPage)
      restore()
    }
  }
  return { NS, dictionaries, styles, eventName, PluginsPage, MarketPage, install, openPage, openMarket, selectPage }
}
