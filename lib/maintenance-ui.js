/* Shared diagnostics document; product data is inserted as text, never executable markup. */
const dictionaries = {
  zh: {
    heading: '诊断与恢复',
    subtitle: '客户端与 Web 共享的配置、插件与运行记录',
    refresh: '刷新',
    check: '运行功能检查',
    recoveryTitle: '可用恢复操作',
    restorePlugins: '恢复更新前的插件版本',
    rollbackCore: '切换到上一个 DSH 版本',
    confirmPluginRecovery: '恢复更新前的插件版本并重启共享服务？运行中的任务会中断。',
    confirmCoreRecovery: '切换到上一个 DSH 版本并恢复对应的配置备份？运行中的任务会中断。',
    cancelled: '已取消。',
    failedStartup: '最近一次启动失败',
    plugins: '插件状态',
    models: '模型来源',
    history: '变更记录',
    checks: '功能检查',
    startup: '启动日志',
    enabled: '已启用',
    disabled: '未启用',
    missing: '安装文件缺失',
    quarantined: '已隔离',
    retry: '重新启用并重启',
    disable: '暂时停用并重启',
    pending: '有变更等待重启',
    evidence: '查看相关错误记录',
    unknown: '由核心提供 / 未读取版本',
    note: '启用状态不代表插件的所有功能均通过验证。错误记录只提供关联线索。',
    readonly: '浏览器可查看共享诊断；插件恢复请在 DSH App 中操作。',
    confirm: '这会修改该插件的启用状态并重启共享服务。正在运行的任务会中断。继续？',
    empty: '暂无记录',
    progress: '正在检查，请稍候…',
    failed: '检查未通过',
    passed: '检查通过',
    probeNote:
      '在独立临时目录检查新建对话、模式切换、模型选择和归档；不发送模型消息。此检查不验证额度、模型回答或每个插件的业务功能。',
    provider: '提供商',
    origin: '来源标记',
    model: '模型标识',
    ass: 'ASS 标识',
    custom: '自定义配置',
    configured: '显式配置',
    profile: '当前 profile 配置',
    legacy: '旧版 settings.yaml',
    imported: '已迁移的旧配置',
    provenance:
      'ASS 标识根据提供商 ID 识别，不能据此确认最近一次写入者。定期观察配置无法识别其他程序的进程身份。',
    before: '修改前',
    after: '修改后',
    external: '外部写入 / 未知进程',
    'during-upgrade': '更新期间观察到',
    'during-recovery': '恢复期间观察到',
    default: '默认模型',
    format: '只记录模型身份和必要配置，不记录密钥。首次打开建立基线，不补造历史记录。',
    updated: '结果已更新。',
    requests: '模型消息请求',
    conversation: '新建对话',
    preset: '切换模式',
    archive: '归档',
    running: '正在执行',
    detail: '详情',
    time: '耗时',
    rows: '检查项',
    logs: '最近一次成功启动',
    noModels: '此配置文件没有显式模型条目；内置默认值请以 DSH 模型列表为准。'
  },
  en: {
    heading: 'Diagnostics and recovery',
    subtitle: 'Configuration, plugins and records shared by Desktop and Web',
    refresh: 'Refresh',
    check: 'Run functional check',
    recoveryTitle: 'Available recovery actions',
    restorePlugins: 'Restore plugin versions from before the update',
    rollbackCore: 'Switch to the previous DSH version',
    confirmPluginRecovery: 'Restore the previous plugin versions and restart the shared service? Running tasks will be interrupted.',
    confirmCoreRecovery: 'Switch to the previous DSH version and restore its profile snapshot? Running tasks will be interrupted.',
    cancelled: 'Cancelled.',
    failedStartup: 'Most recent startup failure',
    plugins: 'Plugins',
    models: 'Model sources',
    history: 'Change history',
    checks: 'Functional check',
    startup: 'Startup log',
    enabled: 'Enabled',
    disabled: 'Disabled',
    missing: 'Package missing',
    quarantined: 'Quarantined',
    retry: 'Enable and restart',
    disable: 'Disable and restart',
    pending: 'Changes need restart',
    evidence: 'Related errors',
    unknown: 'Provided by core / version unavailable',
    note: 'Activation does not establish that every plugin feature works. Log matches are diagnostic leads.',
    readonly: 'Web can read shared diagnostics. Use DSH App for plugin recovery.',
    confirm: 'Change this plugin and restart the shared service? Running tasks will be interrupted.',
    empty: 'No records',
    progress: 'Checking…',
    failed: 'Check failed',
    passed: 'Check passed',
    probeNote:
      'Tests conversation creation, preset changes, model selection and archival in a temporary home without model messages. It does not verify balances, model output or every plugin feature.',
    provider: 'Provider',
    origin: 'Source marker',
    model: 'Model ID',
    ass: 'ASS marker',
    custom: 'Custom configuration',
    configured: 'Explicit configuration',
    profile: 'Current profile',
    legacy: 'Legacy settings.yaml',
    imported: 'Imported legacy settings',
    provenance:
      'ASS markers are identified from provider IDs, not the identity of the last writer. File observation cannot identify external processes.',
    before: 'Before',
    after: 'After',
    external: 'External write / unknown process',
    'during-upgrade': 'Observed during upgrade',
    'during-recovery': 'Observed during recovery',
    default: 'Default model',
    format:
      'Records model identities and necessary configuration, never API keys. First use establishes a baseline without inventing earlier history.',
    updated: 'Results updated.',
    requests: 'Model message requests',
    conversation: 'New conversation',
    preset: 'Preset change',
    archive: 'Archive',
    running: 'Running',
    detail: 'Details',
    time: 'Duration',
    rows: 'Checks',
    logs: 'Last successful startup',
    noModels: 'No explicit models in this file. Check the DSH model selector for built-in defaults.'
  }
}
const language = new URLSearchParams(location.search).get('lang') || navigator.language
const t = dictionaries[language.toLowerCase().startsWith('en') ? 'en' : 'zh']
document.documentElement.lang = t === dictionaries.en ? 'en' : 'zh-CN'
document.title = `${t.heading} · DSH App`
const desktop = window.dshMaintenance
const api = desktop || {
  read: async () => {
    const response = await fetch('/dsh-app/diagnostics.json', { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw Error(body.error || `HTTP ${response.status}`)
    return body
  }
}
let report,
  selected = 'plugins',
  busy = false
const $ = (id) => document.getElementById(id)
const node = (tag, text, className) => {
  const el = document.createElement(tag)
  if (text !== undefined) el.textContent = text
  if (className) el.className = className
  return el
}
const format = (value) => (value == null ? '—' : JSON.stringify(value, null, 2))
const button = (title, action) => {
  const el = node('button', title)
  el.type = 'button'
  el.disabled = busy
  el.addEventListener('click', action)
  return el
}
const error = (value) => {
  $('error').hidden = !value
  $('error').textContent = value ? String(value) : ''
}
const detail = (title, value) => {
  const el = node('details')
  el.append(node('summary', title), node('pre', typeof value === 'string' ? value : format(value)))
  return el
}
const card = (title) => {
  const el = node('article', undefined, 'card')
  if (title) el.append(node('h2', title))
  return el
}
const notice = (value) => node('p', value, 'notice')
function render() {
  const content = $('content')
  content.replaceChildren()
  const recovery = $('recovery')
  recovery.replaceChildren()
  const actions = report?.recovery || {}
  if (desktop && (actions.pluginUpdate || actions.coreRollbackVersion)) {
    const item = card(t.recoveryTitle), buttons = node('div', undefined, 'actions')
    if (actions.pluginUpdate) buttons.append(button(t.restorePlugins, () => {
      if (confirm(t.confirmPluginRecovery)) void act({ kind: 'plugin-update' })
    }))
    if (actions.coreRollbackVersion) {
      const label = `${t.rollbackCore} · ${actions.coreRollbackVersion}`
      buttons.append(button(label, () => {
        if (confirm(t.confirmCoreRecovery)) void act({ kind: 'core' })
      }))
    }
    item.append(buttons)
    recovery.append(item)
    recovery.hidden = false
  } else recovery.hidden = true
  for (const tab of $('tabs').children)
    tab.setAttribute('aria-selected', String(tab.dataset.tab === selected))
  $('check').disabled = busy
  $('refresh').disabled = busy
  if (!report) return
  if (selected === 'plugins') {
    content.append(notice(t.note))
    if (!desktop) content.append(node('p', t.readonly, 'muted'))
    for (const plugin of report.plugins) {
      const el = card(),
        row = node('div', undefined, 'row'),
        left = node('div'),
        actions = node('div', undefined, 'actions')
      left.append(node('code', plugin.name), node('p', plugin.version || t.unknown, 'muted'))
      left.append(node('span', t[plugin.status] || plugin.status, 'badge'))
      if (plugin.pending) left.append(node('small', t.pending))
      if (desktop && plugin.mutable) {
        const action = plugin.enabled ? 'disable' : 'retry'
        actions.append(
          button(t[action], () => {
            if (!confirm(t.confirm)) return
            void act({ kind: 'plugin', action, name: plugin.name, revision: report.revision })
          })
        )
      }
      row.append(left, actions)
      el.append(row)
      if (plugin.evidence.length) el.append(detail(t.evidence, plugin.evidence.join('\n')))
      content.append(el)
    }
  } else if (selected === 'models') {
    content.append(notice(t.provenance))
    for (const source of report.models) {
      const el = card(t[source.role])
      el.append(node('code', source.path))
      if (Object.keys(source.default || {}).length)
        el.append(node('p', `${t.default}: ${format(source.default)}`, 'muted'))
      if (!source.providers.length) el.append(node('p', t.noModels, 'muted'))
      for (const provider of source.providers) {
        const row = card()
        row.append(node('span', t[provider.origin] || provider.origin, 'badge'), node('code', provider.id))
        if (provider.baseURL) row.append(node('p', provider.baseURL, 'muted'))
        row.append(
          node(
            'pre',
            provider.models.map((model) => `${model.id}${model.name ? ` · ${model.name}` : ''}`).join('\n') ||
              '—'
          )
        )
        el.append(row)
      }
      content.append(el)
    }
  } else if (selected === 'history') {
    content.append(notice(t.format))
    for (const record of [...report.history].reverse()) {
      const el = card(new Date(record.at).toLocaleString())
      el.append(node('span', t[record.actor] || t.external, 'badge'))
      for (const change of record.changes) {
        el.append(node('p', `${t[change.role] || change.role} · ${change.provider}`))
        const table = node('table'),
          header = node('tr'),
          body = node('tr')
        header.append(node('th', t.before), node('th', t.after))
        for (const value of [change.before, change.after]) {
          const td = node('td')
          td.append(node('pre', format(value)))
          body.append(td)
        }
        table.append(header, body)
        el.append(table)
      }
      content.append(el)
    }
    if (!report.history.length) content.append(node('p', t.empty, 'empty'))
  } else if (selected === 'checks') {
    content.append(notice(t.probeNote))
    if (report.check) {
      const check = report.check,
        el = card(t[check.status] || check.status)
      el.append(node('p', new Date(check.at).toLocaleString(), 'muted'))
      el.append(
        node('p', `${t.requests}: ${check.modelRequests} · ${t.rows}: ${check.checks.length}`, 'metrics')
      )
      if (check.message) el.append(node('pre', check.message, 'warning'))
      const table = node('table', undefined, 'checks')
      const head = node('tr')
      for (const title of [t.detail, t.time, t.checks]) head.append(node('th', title))
      table.append(head)
      for (const item of check.checks) {
        const row = node('tr')
        row.append(
          node('td', `${t[item.kind] || item.kind} · ${item.subject}`),
          node('td', `${item.durationMs} ms`),
          node('td', t[item.status] || item.status)
        )
        table.append(row)
      }
      el.append(table)
      content.append(el)
    } else content.append(node('p', t.empty, 'empty'))
  } else {
    if (report.startupFailure) {
      const failure = card(t.failedStartup)
      failure.append(node('pre', report.startupFailure, 'warning'))
      content.append(failure)
    }
    const el = card(t.logs)
    el.append(node('pre', report.startup || t.empty))
    content.append(el)
  }
}
async function refresh() {
  try {
    error(null)
    report = await api.read()
    error(report.errors?.join('\n'))
    render()
  } catch (e) {
    error(e.message)
  }
}
async function act(request) {
  if (busy) return
  busy = true
  error(null)
  $('status').textContent = t.progress
  render()
  try {
    const result = await desktop.action(request)
    if (result === false) {
      $('status').textContent = t.cancelled
      return
    }
    report = await api.read()
    error(report.errors?.join('\n'))
    $('status').textContent = t.updated
  } catch (e) {
    error(e.message)
  } finally {
    busy = false
    render()
  }
}
$('heading').textContent = t.heading
$('subtitle').textContent = t.subtitle
$('refresh').textContent = t.refresh
$('check').textContent = t.check
$('check').hidden = !desktop
$('refresh').addEventListener('click', () => void refresh())
$('check').addEventListener('click', () => {
  selected = 'checks'
  void act({ kind: 'check' })
})
for (const id of ['plugins', 'models', 'history', 'checks', 'startup']) {
  const tab = button(t[id], () => {
    selected = id
    render()
  })
  tab.dataset.tab = id
  tab.setAttribute('role', 'tab')
  $('tabs').append(tab)
}
desktop?.onProgress((value) => {
  $('status').textContent =
    `${t[value.kind] || value.kind} · ${value.subject} · ${t[value.status] || value.status}`
})
void refresh()
