/**
 * Render owned MCP navigation and explicit operations against the integrated Host.
 * @param require - browser module loader supplying React.
 * @returns component, dictionaries and locale namespace for the root slot installer.
 */
export default function createMcpClient(require) {
  const { createElement: h, useEffect, useMemo, useRef, useState } = require('react')
  const NS = 'dshAppMcp'
  const dictionaries = {
    zh: {
      title: 'MCP', connected: '已连接', catalog: '目录', tools: '工具', settings: '设置', add: '添加连接', refresh: '刷新', search: '搜索',
      allCategories: '全部分类', allConnections: '全部连接', workspace: '工作区', global: '全局', project: '指定工作区',
      empty: '没有匹配的内容。', select: '选择一项以查看详情。', loading: '正在读取…', working: '正在处理…', failed: '操作失败', invalid: 'MCP 服务返回了无效数据。',
      name: '名称', serverName: '服务标识', description: '描述', transport: '传输方式', url: '服务 URL', command: '命令', args: '参数（JSON 数组）', env: '环境变量（JSON）', cwd: '工作目录', headers: '请求头（JSON）',
      auth: '认证方式', none: '无需认证', bearer: 'Bearer Token', apiKey: 'API Key', apiKeyHeader: 'API Key 请求头', credential: '凭据',
      manual: '自定义服务', json: 'JSON 导入', sourceUrl: '从 URL 安装', source: '目录 URL', jsonContent: 'JSON 配置', upload: '读取 JSON 文件', privateNetwork: '允许局域网 HTTP',
      connect: '连接', authorize: '授权并连接', reauthorize: '重新授权', configure: '配置并连接', enable: '启用', disable: '停用', reconnect: '重新连接', rename: '重命名', edit: '编辑配置', disconnect: '断开连接',
      save: '保存', cancel: '取消', apply: '应用', preview: '预览影响', confirmDisconnect: '确认断开连接', disconnected: '已断开', enabled: '已启用', disabled: '已停用', unknown: '状态未知',
      healthy: '已连接', configured: '已配置', reauth: '需重新授权', recovering: '正在重试', degraded: '部分异常', unavailable: '连接异常', pending: '等待发现', success: '已发现', failedStatus: '发现失败',
      oauthWait: '请在浏览器完成授权，完成后这里会更新。', check: '检查连接', discover: '发现工具', inputSchema: '参数定义', cached: '最近成功缓存', stale: '缓存较旧', unobserved: '尚未观察到工具', schemaTruncated: '参数定义已裁剪',
      policy: '调用策略', connectionPolicy: '连接策略', serverPolicy: '服务策略', toolPolicy: '工具策略', inherit: '继承', allow: '允许', deny: '拒绝', enforcement: '执行拦截', supported: '可用', unsupported: '不可用',
      scope: '可见范围', keepScope: '保留当前范围', move: '移动', copy: '复制', scopeMode: '范围操作', policyHistory: '策略历史', scopeHistory: '范围历史', rollback: '回滚', revision: '版本',
      backups: '备份与恢复', export: '导出配置', download: '下载 JSON', copyText: '复制', copied: '已复制', snapshot: '创建快照', snapshotLabel: '快照名称', snapshots: '本机快照', restore: '恢复', previewRestore: '预览恢复',
      backupHint: '导出文件不含已有密钥；OAuth 连接在其他设备上需要重新授权。', restoreUnavailable: '此快照需要重新授权后才能恢复。', retainedSecret: '保留 <KEEP_EXISTING> 标记可继续使用已有凭据。',
      diagnostics: '诊断', migrations: '旧授权迁移', migrationScan: '检查旧授权', migrate: '迁移所选授权', diagnosticResult: '检查结果', toolCount: '工具数', previous: '上一页', next: '下一页',
      homepage: '主页', templates: '试用模板', send: '带入新对话', promptText: '模板内容', required: '请填写必填项。', invalidJson: '请输入有效的 JSON。', fileTooLarge: 'JSON 文件不能超过 1 MiB。',
    },
    en: {
      title: 'MCP', connected: 'Connected', catalog: 'Catalog', tools: 'Tools', settings: 'Settings', add: 'Add connection', refresh: 'Refresh', search: 'Search',
      allCategories: 'All categories', allConnections: 'All connections', workspace: 'Workspace', global: 'Global', project: 'Selected workspace',
      empty: 'No matching items.', select: 'Select an item to view details.', loading: 'Loading…', working: 'Working…', failed: 'Operation failed', invalid: 'The MCP service returned invalid data.',
      name: 'Name', serverName: 'Server identifier', description: 'Description', transport: 'Transport', url: 'Server URL', command: 'Command', args: 'Arguments (JSON array)', env: 'Environment (JSON)', cwd: 'Working directory', headers: 'Headers (JSON)',
      auth: 'Authentication', none: 'No authentication', bearer: 'Bearer token', apiKey: 'API key', apiKeyHeader: 'API key header', credential: 'Credential',
      manual: 'Custom server', json: 'Import JSON', sourceUrl: 'Install from URL', source: 'Catalog URL', jsonContent: 'JSON configuration', upload: 'Read JSON file', privateNetwork: 'Allow private-network HTTP',
      connect: 'Connect', authorize: 'Authorize and connect', reauthorize: 'Reauthorize', configure: 'Configure and connect', enable: 'Enable', disable: 'Disable', reconnect: 'Reconnect', rename: 'Rename', edit: 'Edit configuration', disconnect: 'Disconnect',
      save: 'Save', cancel: 'Cancel', apply: 'Apply', preview: 'Preview impact', confirmDisconnect: 'Confirm disconnect', disconnected: 'Disconnected', enabled: 'Enabled', disabled: 'Disabled', unknown: 'Unknown',
      healthy: 'Connected', configured: 'Configured', reauth: 'Reauthorization needed', recovering: 'Retrying', degraded: 'Partially unavailable', unavailable: 'Unavailable', pending: 'Discovery pending', success: 'Discovered', failedStatus: 'Discovery failed',
      oauthWait: 'Complete authorization in your browser. This page will update afterwards.', check: 'Check connection', discover: 'Discover tools', inputSchema: 'Input schema', cached: 'Last successful cache', stale: 'Older cache', unobserved: 'Tools not observed yet', schemaTruncated: 'Input schema was truncated',
      policy: 'Invocation policy', connectionPolicy: 'Connection policy', serverPolicy: 'Server policy', toolPolicy: 'Tool policy', inherit: 'Inherit', allow: 'Allow', deny: 'Deny', enforcement: 'Execution guard', supported: 'Available', unsupported: 'Unavailable',
      scope: 'Visibility', keepScope: 'Keep current scope', move: 'Move', copy: 'Copy', scopeMode: 'Scope operation', policyHistory: 'Policy history', scopeHistory: 'Scope history', rollback: 'Roll back', revision: 'Revision',
      backups: 'Backup and recovery', export: 'Export configuration', download: 'Download JSON', copyText: 'Copy', copied: 'Copied', snapshot: 'Create snapshot', snapshotLabel: 'Snapshot name', snapshots: 'Local snapshots', restore: 'Restore', previewRestore: 'Preview recovery',
      backupHint: 'Exports omit existing secrets. OAuth connections require authorization on another device.', restoreUnavailable: 'This snapshot requires reauthorization before it can be restored.', retainedSecret: 'Keep <KEEP_EXISTING> markers to retain existing credentials.',
      diagnostics: 'Diagnostics', migrations: 'Legacy authorization', migrationScan: 'Check legacy grants', migrate: 'Migrate selected grants', diagnosticResult: 'Check results', toolCount: 'Tools', previous: 'Previous', next: 'Next',
      homepage: 'Homepage', templates: 'Try a template', send: 'Use in a new conversation', promptText: 'Template text', required: 'Complete the required fields.', invalidJson: 'Enter valid JSON.', fileTooLarge: 'JSON files must not exceed 1 MiB.',
    },
  }
  function icon(kind = 'mcp') {
    const paths = { mcp: ['M3 3h4V1a2 2 0 0 1 4 0v2h3v4h-2a2 2 0 0 0 0 4h2v3h-4v-2a2 2 0 0 0-4 0v2H3v-4H1a2 2 0 0 1 0-4h2z'],
      plus: ['M8 3v10M3 8h10'], search: ['M11 6a5 5 0 1 1-10 0 5 5 0 0 1 10 0M10 10l4 4'], refresh: ['M13 5a5 5 0 1 0 .2 5M13 2v3h-3'],
      tool: ['M9 2a4 4 0 0 0-5 5l-3 5 3 3 5-5a4 4 0 0 0 5-5l-3 2-2-2z'], left: ['M10 3L5 8l5 5'], right: ['M6 3l5 5-5 5'] }
    return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, ...paths[kind].map((d, key) => h('path', { key, d })))
  }
  /** Retain original catalog artwork; local assets now belong to this plugin. */
  function ConnectorLogo({ value, fallback = 'mcp' }) {
    const [failed, setFailed] = useState(false)
    useEffect(() => setFailed(false), [value])
    let imageUrl = null
    if (typeof value === 'string') {
      const local = value.match(/^\/(?:mcp-connector\/ui|dsh-app\/mcp)\/assets\/(qcc-logo\.svg|pkulaw-logo\.png|wind-logo\.png)$/)
      if (local) imageUrl = `/dsh-app/mcp/assets/${local[1]}`
      else {
        try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) imageUrl = url.href } catch { /* Emoji artwork is text, not a URL. */ }
      }
    }
    const emoji = typeof value === 'string' && value.length <= 12 && /\p{Extended_Pictographic}/u.test(value) ? value : null
    return h('span', { className: 'dsh-app-mcp-logo', 'aria-hidden': true }, imageUrl && !failed
      ? h('img', { src: imageUrl, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onError: () => setFailed(true) })
      : emoji || icon(fallback))
  }
  const emptyDraft = () => ({ name: '', serverName: '', transport: 'streamable-http', url: '', command: '', args: '[]', envJson: '{}', cwd: '', headersJson: '{}', authMode: 'none', bearerToken: '', apiKeyHeader: 'X-Api-Key', apiKeyValue: '', json: '', source: '', scope: 'global', targetWorkspaceId: '', mode: 'move', credentials: {}, label: '' })
  const asItems = value => Array.isArray(value?.items) ? value.items : []
  const stringify = value => JSON.stringify(value, null, 2)

  function McpPage({ t, onPrompt }) {
    const [tab, setTab] = useState('connected')
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState('')
    const [workspaceId, setWorkspaceId] = useState('')
    const [connectionKey, setConnectionKey] = useState('')
    const [offset, setOffset] = useState(0)
    const [data, setData] = useState({ catalog: [], connections: [], scope: {}, governance: {}, snapshots: [] })
    const [explorer, setExplorer] = useState({ items: [], connections: [], total: 0 })
    const [selected, setSelected] = useState(null)
    const [tool, setTool] = useState(null)
    const [mode, setMode] = useState('detail')
    const [draft, setDraft] = useState(emptyDraft)
    const [pending, setPending] = useState(null)
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [notice, setNotice] = useState(null)
    const [report, setReport] = useState(null)
    const [migration, setMigration] = useState(null)
    const [migrationIds, setMigrationIds] = useState([])
    const [backup, setBackup] = useState('')
    const [prompt, setPrompt] = useState(null)
    const [promptValues, setPromptValues] = useState({})
    const mounted = useRef(false)
    const requests = useRef(new Set())
    const loadId = useRef(0)
    const toolsId = useRef(0)
    const detailId = useRef(0)
    const working = useRef(false)
    const context = useRef(null)
    const logo = (item, fallback) => h(ConnectorLogo, { value: item.icon || data.catalog.find(connector => connector.id === item.connectorId)?.icon, fallback })
    context.current = { tab, workspaceId, query, connectionKey, offset }
    async function call(method, params = {}, controller = new AbortController()) {
      requests.current.add(controller)
      try {
        const response = await fetch('/dsh-app/mcp/api', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params }), signal: controller.signal })
        const value = await response.json()
        if (!response.ok || value?.ok !== true) throw new Error(value?.message || value?.error?.message || t('failed'))
        return value
      } finally { requests.current.delete(controller) }
    }
    function fail(failure) { if (mounted.current && failure.name !== 'AbortError') setError(failure.message || t('failed')) }
    const params = () => context.current.workspaceId ? { workspaceId: context.current.workspaceId } : {}
    async function load() {
      const id = ++loadId.current
      const values = await Promise.allSettled([call('catalog', params()), call('status', params()), call('scopeContext', params()), call('governance')])
      if (!mounted.current || id !== loadId.current) return
      setData(previous => ({ ...previous,
        ...(values[0].status === 'fulfilled' ? { catalog: asItems(values[0].value.detail) } : {}),
        ...(values[1].status === 'fulfilled' ? { connections: asItems(values[1].value.detail) } : {}),
        ...(values[2].status === 'fulfilled' ? { scope: values[2].value.detail ?? {} } : {}),
        ...(values[3].status === 'fulfilled' ? { governance: values[3].value.detail ?? {} } : {}),
      }))
      for (const result of values) if (result.status === 'rejected') fail(result.reason)
      setLoading(false)
    }
    async function loadTools() {
      const id = ++toolsId.current
      const current = context.current
      try {
        const value = await call('toolExplorer', { ...params(), query: current.query, connectionKey: current.connectionKey || undefined, offset: current.offset, limit: 48 })
        if (mounted.current && id === toolsId.current) setExplorer(value.detail ?? { items: [], connections: [], total: 0 })
      } catch (failure) { if (id === toolsId.current) fail(failure) }
    }
    async function snapshots() { const value = await call('listSnapshots'); if (mounted.current) setData(previous => ({ ...previous, snapshots: asItems(value.detail) })) }
    async function run(action) {
      if (working.current) return
      working.current = true; setBusy(true); setError(null); setNotice(null)
      try {
        const value = await action()
        if (mounted.current && value?.message) setNotice(value.message)
        return value
      } catch (failure) { fail(failure) }
      finally { working.current = false; if (mounted.current) setBusy(false) }
    }
    async function mutate(method, input, nextMode = 'detail') {
      return run(async () => {
        if (method === 'connect' && data.catalog.find(item => item.id === input.connectorId)?.authMode === 'oauth2-pkce') setNotice(t('oauthWait'))
        const value = await call(method, input)
        if (!mounted.current) return value
        setMode(nextMode); setDraft(emptyDraft()); setPending(null)
        await load()
        if (context.current.tab === 'tools') await loadTools()
        if (context.current.tab === 'settings') await snapshots()
        return value
      })
    }
    useEffect(() => {
      mounted.current = true
      return () => { mounted.current = false; loadId.current++; toolsId.current++; detailId.current++; for (const controller of requests.current) controller.abort(); requests.current.clear() }
    }, [])
    useEffect(() => { setLoading(true); void load(); setSelected(null); setTool(null); setMode('detail'); setPending(null); setDraft(emptyDraft()) }, [workspaceId])
    useEffect(() => { if (tab === 'tools') { const timer = setTimeout(() => void loadTools(), 180); return () => clearTimeout(timer) } if (tab === 'settings') void snapshots().catch(fail) }, [tab, query, workspaceId, connectionKey, offset])
    useEffect(() => {
      if (typeof EventSource !== 'function') return
      const events = new EventSource('/dsh-app/mcp/events')
      let timer
      const update = () => { clearTimeout(timer); timer = setTimeout(() => { void load(); if (context.current.tab === 'tools') void loadTools() }, 250) }
      events.onmessage = update
      for (const name of ['connections', 'catalog', 'status', 'tools', 'governance', 'scope']) events.addEventListener(name, update)
      return () => { clearTimeout(timer); events.close() }
    }, [])
    const catalogItem = selected?.kind === 'catalog' ? data.catalog.find(item => item.id === selected.id) : null
    const connection = selected?.kind === 'connection' ? data.connections.find(item => item.key === selected.id) : null
    const categories = useMemo(() => [...new Set(data.catalog.map(item => item.category).filter(Boolean))].sort(), [data.catalog])
    const match = item => `${item.name ?? ''} ${item.summary ?? ''} ${item.description ?? ''} ${item.serverName ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const rows = tab === 'catalog' ? data.catalog.filter(item => (!category || item.category === category) && match(item)) : tab === 'connected' ? data.connections.filter(match) : explorer.items
    const button = (key, action, options = {}) => h('button', { type: 'button', disabled: busy, onClick: action, ...options }, options.children ?? t(key))
    const options = (values, labels = values) => values.map((value, index) => h('option', { key: value, value }, labels[index]))
    const field = (key, name, type = 'text', required = false) => h('label', { className: 'dsh-app-mcp-field' }, t(key), h('input', { name, type, required, value: draft[name] ?? '', onChange: event => setDraft(previous => ({ ...previous, [name]: event.target.value })) }))
    const area = (key, name = 'json') => h('label', { className: 'dsh-app-mcp-field' }, t(key), h('textarea', { className: 'dsh-app-mcp-code', name, value: draft[name] ?? '', onChange: event => setDraft(previous => ({ ...previous, [name]: event.target.value })), spellCheck: false }))
    const selectField = (key, name, values, labels = values) => h('label', { className: 'dsh-app-mcp-field' }, t(key), h('select', { name, value: draft[name], onChange: event => setDraft(previous => ({ ...previous, [name]: event.target.value })) }, ...options(values, labels)))
    const workspaces = data.scope.workspaces ?? []
    function scopeFields() { const retain = draft.scope === 'preserve' || (['credentials', 'connect'].includes(mode) && catalogItem?.connected?.length); return h('div', { className: 'dsh-app-mcp-scope' }, selectField('scope', 'scope', retain ? ['preserve', 'global', 'project'] : ['global', 'project'], retain ? [t('keepScope'), t('global'), t('project')] : [t('global'), t('project')]), draft.scope === 'project' ? h('label', { className: 'dsh-app-mcp-field' }, t('workspace'), h('select', { name: 'targetWorkspaceId', value: draft.targetWorkspaceId, required: true, onChange: event => setDraft(previous => ({ ...previous, targetWorkspaceId: event.target.value })) }, h('option', { value: '' }, t('workspace')), ...workspaces.map(item => h('option', { key: item.id, value: item.id }, item.title)))) : null) }
    const scopeInput = () => draft.scope === 'preserve' ? {} : draft.scope === 'project' ? { scope: 'project', workspaceId: draft.targetWorkspaceId } : { scope: 'global' }
    function navigate(nextTab) { detailId.current++; setTab(nextTab); setQuery(''); setOffset(0); setSelected(null); setTool(null); setMode('detail'); setPending(null); setError(null); setDraft(emptyDraft()); setPrompt(null) }
    function openMode(nextMode, value = {}) { setMode(nextMode); setDraft({ ...emptyDraft(), ...(['credentials', 'connect'].includes(nextMode) && catalogItem?.connected?.length ? { scope: 'preserve' } : {}), ...value }); setPending(null); setError(null) }
    async function selectItem(item) {
      detailId.current++; setMode('detail'); setPending(null); setDraft(emptyDraft()); setPrompt(null); setTool(null)
      if (tab === 'tools') {
        const id = detailId.current
        setSelected({ kind: 'tool', id: `${item.connectionKey}/${item.name}` })
        try { const value = await call('toolExplorerDetail', { ...params(), connectionKey: item.connectionKey, connectorId: item.connectorId, serverName: item.serverName, toolName: item.name }); if (mounted.current && id === detailId.current) setTool(value.detail?.tool ?? null) } catch (failure) { if (id === detailId.current) fail(failure) }
      } else setSelected({ kind: tab === 'catalog' ? 'catalog' : 'connection', id: item.key ?? item.id })
    }
    async function preview(method, input, applyMethod, applyInput = input) {
      return run(async () => { const value = await call(method, input); if (mounted.current) setPending({ method: applyMethod, input: applyInput, value, expectedRevision: value.detail?.baseRevision }); return value })
    }
    function policyControl(label, policyTarget, effect = 'inherit') {
      return h('label', { className: 'dsh-app-mcp-policy-row' }, t(label), h('select', { 'aria-label': t(label), value: effect, disabled: busy, onChange: event => preview('previewPolicy', { ...policyTarget, effect: event.target.value }, 'applyPolicy') }, ...options(['inherit', 'allow', 'deny'], [t('inherit'), t('allow'), t('deny')])))
    }
    async function submit(event) {
      event.preventDefault()
      if ((['edit', 'rename', 'scope'].includes(mode) && !connection) || (['credentials', 'connect'].includes(mode) && !catalogItem)) { setError(t('unavailable')); return }
      if (mode === 'manual') {
        let input = { name: draft.name, serverName: draft.serverName || draft.name, transport: draft.transport, ...scopeInput() }
        if (draft.transport === 'stdio') {
          try { const args = JSON.parse(draft.args); const env = JSON.parse(draft.envJson); if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string') || !env || Array.isArray(env) || typeof env !== 'object') throw new Error(); input = { ...input, command: draft.command, args, envJson: draft.envJson, cwd: draft.cwd, authMode: 'none' } } catch { setError(t('invalidJson')); return }
        } else input = { ...input, url: draft.url, authMode: draft.authMode, headersJson: draft.headersJson, ...(draft.authMode === 'bearer' ? { bearerToken: draft.bearerToken } : {}), ...(draft.authMode === 'api-key' ? { apiKeyHeader: draft.apiKeyHeader, apiKeyValue: draft.apiKeyValue } : {}), ...(draft.allowInsecurePrivateNetwork ? { allowInsecurePrivateNetwork: true } : {}) }
        await mutate('configure', input)
      } else if (mode === 'json' || mode === 'edit') {
        try { JSON.parse(draft.json) } catch { setError(t('invalidJson')); return }
        await mutate(mode === 'edit' ? 'reconfigureConnection' : 'importJson', mode === 'edit' ? { key: connection.key, json: draft.json } : { json: draft.json, ...scopeInput() })
      } else if (mode === 'url') await mutate('installFromUrl', { url: draft.source, ...scopeInput() })
      else if (mode === 'rename') await mutate('renameConnection', { key: connection.key, name: draft.name })
      else if (mode === 'credentials') await mutate('configure', { connectorId: catalogItem.id, credentialValues: draft.credentials, ...scopeInput() })
      else if (mode === 'connect') { if (catalogItem.authMode === 'oauth2-pkce') setNotice(t('oauthWait')); await mutate('connect', { connectorId: catalogItem.id, ...(draft.serverKey ? { serverKey: draft.serverKey } : {}), ...scopeInput() }) }
      else if (mode === 'scope') await preview('previewConnectionScope', { key: connection.key, mode: draft.mode, targetScope: draft.scope, ...(draft.scope === 'project' ? { targetWorkspaceId: draft.targetWorkspaceId } : {}) }, 'applyConnectionScope')
    }
    async function readJson(file) {
      if (!file) return
      if (file.size > 1024 * 1024) { setError(t('fileTooLarge')); return }
      try { const text = await file.text(); JSON.parse(text); if (mounted.current) setDraft(previous => ({ ...previous, json: text })) } catch { if (mounted.current) setError(t('invalidJson')) }
    }
    function download() {
      const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' })); link.href = url; link.download = 'dsh-mcp-connections.json'; link.click(); URL.revokeObjectURL(url)
    }
    async function copyText(text) { try { await navigator.clipboard.writeText(text); if (mounted.current) setNotice(t('copied')) } catch (failure) { fail(failure) } }
    function templateText() {
      const source = prompt?.text ?? prompt?.title ?? ''
      return source.replace(/\{\{\s*([A-Za-z][\w-]*)\s*\}\}|\{\s*([A-Za-z][\w-]*)\s*\}/g, (_match, doubleName, singleName) => String(promptValues[doubleName ?? singleName] ?? ''))
    }
    function promptSpecs(item) {
      const known = new Map([...(catalogItem?.promptVariables ?? []), ...(item.variables ?? [])].map(value => [value.name, value]))
      const names = [...new Set(Array.from(String(item.text || item.title || '').matchAll(/\{\{\s*([A-Za-z][\w-]*)\s*\}\}|\{\s*([A-Za-z][\w-]*)\s*\}/g), match => match[1] ?? match[2]))]
      return names.map(name => known.get(name) || { name, label: name, required: true })
    }
    let panel
    if (mode !== 'detail') {
      const title = { manual: 'manual', json: 'json', url: 'sourceUrl', rename: 'rename', edit: 'edit', credentials: 'configure', scope: 'scope', connect: 'connect' }[mode]
      panel = h('form', { className: 'dsh-app-mcp-form', onSubmit: submit, 'data-dsh-app-mcp-form': mode }, h('h2', {}, t(title)),
        mode === 'manual' ? h('div', {}, field('name', 'name', 'text', true), field('serverName', 'serverName'), selectField('transport', 'transport', ['streamable-http', 'stdio']),
          draft.transport === 'stdio' ? h('div', {}, field('command', 'command', 'text', true), area('args', 'args'), area('env', 'envJson'), field('cwd', 'cwd')) : h('div', {}, field('url', 'url', 'url', true), selectField('auth', 'authMode', ['none', 'bearer', 'api-key'], [t('none'), t('bearer'), t('apiKey')]), draft.authMode === 'bearer' ? field('bearer', 'bearerToken', 'password', true) : draft.authMode === 'api-key' ? h('div', {}, field('apiKeyHeader', 'apiKeyHeader', 'text', true), field('apiKey', 'apiKeyValue', 'password', true)) : null, area('headers', 'headersJson'), h('label', { className: 'dsh-app-mcp-field' }, h('input', { type: 'checkbox', checked: draft.allowInsecurePrivateNetwork ?? false, onChange: event => setDraft(previous => ({ ...previous, allowInsecurePrivateNetwork: event.target.checked })) }), t('privateNetwork'))), scopeFields()) : null,
        mode === 'json' || mode === 'edit' ? h('div', {}, area('jsonContent'), mode === 'edit' ? h('small', {}, t('retainedSecret')) : h('label', { className: 'dsh-app-mcp-field' }, t('upload'), h('input', { type: 'file', accept: '.json,application/json', 'aria-label': t('upload'), onChange: event => { const file = event.target.files?.[0]; event.target.value = ''; void readJson(file) } })), mode === 'json' ? scopeFields() : null) : null,
        mode === 'url' ? h('div', {}, field('source', 'source', 'url', true), scopeFields()) : null,
        mode === 'rename' ? field('name', 'name', 'text', true) : null,
        mode === 'credentials' ? h('div', {}, ...(catalogItem?.credentialFields?.length ? catalogItem.credentialFields : [{ key: 'credential', label: catalogItem?.credentialName || t('credential'), required: true }]).map(item => h('label', { key: item.key, className: 'dsh-app-mcp-field' }, item.label || item.key, h('input', { name: item.key, type: item.secret === false ? 'text' : 'password', required: item.required !== false, value: draft.credentials[item.key] || '', autoComplete: 'off', onChange: event => setDraft(previous => ({ ...previous, credentials: { ...previous.credentials, [item.key]: event.target.value } })) }))), scopeFields()) : null,
        mode === 'scope' ? h('div', {}, selectField('scopeMode', 'mode', ['move', 'copy'], [t('move'), t('copy')]), scopeFields()) : null,
        mode === 'connect' ? h('div', {}, catalogItem?.authMode === 'none' && catalogItem.servers?.length > 1 ? selectField('serverName', 'serverKey', catalogItem.servers.map(server => server.serverKey), catalogItem.servers.map(server => server.serverName || server.serverKey)) : null, scopeFields()) : null,
        h('div', { className: 'dsh-app-mcp-actions' }, h('button', { type: 'submit', disabled: busy }, t(mode === 'scope' ? 'preview' : mode === 'rename' || mode === 'edit' ? 'save' : 'configure')), button('cancel', () => { setMode('detail'); setDraft(emptyDraft()); setPending(null) })))
    } else if (tool) {
      const record = data.connections.find(item => item.key === tool.connectionKey)
      panel = h('article', { 'data-dsh-app-mcp-tool-detail': '' }, h('header', { className: 'dsh-app-mcp-detail-heading' }, icon('tool'), h('h2', {}, tool.title || tool.name)), h('p', {}, tool.description), h('p', { className: 'dsh-app-mcp-metadata' }, `${tool.serverName} · ${tool.name} · ${t(tool.stale ? 'stale' : 'cached')}`),
        record ? policyControl('toolPolicy', { scope: 'tool', connectorId: record.connectorId, serverName: tool.serverName, toolName: tool.name }, data.governance.rules?.find(item => item.scope === 'tool' && item.connectorId === record.connectorId && item.serverName === tool.serverName && item.toolName === tool.name)?.effect) : null,
        h('h3', {}, t('inputSchema')), tool.schemaTruncated ? h('small', {}, t('schemaTruncated')) : null, h('pre', { className: 'dsh-app-mcp-code' }, stringify(tool.inputSchema)))
    } else if (connection) {
      const descriptor = data.catalog.find(item => item.id === connection.connectorId)
      panel = h('article', { 'data-dsh-app-mcp-connection-detail': connection.key }, h('header', { className: 'dsh-app-mcp-detail-heading' }, logo(connection), h('div', {}, h('h2', {}, connection.name), h('small', {}, connection.serverName))), h('p', { className: 'dsh-app-mcp-metadata' }, `${connection.transport} · ${connection.endpoint || connection.url || ''}`), h('p', {}, t(connection.connectionState === 'failed' ? 'failedStatus' : dictionaries.zh[connection.connectionState] ? connection.connectionState : 'unknown')),
        connection.healthMessage || connection.lastError ? h('p', { className: 'dsh-app-mcp-notice' }, connection.healthMessage || connection.lastError) : null,
        h('div', { className: 'dsh-app-mcp-actions' }, button(connection.enabled ? 'disable' : 'enable', () => mutate('setEnabled', { key: connection.key, enabled: !connection.enabled })), button('reconnect', () => mutate('setEnabled', { key: connection.key, enabled: true })),
          descriptor?.authMode === 'oauth2-pkce' ? button('reauthorize', () => { setNotice(t('oauthWait')); void mutate('connect', { connectorId: descriptor.id }) }) : null,
          descriptor && ['bearer', 'api-key'].includes(descriptor.authMode) ? button('configure', () => { setSelected({ kind: 'catalog', id: descriptor.id }); openMode('credentials', { scope: 'preserve' }) }) : null,
          button('check', () => run(async () => { const value = await call('healthCheck', { connectorId: connection.connectorId, ...params(), ...(connection.enabled ? { connectionKey: connection.key } : {}) }); setReport(value.detail); await load(); return value })),
          button('discover', () => run(async () => { const value = await call('toolsList', { connectorId: connection.connectorId, connectionKey: connection.key, ...params() }); setReport(value.detail); return value })),
          connection.canRename ? button('rename', () => openMode('rename', { name: connection.name })) : null,
          connection.canEditConfiguration ? button('edit', () => run(async () => { const value = await call('editableConnectionConfig', { key: connection.key }); if (mounted.current) openMode('edit', { json: value.detail.json }); return value })) : null,
          button('disconnect', () => setPending({ method: 'disconnect', input: { key: connection.key }, value: { message: t('confirmDisconnect') } }))),
        h('section', { className: 'dsh-app-mcp-section' }, h('h3', {}, t('policy')), policyControl('connectionPolicy', { scope: 'connection', connectorId: connection.connectorId }, connection.connectionPolicy), policyControl('serverPolicy', { scope: 'server', connectorId: connection.connectorId, serverName: connection.serverName }, connection.serverPolicy?.configuredEffect), h('small', {}, `${t('enforcement')}: ${t(data.governance.capabilities?.executionGuard ? 'supported' : 'unsupported')}`)),
        h('section', { className: 'dsh-app-mcp-section' }, h('h3', {}, t('scope')), h('p', {}, connection.scope?.label || t('global')), button('scope', () => openMode('scope'))), report ? h('details', { className: 'dsh-app-mcp-section' }, h('summary', {}, t('diagnosticResult')), h('pre', { className: 'dsh-app-mcp-code' }, stringify(report))) : null)
    } else if (catalogItem) {
      panel = h('article', { 'data-dsh-app-mcp-catalog-detail': catalogItem.id }, h('header', { className: 'dsh-app-mcp-detail-heading' }, logo(catalogItem), h('div', {}, h('h2', {}, catalogItem.name), h('small', {}, [catalogItem.vendor, catalogItem.category].filter(Boolean).join(' · ')))), h('p', {}, catalogItem.description || catalogItem.summary),
        catalogItem.homepage && /^https?:\/\//.test(catalogItem.homepage) ? h('a', { href: catalogItem.homepage, target: '_blank', rel: 'noreferrer' }, t('homepage')) : null,
        ...(catalogItem.servers ?? []).map(server => h('p', { key: server.serverKey, className: 'dsh-app-mcp-metadata' }, `${server.serverName || server.serverKey} · ${server.transport} · ${server.url || server.command || ''}`)),
        h('div', { className: 'dsh-app-mcp-actions' }, ['bearer', 'api-key'].includes(catalogItem.authMode) ? button('configure', () => openMode('credentials')) : button(catalogItem.authMode === 'oauth2-pkce' ? 'authorize' : 'connect', () => { if (catalogItem.authMode === 'oauth2-pkce') setNotice(t('oauthWait')); void mutate('connect', { connectorId: catalogItem.id, ...(catalogItem.connected?.length ? {} : scopeInput()) }) }),
          button('scope', () => openMode(['bearer', 'api-key'].includes(catalogItem.authMode) ? 'credentials' : 'connect', { serverKey: catalogItem.servers?.[0]?.serverKey || '', targetWorkspaceId: workspaceId, scope: workspaceId ? 'project' : 'global' }))),
        (catalogItem.toolsSnapshot ?? []).map(server => h('section', { key: server.serverKey, className: 'dsh-app-mcp-section' }, h('h3', {}, server.serverName || server.serverKey), ...(server.tools ?? []).map(item => h('div', { key: item.name, className: 'dsh-app-mcp-tool-row' }, h('strong', {}, item.title || item.name), h('small', {}, item.description))))),
        catalogItem.prompts?.length ? h('section', { className: 'dsh-app-mcp-section' }, h('h3', {}, t('templates')), ...catalogItem.prompts.map((item, index) => button('preview', () => { setPrompt(item); setPromptValues(Object.fromEntries(promptSpecs(item).map(value => [value.name, value.default || '']))) }, { key: item.id ?? index, title: item.label || item.title, children: item.label || item.title || t('preview') }))) : null,
        prompt ? h('form', { className: 'dsh-app-mcp-form', onSubmit: event => { event.preventDefault(); if (onPrompt) void run(async () => { await onPrompt(templateText(), workspaceId || undefined); setPrompt(null) }) } },
          ...promptSpecs(prompt).map(item => h('label', { key: item.name, className: 'dsh-app-mcp-field' }, item.label || item.name, h('input', { required: item.required !== false, value: promptValues[item.name] || '', onChange: event => setPromptValues(previous => ({ ...previous, [item.name]: event.target.value })) }))), h('pre', { className: 'dsh-app-mcp-code' }, templateText()), h('div', { className: 'dsh-app-mcp-actions' }, button('copyText', () => copyText(templateText())), onPrompt ? h('button', { type: 'submit', disabled: busy || !catalogItem.connected?.length }, t('send')) : null)) : null)
    } else panel = h('div', { className: 'dsh-app-mcp-empty' }, icon(tab === 'tools' ? 'tool' : 'mcp'), h('p', {}, loading ? t('loading') : t('select')))
    const settings = h('div', { className: 'dsh-app-mcp-settings' },
      h('section', { className: 'dsh-app-mcp-section' }, h('h2', {}, t('backups')), h('p', { className: 'dsh-app-mcp-metadata' }, t('backupHint')),
        h('div', { className: 'dsh-app-mcp-actions' }, button('export', () => run(async () => { const value = await call('exportConfig'); if (mounted.current) setBackup(value.detail.json); return value })), button('json', () => { setTab('connected'); openMode('json') })),
        backup ? h('div', {}, h('textarea', { className: 'dsh-app-mcp-code', readOnly: true, value: backup, 'aria-label': t('export') }), h('div', { className: 'dsh-app-mcp-actions' }, button('download', download), button('copyText', () => copyText(backup)))) : null,
        h('form', { className: 'dsh-app-mcp-form', onSubmit: event => { event.preventDefault(); void run(async () => { const value = await call('createSnapshot', { label: draft.label }); await snapshots(); return value }) } }, field('snapshotLabel', 'label'), h('button', { type: 'submit', disabled: busy }, t('snapshot'))),
        h('h3', {}, t('snapshots')), ...data.snapshots.map(item => h('div', { key: item.id, className: 'dsh-app-mcp-snapshot' }, h('div', {}, h('strong', {}, item.reason), h('small', {}, `${new Date(item.createdAt).toLocaleString()} · ${item.existingCount}`)), button('previewRestore', () => preview('previewSnapshot', { snapshotId: item.id }, 'restoreSnapshot'), { disabled: busy || item.restorable === false }), item.requiresReauthorization ? h('small', {}, t('restoreUnavailable')) : null))),
      h('section', { className: 'dsh-app-mcp-section' }, h('h2', {}, t('policyHistory')), h('small', {}, `${t('revision')}: ${data.governance.revision ?? 0}`), ...(data.governance.history ?? []).map(item => h('div', { key: item.revision, className: 'dsh-app-mcp-policy-row' }, h('span', {}, `${t('revision')} ${item.revision} · ${item.ruleCount}`), button('rollback', () => setPending({ method: 'rollbackPolicy', input: { rollbackRevision: item.revision, expectedRevision: data.governance.revision }, value: { message: `${t('rollback')} ${t('revision')} ${item.revision}` } }))))),
      h('section', { className: 'dsh-app-mcp-section' }, h('h2', {}, t('scopeHistory')), ...(data.scope.history ?? []).map(item => h('div', { key: item.revision, className: 'dsh-app-mcp-policy-row' }, h('span', {}, `${t('revision')} ${item.revision} · ${item.bindingCount}`), button('rollback', () => preview('previewConnectionScopeRollback', { rollbackRevision: item.revision }, 'rollbackConnectionScope'))))),
      h('section', { className: 'dsh-app-mcp-section' }, h('h2', {}, t('diagnostics')), button('check', () => run(async () => { const value = await call('healthCheck'); if (mounted.current) setReport(value.detail); await load(); return value })), report ? h('pre', { className: 'dsh-app-mcp-code' }, stringify(report)) : null),
      h('section', { className: 'dsh-app-mcp-section' }, h('h2', {}, t('migrations')), button('migrationScan', () => run(async () => { const value = await call('migrationPreview', { scanStored: true }); if (mounted.current) { setMigration(value.detail); setMigrationIds([]) } return value })),
        ...(migration?.items ?? []).map(item => h('label', { key: item.candidateId || item.id, className: 'dsh-app-mcp-policy-row' }, h('input', { type: 'checkbox', disabled: !item.migratable || item.alreadyMigrated, checked: migrationIds.includes(item.candidateId || item.id), onChange: event => setMigrationIds(previous => event.target.checked ? [...previous, item.candidateId || item.id] : previous.filter(id => id !== (item.candidateId || item.id))) }), item.connectorName || item.sourcePlugin)), migration ? button('migrate', () => mutate('migrateLegacy', { candidateIds: migrationIds }), { disabled: busy || !migrationIds.length }) : null))
    return h('section', { className: 'dsh-app-mcp', 'data-dsh-app-mcp': '' },
      h('header', { className: 'dsh-app-mcp-page-head' }, h('h1', {}, t('title')), h('div', { className: 'dsh-app-mcp-actions' }, button('add', () => { setTab('connected'); openMode('manual') }), button('refresh', () => run(async () => { if (tab === 'catalog') await call('refreshCatalog'); await load(); if (tab === 'tools') await loadTools(); if (tab === 'settings') await snapshots() }), { 'aria-label': t('refresh') }))),
      h('nav', { className: 'dsh-app-mcp-nav', 'aria-label': t('title') }, ...['connected', 'catalog', 'tools', 'settings'].map(key => button(key, () => navigate(key), { key, 'aria-current': tab === key ? 'page' : undefined }))),
      tab !== 'settings' ? h('div', { className: 'dsh-app-mcp-toolbar' }, h('div', { className: 'dsh-app-mcp-search' }, icon('search'), h('input', { type: 'search', 'aria-label': t('search'), placeholder: t('search'), value: query, onChange: event => { setQuery(event.target.value); setOffset(0) } })),
        tab === 'catalog' ? h('select', { 'aria-label': t('allCategories'), value: category, onChange: event => setCategory(event.target.value) }, h('option', { value: '' }, t('allCategories')), ...options(categories)) : null,
        h('select', { 'aria-label': t('workspace'), value: workspaceId, disabled: busy, onChange: event => setWorkspaceId(event.target.value) }, h('option', { value: '' }, t('global')), ...workspaces.map(item => h('option', { key: item.id, value: item.id }, item.title))),
        tab === 'tools' ? h('select', { 'aria-label': t('allConnections'), value: connectionKey, onChange: event => { setConnectionKey(event.target.value); setOffset(0) } }, h('option', { value: '' }, t('allConnections')), ...explorer.connections.map(item => h('option', { key: item.connectionKey, value: item.connectionKey }, `${item.connectionName} · ${item.serverName}`))) : null,
        tab === 'connected' ? h('div', { className: 'dsh-app-mcp-actions' }, button('json', () => openMode('json')), button('sourceUrl', () => openMode('url'))) : null) : null,
      error ? h('p', { className: 'dsh-app-mcp-notice', 'data-error': 'true', role: 'alert' }, error) : null,
      busy || notice ? h('p', { className: 'dsh-app-mcp-notice', role: 'status' }, busy ? t('working') + (notice ? ` ${notice}` : '') : notice) : null,
      pending ? h('div', { className: 'dsh-app-mcp-dialog-backdrop', onKeyDown: event => { if (event.key === 'Escape' && !busy) setPending(null) } }, h('section', { className: 'dsh-app-mcp-dialog', 'data-dsh-app-mcp-preview': pending.method, role: 'dialog', 'aria-modal': true, 'aria-label': t('preview') }, h('h2', {}, t('preview')), h('p', {}, pending.value.message), pending.value.detail ? h('pre', { className: 'dsh-app-mcp-code' }, stringify(pending.value.detail)) : null,
        h('div', { className: 'dsh-app-mcp-actions' }, button(pending.method === 'restoreSnapshot' ? 'restore' : pending.method === 'disconnect' ? 'confirmDisconnect' : 'apply', () => mutate(pending.method, { ...pending.input, ...(pending.expectedRevision === undefined ? {} : { expectedRevision: pending.expectedRevision }) }), { disabled: busy || pending.value.detail?.canApply === false || pending.value.detail?.restorable === false, autoFocus: true }), button('cancel', () => setPending(null))))) : null,
      tab === 'settings' ? h('div', { className: 'dsh-app-mcp-content', 'data-wide': 'true' }, h('div', { className: 'dsh-app-mcp-detail' }, settings)) : h('div', { className: 'dsh-app-mcp-content' }, h('aside', { className: 'dsh-app-mcp-list' },
        h('div', { className: 'dsh-app-mcp-list-scroll' }, !rows.length ? h('p', { className: 'dsh-app-mcp-empty' }, loading ? t('loading') : t('empty')) : null,
        ...rows.map(item => h('button', { key: item.key || item.id || `${item.connectionKey}/${item.name}`, type: 'button', disabled: busy, className: 'dsh-app-mcp-row', 'data-dsh-app-mcp-row': item.key || item.id || `${item.connectionKey}/${item.name}`, 'aria-selected': selected?.id === (item.key || item.id || `${item.connectionKey}/${item.name}`), onClick: () => selectItem(item) }, logo(item, tab === 'tools' ? 'tool' : 'mcp'), h('span', { className: 'dsh-app-mcp-row-copy' }, h('strong', {}, item.title || item.name), h('small', {}, item.summary || item.description || item.serverName), h('small', { className: 'dsh-app-mcp-row-meta' }, tab === 'tools' ? `${item.serverName} · ${t(item.stale ? 'stale' : 'cached')}` : tab === 'catalog' ? item.category : `${item.scope?.label || t('global')} · ${t(item.enabled === false ? 'disabled' : dictionaries.zh[item.connectionState] ? item.connectionState : 'unknown')}`)))),
        ), tab === 'tools' ? h('footer', { className: 'dsh-app-mcp-actions dsh-app-mcp-pager' }, button('previous', () => setOffset(Math.max(0, offset - 48)), { disabled: busy || offset === 0 }), h('small', {}, `${offset + (rows.length ? 1 : 0)}–${offset + rows.length} / ${explorer.total}`), button('next', () => setOffset(offset + 48), { disabled: busy || offset + rows.length >= explorer.total })) : null,
        tab === 'tools' ? h('details', { className: 'dsh-app-mcp-section' }, h('summary', {}, t('discover')), ...explorer.connections.map(item => h('div', { key: item.connectionKey, className: 'dsh-app-mcp-tool-row' }, h('strong', {}, item.connectionName), h('small', {}, `${item.serverName} · ${item.toolCount} · ${t(item.status === 'failed' ? 'failedStatus' : dictionaries.zh[item.status] ? item.status : 'unknown')}`), h('div', { className: 'dsh-app-mcp-actions' }, button('discover', () => run(async () => { const value = await call('toolExplorerAction', { ...params(), connectionKey: item.connectionKey, action: 'discover' }); await loadTools(); return value })), button('check', () => run(async () => { const value = await call('toolExplorerAction', { ...params(), connectionKey: item.connectionKey, action: 'check' }); await loadTools(); return value })))))) : null),
        h('div', { className: 'dsh-app-mcp-detail' }, panel)))
  }
  return { NS, dictionaries, styles: '', McpPage }
}
