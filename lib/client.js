window.__ModuleLoader__.load({
  id: 'dsh-app',
  factory: (require) => {
/** Context insight renders official Session projections and one bounded activity fold. */
function createContextInsightClient(require) {
  const { createElement: h } = require('react')
  const NS = 'dshAppContext'
  const dictionaries = {
    zh: {
      title: '上下文与活动', summary: '上下文', noSession: '选择一条对话查看上下文与活动',
      pending: '正在读取当前对话…', unknown: '尚无用量报告', noRequests: '还没有模型请求',
      used: '预计下一次请求', capacity: '上下文容量', utilization: '利用率', unknownCapacity: '容量未提供',
      estimate: '估算', exactPrompt: '最近请求输入', usage: '累计 Token', input: '输入', output: '输出',
      cacheRead: '缓存读取', cacheWrite: '缓存写入', requests: '模型请求', tools: '工具调用',
      compactions: '压缩', prunes: '裁剪', inputs: '用户输入', attempts: '未完成尝试',
      composition: '当前上下文组成', system: '系统提示', toolSchemas: '工具定义', user: '用户消息',
      injected: '注入上下文', skill: '技能', assistant: '模型回答', tool: '工具结果',
      compositionNote: '组成使用 DSH 的字符估算；占用率由 API 用量锚定，两者不会精确相加。',
      estimateNote: 'API 尚未提供输入用量，当前仅显示字符估算。',
      pressureNote: '模型切换后，容量与上次请求用量可能来自不同时间，下一次请求会更新。',
      history: '请求与上下文变化', recentHistory: '最近 {count} 次请求', requestTime: '时间', model: '模型',
      prompt: '请求输入', duration: '耗时', emptyHistory: '发送消息后会记录请求输入、输出和耗时',
      activity: '最近活动', emptyActivity: '尚无活动', recentActivity: '最多保留 {count} 条活动',
      toolRanking: '工具统计', toolName: '工具', calls: '次数', failures: '失败', otherTools: '其他工具',
      emptyTools: '尚未调用工具', seconds: '{value} 秒', shadowed: '替换前约 {tokens} Token · {count} 条',
      eventRequest: '模型请求', eventTool: '工具结束', eventCompaction: '上下文压缩', eventPrune: '工具结果裁剪',
      eventInject: '注入上下文', eventModel: '切换模型', eventAttempt: '未完成尝试', failed: '失败',
      chart: '各次请求的输入 Token；API 未报告时显示估算', openUsage: '打开费用与用量',
      noteLive: '只订阅当前对话；历史与活动随日志增量更新。',
    },
    en: {
      title: 'Context and activity', summary: 'Context', noSession: 'Select a conversation to inspect context and activity',
      pending: 'Reading the selected conversation…', unknown: 'No usage reported yet', noRequests: 'No model requests yet',
      used: 'Projected next request', capacity: 'Context capacity', utilization: 'Utilization', unknownCapacity: 'Capacity unavailable',
      estimate: 'Estimated', exactPrompt: 'Latest request input', usage: 'Cumulative tokens', input: 'Input', output: 'Output',
      cacheRead: 'Cache read', cacheWrite: 'Cache write', requests: 'Model requests', tools: 'Tool calls',
      compactions: 'Compactions', prunes: 'Prunes', inputs: 'User inputs', attempts: 'Unsettled attempts',
      composition: 'Current context composition', system: 'System prompt', toolSchemas: 'Tool schemas', user: 'User messages',
      injected: 'Injected context', skill: 'Skills', assistant: 'Model responses', tool: 'Tool results',
      compositionNote: 'Composition uses DSH’s character heuristic. Occupancy is anchored to API usage; these totals differ.',
      estimateNote: 'The API has not reported input usage. Only a character estimate is available.',
      pressureNote: 'After switching models, capacity and prior usage can reflect different moments until the next request.',
      history: 'Request and context history', recentHistory: 'Latest {count} requests', requestTime: 'Time', model: 'Model',
      prompt: 'Request input', duration: 'Duration', emptyHistory: 'Sending messages records input, output and request duration',
      activity: 'Recent activity', emptyActivity: 'No activity yet', recentActivity: 'Up to {count} recent activities',
      toolRanking: 'Tool statistics', toolName: 'Tool', calls: 'Calls', failures: 'Failures', otherTools: 'Other tools',
      emptyTools: 'No tools called yet', seconds: '{value} s', shadowed: 'Replaced ~{tokens} tokens · {count} entries',
      eventRequest: 'Model request', eventTool: 'Tool completed', eventCompaction: 'Context compaction', eventPrune: 'Tool result pruning',
      eventInject: 'Injected context', eventModel: 'Model changed', eventAttempt: 'Unsettled attempt', failed: 'Failed',
      chart: 'Input tokens per request; estimates are shown when API usage is absent', openUsage: 'Open cost and usage',
      noteLive: 'Only the selected conversation is subscribed. History and activity update incrementally from its log.',
    },
  }
  const styles = `
.dsh-app-context{min-width:0;color:var(--dsh-app-text);padding:18px 22px;overflow:auto;height:100%;box-sizing:border-box;font-size:13px;line-height:1.5}
.dsh-app-context h2,.dsh-app-context h3,.dsh-app-context p{margin:0}.dsh-app-context h2{font-size:17px}.dsh-app-context h3{font-size:14px}
.dsh-app-context-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.dsh-app-context-route{font-size:12px;color:var(--dsh-app-muted);overflow-wrap:anywhere;text-align:right}
.dsh-app-context-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.dsh-app-context-card,.dsh-app-context-section{border:1px solid var(--dsh-app-border);border-radius:13px;background:var(--dsh-app-surface)}
.dsh-app-context-card{padding:12px 14px;display:flex;flex-direction:column;gap:4px}.dsh-app-context-card>span{color:var(--dsh-app-muted);font-size:12px}.dsh-app-context-card>strong{font-size:20px;font-weight:600;line-height:1.25}.dsh-app-context-card>small{font-size:11px;color:var(--dsh-app-muted)}
.dsh-app-context-section{padding:15px 17px;margin-top:12px}.dsh-app-context-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.dsh-app-context-note{font-size:11px;color:var(--dsh-app-muted);margin-top:8px!important}.dsh-app-context-empty{padding:24px 10px;color:var(--dsh-app-muted);text-align:center}
.dsh-app-context-bars{display:flex;height:8px;overflow:hidden;border-radius:6px;background:var(--dsh-app-hover)}.dsh-app-context-bars>span{min-width:0;flex-shrink:0;background:currentColor}.dsh-app-context-bars>span:nth-child(2n){opacity:.65}.dsh-app-context-bars>span:nth-child(3n){opacity:.35}
.dsh-app-context-composition{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.dsh-app-context-composition>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.dsh-app-context-composition dt{color:var(--dsh-app-muted);font-size:12px}.dsh-app-context-composition dd{margin:0;font-variant-numeric:tabular-nums;font-size:12px}
.dsh-app-context table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.dsh-app-context td,.dsh-app-context th{text-align:left;font-size:12px;padding:8px 10px;border-bottom:1px solid var(--dsh-app-border);vertical-align:top}.dsh-app-context th{font-weight:500;color:var(--dsh-app-muted)}.dsh-app-context tr:last-child td{border-bottom:0}.dsh-app-context td>small{display:block;color:var(--dsh-app-muted);font-size:10px}.dsh-app-context-table{overflow-x:auto}.dsh-app-context-table td.model{max-width:280px;overflow-wrap:anywhere}
.dsh-app-context-chart{width:100%;height:88px;display:block;margin:6px 0 10px;color:var(--dsh-app-text)}.dsh-app-context-chart-line{stroke:currentColor;stroke-width:1.8;fill:none;vector-effect:non-scaling-stroke}.dsh-app-context-chart-grid{stroke:var(--dsh-app-border);stroke-width:1;vector-effect:non-scaling-stroke}
.dsh-app-context-activity{list-style:none;margin:0;padding:0}.dsh-app-context-activity li{display:grid;grid-template-columns:72px 118px 1fr;gap:12px;border-bottom:1px solid var(--dsh-app-border);padding:8px 0;font-size:12px;overflow-wrap:anywhere}.dsh-app-context-activity li:last-child{border-bottom:0}.dsh-app-context-activity time{color:var(--dsh-app-muted);font-size:11px}.dsh-app-context-activity span{min-width:0}.dsh-app-context-failed{color:var(--dsh-app-warning,#d09167)}
.dsh-app-context-summary{border:0;background:transparent;color:var(--dsh-app-muted);padding:4px 0;display:flex;align-items:center;gap:8px;font:inherit;font-size:11px;cursor:pointer;font-variant-numeric:tabular-nums}.dsh-app-context-summary:hover{color:var(--dsh-app-text)}.dsh-app-context-summary-track{width:52px;height:4px;overflow:hidden;background:var(--dsh-app-hover);border-radius:4px}.dsh-app-context-summary-track>i{display:block;height:100%;background:currentColor}.dsh-app-context-summary:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:4px}
`
  const format = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
  const compact = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  const time = value => new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateTime = value => new Date(value).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const totalOf = composition => Object.values(composition ?? {}).reduce((sum, value) => sum + value, 0)
  const names = { system: 'system', tools: 'toolSchemas', user: 'user', injected: 'injected', skill: 'skill', assistant: 'assistant', tool: 'tool' }
  const activityNames = { request: 'eventRequest', tool: 'eventTool', compaction: 'eventCompaction', prune: 'eventPrune', inject: 'eventInject', model: 'eventModel', attempt: 'eventAttempt' }
  function useData(useProjection) {
    const pressure = useProjection('contextPressure')
    const breakdown = useProjection('contextBreakdown')
    const usage = useProjection('tokenUsage')
    const insight = useProjection('dshAppContext')
    const estimated = totalOf(insight?.composition) || (breakdown ? breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens : 0)
    const anchored = pressure?.projectedTokens ?? pressure?.pressureTokens
    const used = anchored ?? estimated
    const capacity = pressure?.contextWindow ?? insight?.route.contextWindow
    const percent = capacity > 0 ? Math.round(used / capacity * 100) : undefined
    return { pressure, breakdown, usage, insight, estimated, used, capacity, percent, anchored: anchored !== undefined }
  }
  function Card({ name, value, detail }) {
    return h('div', { className: 'dsh-app-context-card' }, h('span', {}, name), h('strong', {}, value), detail ? h('small', {}, detail) : null)
  }
  function Chart({ rows, t }) {
    if (rows.length < 2) return null
    const values = rows.map(row => row.prompt ?? row.estimated)
    const maximum = Math.max(1, ...values)
    const point = (value, index) => `${8 + index / (values.length - 1) * 704},${76 - value / maximum * 66}`
    return h('svg', { className: 'dsh-app-context-chart', viewBox: '0 0 720 88', preserveAspectRatio: 'none', role: 'img', 'aria-label': t('chart') },
      h('title', {}, t('chart')), h('line', { className: 'dsh-app-context-chart-grid', x1: 8, x2: 712, y1: 76, y2: 76 }),
      h('polyline', { className: 'dsh-app-context-chart-line', points: values.map(point).join(' ') }),
      ...rows.map((row, index) => h('circle', { key: row.seq, cx: 8 + index / (values.length - 1) * 704, cy: 76 - values[index] / maximum * 66, r: 2.5, fill: row.prompt === undefined ? 'none' : 'currentColor', stroke: 'currentColor' },
        h('title', {}, `${dateTime(row.time)} · ${row.prompt === undefined ? '~' : ''}${format(values[index])} Token`))))
  }
  /** Render the selected session's context, requests, tools, compactions and recent activity. */
  function ContextInsight({ sessionId, useProjection, t }) {
    const data = useData(useProjection)
    if (!sessionId) return h('section', { className: 'dsh-app-context' }, h('p', { className: 'dsh-app-context-empty' }, t('noSession')))
    const { insight, usage, used, capacity, percent, pressure, anchored } = data
    if (!insight) return h('section', { className: 'dsh-app-context' }, h('p', { className: 'dsh-app-context-empty', role: 'status' }, t('pending')))
    const billed = usage ? usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens : undefined
    const composition = insight.composition
    const compositionTotal = totalOf(composition)
    const sections = (key, children, detail) => h('section', { className: 'dsh-app-context-section' },
      h('div', { className: 'dsh-app-context-section-head' }, h('h3', {}, t(key)), detail ? h('small', { className: 'dsh-app-context-note' }, detail) : null), ...children)
    const seconds = value => t('seconds', { value: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value / 1000) })
    return h('section', { className: 'dsh-app-context', 'aria-label': t('title') },
      h('header', { className: 'dsh-app-context-head' }, h('h2', {}, t('title')), h('span', { className: 'dsh-app-context-route' }, [insight.route.provider, insight.route.model].filter(Boolean).join(' / '))),
      h('div', { className: 'dsh-app-context-cards' },
        h(Card, { name: t('used'), value: `~${compact(used)}`, detail: capacity ? `${t('capacity')} ${compact(capacity)} · ${t('utilization')} ${percent}%` : t('unknownCapacity') }),
        h(Card, { name: t('usage'), value: billed === undefined ? '—' : compact(billed), detail: billed === undefined ? t('unknown') : `${t('input')} ${compact(usage.uncachedInputTokens)} · ${t('output')} ${compact(usage.outputTokens)}` }),
        h(Card, { name: t('requests'), value: format(insight.totals.requests), detail: `${t('inputs')} ${format(insight.totals.inputs)} · ${t('attempts')} ${format(insight.totals.attempts)}` }),
        h(Card, { name: t('tools'), value: format(insight.totals.toolCalls), detail: `${t('compactions')} ${format(insight.totals.compactions)} · ${t('prunes')} ${format(insight.totals.prunes)}` })),
      pressure?.pressureTokens !== undefined ? h('p', { className: 'dsh-app-context-note' }, `${t('exactPrompt')} ${format(pressure.pressureTokens)} Token`) : null,
      h('p', { className: 'dsh-app-context-note' }, t(anchored ? 'pressureNote' : 'estimateNote')),
      sections('composition', [
        h('div', { key: 'bar', className: 'dsh-app-context-bars', 'aria-hidden': true }, ...Object.keys(names).filter(key => composition[key] > 0).map(key => h('span', { key, style: { width: `${composition[key] / Math.max(1, compositionTotal) * 100}%` }, title: `${t(names[key])}: ~${format(composition[key])}` }))),
        h('dl', { key: 'rows', className: 'dsh-app-context-composition' }, ...Object.keys(names).map(key => h('div', { key }, h('dt', {}, t(names[key])), h('dd', {}, `~${format(composition[key])}`)))),
        h('p', { key: 'note', className: 'dsh-app-context-note' }, t('compositionNote')),
        usage ? h('p', { key: 'cache', className: 'dsh-app-context-note' }, `${t('cacheRead')} ${format(usage.cacheReadTokens)} · ${t('cacheWrite')} ${format(usage.cacheWriteTokens)}`) : null,
      ]),
      sections('history', insight.history.length ? [h(Chart, { key: 'chart', rows: insight.history, t }),
        h('div', { key: 'table', className: 'dsh-app-context-table' }, h('table', {},
          h('thead', {}, h('tr', {}, ...['requestTime', 'model', 'prompt', 'output', 'duration'].map(key => h('th', { key }, t(key))))),
          h('tbody', {}, ...[...insight.history].reverse().map(row => h('tr', { key: row.seq },
            h('td', { title: new Date(row.time).toLocaleString() }, time(row.time)),
            h('td', { className: 'model' }, row.model || '—', h('small', {}, row.provider)),
            h('td', {}, `${row.prompt === undefined ? '~' : ''}${format(row.prompt ?? row.estimated)}`),
            h('td', {}, row.output === undefined ? '—' : format(row.output)),
            h('td', {}, row.requestMs === undefined ? '—' : seconds(row.requestMs)))))))
      ] : [h('p', { key: 'empty', className: 'dsh-app-context-empty' }, t('emptyHistory'))], t('recentHistory', { count: insight.limits.historyLimit })),
      sections('toolRanking', insight.tools.length ? [h('div', { key: 'table', className: 'dsh-app-context-table' }, h('table', {},
        h('thead', {}, h('tr', {}, ...['toolName', 'calls', 'failures', 'duration'].map(key => h('th', { key }, t(key))))),
        h('tbody', {}, ...[...insight.tools].sort((a, b) => b.calls - a.calls).map(row => h('tr', { key: row.name },
          h('td', { className: 'model' }, row.name || t('otherTools')), h('td', {}, format(row.calls)), h('td', {}, format(row.failures)), h('td', {}, seconds(row.durationMs)))))))
      ] : [h('p', { key: 'empty', className: 'dsh-app-context-empty' }, t('emptyTools'))]),
      sections('activity', insight.activity.length ? [h('ol', { key: 'list', className: 'dsh-app-context-activity' }, ...[...insight.activity].reverse().map(row => h('li', { key: `${row.seq}:${row.kind}` },
        h('time', { dateTime: new Date(row.time).toISOString(), title: new Date(row.time).toLocaleString() }, time(row.time)),
        h('strong', {}, t(activityNames[row.kind])),
        h('span', { className: row.failed ? 'dsh-app-context-failed' : '' }, row.detail,
          row.kind === 'compaction' || row.kind === 'prune' ? t('shadowed', { tokens: format(row.tokens ?? 0), count: row.count ?? 0 }) : row.tokens !== undefined ? ` · ${format(row.tokens)} Token` : '',
          row.failed ? ` · ${t('failed')}` : ''))))] : [h('p', { key: 'empty', className: 'dsh-app-context-empty' }, t('emptyActivity'))], t('recentActivity', { count: insight.limits.activityLimit })),
      h('p', { className: 'dsh-app-context-note' }, t('noteLive')))
  }
  /** Compact readout beneath the composer; uses the same selected-session projections. */
  function ContextSummary({ sessionId, useProjection, t, onOpen }) {
    const { used, capacity, percent, insight, pressure } = useData(useProjection)
    if (!sessionId || (!insight && !pressure)) return null
    const reading = capacity ? `~${compact(used)} / ${compact(capacity)} · ${percent}%` : `~${compact(used)} Token`
    return h('button', { type: 'button', className: 'dsh-app-context-summary', onClick: onOpen, title: `${t('openUsage')} · ${reading}`, 'aria-label': `${t('summary')} ${reading}` },
      h('span', {}, t('summary')), h('span', {}, reading),
      capacity ? h('span', { className: 'dsh-app-context-summary-track', 'aria-hidden': true }, h('i', { style: { width: `${Math.min(100, percent)}%` } })) : null)
  }
  return { NS, dictionaries, styles, ContextInsight, ContextSummary }
}


/** Build the browser half against DSH's shared module table, without bundling React. */
function createDshAppClient(require, css) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const { createElement: h, cloneElement, Children, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
  const NS = 'dshApp'
  const contextInsight = createContextInsightClient(require)
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
  function McpRailEntry({ actions, useStore, t }) {
    const open = useStore(state => state.open)
    return h(Button, { label: t('mcp'), icon: 'puzzle', active: open, onClick: () => actions.open(), 'aria-expanded': open, 'data-dsh-app-action': 'connector' })
  }
  let inlineSnapshot = { settings: null, mcp: null, modal: false }
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
    const active = rows.find(row => row.id === activeId)?.id ?? rows[0]?.id
    return h('div', { className: 'dsh-app-settings-page' },
      h('nav', { className: 'dsh-app-settings-nav' }, h('div', { className: 'dsh-app-settings-brand' }, renderSlot('settings.header', {})),
        rows.map(row => h('button', { key: row.id, type: 'button', 'aria-current': row.id === active ? 'page' : undefined, onClick: () => onSelect(row.id) }, row.label))),
      h('div', { className: 'dsh-app-settings-body' }, h('div', { className: 'dsh-app-settings-actions' }, renderSlot('settings.action', {})),
        h('div', { className: 'dsh-app-settings-options' }, active !== undefined ? renderSlot('settings.section', { close: onClose }, { only: active }) : null)))
  }
  /** Replace only the two owners' modal presentation; stores, hooks and slot authorization stay theirs. */
  function installInlinePanels(ctx) {
    const owners = new Map()
    const closeOwnPanel = name => {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === `dsh-app-${name}`) ctx.layout.selectPanel(null)
    }
    const publishComponentChange = (slot, entry) => {
      if (!ctx.slots.entries(slot).includes(entry)) return
      // Component decoration retains its child authorization. A non-winning, immediately
      // disposed registration publishes the change through the registry's public version source.
      const priority = Math.max(...ctx.slots.entries(slot).map(value => value.options.priority ?? 0)) + 1
      ctx.slots.register({ name: slot, id: entry.options.id, priority }, () => null)()
    }
    const openPluginMarket = fallback => {
      const panel = ctx.slots.entriesOfSlot('sidebar.panellist').find(entry => /plugin|插件/i.test(typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label ?? ''))
      if (panel) { inlineActions.get('mcp')?.close(); ctx.layout.selectPanel(panel.options.id); return }
      const section = ctx.slots.entriesOfSlot('settings.section').find(entry => /plugin|插件/i.test(typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label ?? ''))
      if (section) { inlineActions.get('mcp')?.close(); inlineActions.get('settings')?.openSection(section.options.id); return }
      fallback()
    }
    const adaptMarketLink = node => {
      if (!React.isValidElement(node)) return node
      if (node.type === 'button' && Children.toArray(node.props.children).join('') === '查看更新方式') return cloneElement(node, { onClick: () => openPluginMarket(node.props.onClick) })
      return node.props.children === undefined ? node : cloneElement(node, {}, Children.map(node.props.children, adaptMarketLink))
    }
    const install = (slot, name, id) => {
      const entry = ctx.slots.entriesOfSlot(slot).find(value => id === undefined || value.options.id === id)
      const previous = owners.get(name)
      if (entry === previous?.entry) return
      previous?.restore()
      owners.delete(name)
      if (!entry) return
      const original = entry.component
      function InlineOwner(props) {
        const snapshot = useSyncExternalStore(inlineSource.subscribe, inlineSource.getSnapshot, inlineSource.getSnapshot)
        const target = snapshot[name]
        const open = props.useStore(state => state.open)
        const wasOpen = useRef(open)
        const previousMcp = useRef(null)
        const actions = useMemo(() => ({ ...props.actions, close: () => { props.actions.close(); closeOwnPanel(name) } }), [props.actions])
        useEffect(() => {
          inlineActions.set(name, props.actions)
          if (inlineWanted.has(name)) props.actions.open()
          return () => { if (inlineActions.get(name) === props.actions) inlineActions.delete(name) }
        }, [props.actions])
        useEffect(() => {
          if (open) ctx.layout.selectPanel(`dsh-app-${name}`)
          else if (wasOpen.current) closeOwnPanel(name)
          wasOpen.current = open
        }, [open])
        // MCP's modal Escape capture is suspended while another dialog owns focus.
        // Keep its existing iframe tree mounted; only the original open effects pause.
        const useStore = name === 'mcp' && snapshot.modal ? select => props.useStore(state => select({ ...state, open: false })) : props.useStore
        let rendered = original({ ...props, actions, useStore })
        if (name === 'settings') {
          const children = Children.toArray(rendered?.props?.children)
          const panel = children.find(child => typeof child?.props?.renderSlot === 'function' && Array.isArray(child.props.rows) && typeof child.props.onSelect === 'function')
          const remainder = children.filter(child => child !== panel)
          return h(React.Fragment, {}, h('div', { hidden: true, 'data-dsh-app-settings-owner': '' }, remainder[0]), ...remainder.slice(1),
            panel && target ? createPortal(h(InlineSettings, panel.props), target) : null)
        }
        if (rendered) previousMcp.current = rendered
        else if (open && snapshot.modal) rendered = previousMcp.current
        else previousMcp.current = null
        if (!rendered || !target) return null
        const outer = rendered.$$typeof === Symbol.for('react.portal') ? rendered.children : rendered
        const panel = Children.toArray(outer?.props?.children).find(child => child?.props?.className?.split(' ').includes('mcpConnectorMarketPanel'))
        if (!panel) throw new Error('The installed MCP connector does not expose its supported panel presentation')
        return createPortal(cloneElement(adaptMarketLink(panel), { role: 'region', 'aria-modal': undefined, style: { ...panel.props.style, width: '100%', height: '100%', minHeight: 0, borderRadius: 0, boxShadow: 'none' } }), target)
      }
      entry.component = InlineOwner
      owners.set(name, { entry, restore: () => { if (entry.component === InlineOwner) { entry.component = original; publishComponentChange(slot, entry) } } })
      publishComponentChange(slot, entry)
    }
    const syncSettings = () => install('sidebar.settings', 'settings')
    const syncMcp = () => install('shell.overlay', 'mcp', 'mcp-connector')
    const stops = [ctx.slots.subscribe('sidebar.settings', syncSettings), ctx.slots.subscribe('shell.overlay', syncMcp)]
    const syncModal = () => setInlineTarget('modal', [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(node => !node.closest('[hidden],[aria-hidden="true"]')))
    const modalObserver = new MutationObserver(syncModal)
    modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden', 'aria-hidden'] })
    syncModal()
    syncSettings(); syncMcp()
    return () => { modalObserver.disconnect(); for (const stop of stops) stop(); for (const owner of owners.values()) owner.restore(); inlineActions.clear(); inlineWanted.clear() }
  }
  /** Reuse the MCP plugin's root store and overlay while replacing its launcher only. */
  function installMcpRail(ctx) {
    let owner
    let restore
    const sync = () => {
      const entry = ctx.slots.entries('sidebar.footer.action').find(value => value.options.id === 'mcp-connector' && value.component !== McpRailEntry)
      if (entry === owner) return
      restore?.()
      restore = undefined
      owner = entry
      if (entry) restore = ctx.slots.register({ name: 'sidebar.footer.action', id: 'mcp-connector', order: entry.options.order ?? 0, priority: -10, store: entry.store, locale: NS, registrant: 'dsh-app' }, McpRailEntry)
    }
    const stop = ctx.slots.subscribe('sidebar.footer.action', sync)
    sync()
    return () => { stop(); restore?.() }
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
    const [menuOpen, setMenuOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const sidebarRef = useRef(null)
    const menuRef = useRef(null)
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
        const actions = new Set(['new', 'sidebar', 'search', 'cost', 'settings', ...sidebarFeatures.current])
        if (document.querySelector('[data-composer-card] .aag-btn')) actions.add('experts')
        if (sidebarRef.current.querySelector('[data-dsh-app-action="connector"]')) actions.add('connector')
        if (panels.some(panel => /plugin|插件/i.test(panel.label))) actions.add('plugins')
        if (panels.some(panel => /skill|技能/i.test(panel.label))) actions.add('skills')
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
      if (!menuOpen) return
      const dismiss = event => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false) }
      const escape = event => { if (event.key === 'Escape') setMenuOpen(false) }
      document.addEventListener('pointerdown', dismiss)
      document.addEventListener('keydown', escape)
      return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
    }, [menuOpen])
    useEffect(() => {
      const action = event => {
        const id = event.detail?.action
        if (id === 'new') startSession()
        else if (id === 'search') setSearchOpen(true)
        else if (id === 'sidebar') toggleSidebar()
        else if (id === 'home') selectPanel(null)
        else if (id === 'cost') selectPanel('dsh-app-cost')
        else if (id === 'settings') selectPanel('dsh-app-settings')
        else if (id === 'connector') sidebarRef.current?.querySelector('[data-dsh-app-action="connector"]')?.click()
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
      if (id === 'dsh-app-cost') {
        document.documentElement.dataset.dshAppUsageTab = 'cost'
        window.dispatchEvent(new CustomEvent('dsh-app:usage-tab', { detail: { tab: 'cost' } }))
      }
      selectPanel(id)
      setMenuOpen(false)
    }
    const primaryPanels = panels.filter(panel => panel.id !== 'dsh-app-cost').slice(0, 3)
    return h('div', { ref: sidebarRef, className: 'dsh-app-sidebar', 'data-dsh-app-sidebar': '', 'data-collapsed': collapsed || undefined, style: { width } },
      h('nav', { className: 'dsh-app-rail', 'aria-label': t('features') },
        h(Button, { label: t('home'), icon: 'home', active: activePanel === null, onClick: () => choose(null), className: 'dsh-app-rail-home', 'data-dsh-app-action': 'home' }),
        h(Button, { label: t('recent'), icon: 'recent', onClick: () => setSearchOpen(true) }),
        ...primaryPanels.map(panel => h(Button, { key: panel.id, label: panel.label, active: activePanel === panel.id, onClick: () => choose(panel.id), 'data-dsh-app-panel': panel.id }, renderSlot('sidebar.panellist', { size: 22, active: activePanel === panel.id }, { only: panel.id }))),
        h('div', { className: 'dsh-app-rail-mcp' }, renderSlot('sidebar.footer.action', { wide: false }, { only: 'mcp-connector' })),
        h('div', { ref: menuRef, className: 'dsh-app-rail-menu-anchor' }, h(Button, { label: t('more'), icon: 'more', onClick: event => { event.stopPropagation(); setMenuOpen(value => !value) }, 'aria-haspopup': 'menu', 'aria-expanded': menuOpen }),
          menuOpen ? h('div', { role: 'menu', className: 'dsh-app-feature-menu' }, h('small', {}, t('features')),
            ...panels.map(panel => h('button', { key: panel.id, type: 'button', role: 'menuitem', onClick: () => choose(panel.id), className: activePanel === panel.id ? 'is-active' : '' }, renderSlot('sidebar.panellist', { size: 18, active: activePanel === panel.id }, { only: panel.id }), h('span', {}, panel.label))),
            h('hr'), h('button', { type: 'button', role: 'menuitem', onClick: () => choose('dsh-app-settings') }, t('settings'))) : null),
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
  function CostPanel({ t, selectPanel, renderSlot }) {
    const [tab, setTab] = useState(document.documentElement.dataset.dshAppUsageTab === 'context' ? 'context' : 'cost')
    const choose = value => { setTab(value); document.documentElement.dataset.dshAppUsageTab = value }
    useEffect(() => {
      const receive = event => { if (event.detail?.tab === 'context' || event.detail?.tab === 'cost') choose(event.detail.tab) }
      window.addEventListener('dsh-app:usage-tab', receive)
      return () => window.removeEventListener('dsh-app:usage-tab', receive)
    }, [])
    return h('section', { className: 'dsh-app-cost-panel', 'aria-label': t('cost') },
      h('header', {}, h(Button, { label: t('backToChat'), icon: 'back', onClick: () => selectPanel(null) }),
        h('div', { className: 'dsh-app-usage-tabs', role: 'tablist', 'aria-label': t('cost') },
          ...['cost', 'context'].map(value => h('button', { key: value, type: 'button', role: 'tab', 'aria-selected': tab === value, onClick: () => choose(value) }, t(value))))),
      tab === 'cost' ? h('iframe', { key: t('cost'), src: '/dsh-app/cost', title: t('cost'), className: 'dsh-app-cost-frame' })
        : h('div', { className: 'dsh-app-usage-context', role: 'tabpanel' }, renderSlot('dsh-app.usage.context', {})))
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
  const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'sessions']
  /** Claim only the sidebar shell; the official workspace, input and settings plugins retain their logic. */
  function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: client dictionaries')
    ctx.effect(() => ctx.locale.register(contextInsight.NS, contextInsight.dictionaries), 'dsh-app: context dictionaries')
    ctx.effect(() => {
      const sheet = document.createElement('style')
      sheet.dataset.pluginCss = 'dsh-app/client-ui'
      sheet.textContent = `${css}\n${contextInsight.styles}`
      document.head.append(sheet)
      document.documentElement.dataset.dshAppUi = 'true'
      return () => { sheet.remove(); delete document.documentElement.dataset.dshAppUi; delete document.documentElement.dataset.dshAppUsageTab }
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
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-app-cost', locale: NS, registrant: 'dsh-app', children: { 'dsh-app.usage.context': { kind: 'single', scope: 'session-maybe' } }, inject: () => ({ selectPanel: id => ctx.layout.selectPanel(id) }) }, CostPanel))
    for (const name of ['settings', 'mcp']) ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: `dsh-app-${name}`, locale: NS, registrant: 'dsh-app', inject: () => ({ name, selectPanel: id => ctx.layout.selectPanel(id) }) }, InlinePanelHost))
    ctx.slots.inject('dsh-app.usage.context', () => ctx.slots.register({ name: 'dsh-app.usage.context', locale: contextInsight.NS, registrant: 'dsh-app' }, contextInsight.ContextInsight))
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-app-context', order: 90, locale: contextInsight.NS, registrant: 'dsh-app', inject: () => ({ onOpen: () => {
      document.documentElement.dataset.dshAppUsageTab = 'context'
      window.dispatchEvent(new CustomEvent('dsh-app:usage-tab', { detail: { tab: 'context' } }))
      ctx.layout.selectPanel('dsh-app-cost')
    } }) }, contextInsight.ContextSummary))
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-app-cost', order: 90, label: () => ctx.locale.bind(NS)('cost'), registrant: 'dsh-app' }, () => h(Icon, { name: 'cost' })))
    syncPanels()
    syncFooters()
    ctx.effect(() => installMcpRail(ctx), 'dsh-app: MCP rail launcher')
    ctx.effect(() => installInlinePanels(ctx), 'dsh-app: inline settings and MCP presentation')
  }
  return { name: 'dsh-app-client', inject, apply }
}

    return createDshAppClient(require, "html[data-dsh-app-ui] {\n  height: 100%;\n  --dsh-app-rail-width: 56px;\n  --dsh-app-chrome-height: 0px;\n}\nhtml[data-dsh-app-ui] body {\n  height: 100%;\n  min-height: 0;\n  margin: 0;\n  overflow: clip;\n  --dsh-app-surface: var(--dsw-alias-bg-base, #fff);\n  --dsh-app-border: var(--dsw-alias-border-l3, #dedede);\n  --dsh-app-hover: var(--dsw-alias-interactive-bg-hover, #eee);\n  --dsh-app-label: var(--dsw-alias-label-primary, #242424);\n  --dsh-app-text: var(--dsh-app-label);\n  --dsh-app-warning: var(--dsw-alias-state-warn-primary, #b88228);\n  --dsh-app-muted: var(--dsw-alias-label-tertiary, #777);\n}\nhtml[data-dsh-app-ui] #root { box-sizing: border-box; height: 100%; min-height: 0; overflow: clip; }\nhtml[data-dsh-app-ui][data-dsh-desktop-chrome] { --dsh-app-chrome-height: 38px; }\nhtml[data-dsh-app-ui] [data-dsh-app-frame] {\n  box-sizing: border-box;\n  margin: 6px 8px 6px 0;\n  height: calc(100% - 12px);\n  border: 1px solid var(--dsh-app-border);\n  border-radius: 18px;\n  background: var(--dsh-app-surface);\n}\nhtml[data-dsh-app-ui] [data-dsh-app-frame] {\n  margin-left: var(--dsh-app-rail-width);\n  width: calc(100% - var(--dsh-app-rail-width) - 8px);\n}\nhtml[data-dsh-app-ui] [data-dsh-app-frame][data-sidebar-collapsed] {\n  grid-template-columns: 0px var(--dsh-app-main-tracks, minmax(0, 1fr) 0px) !important;\n}\nhtml[data-dsh-app-ui] [data-dsh-app-sidebar-column] { background: var(--dsh-app-surface); border-right: 1px solid var(--dsh-app-border); }\nhtml[data-dsh-app-ui] [data-dsh-app-main] { min-height: 0; background: var(--dsh-app-surface); }\nhtml[data-dsh-app-ui] [data-dsh-app-main] > * { min-height: 0; }\nhtml[data-dsh-app-ui] [data-dsh-app-main] header[data-window-drag] { min-height: 58px; border-bottom-color: transparent; }\nhtml[data-dsh-app-ui] [data-composer-card] { border-radius: 25px; box-shadow: 0 0 0 1px var(--dsh-app-border); }\nhtml[data-dsh-app-ui] [data-composer-card] [data-composer-input] { min-height: 70px; }\n.dsh-app-sidebar { height: 100%; color: var(--dsh-app-label); font: 14px/1.4 \"Segoe UI\", \"Microsoft YaHei UI\", system-ui, sans-serif; }\n.dsh-app-sidebar *, .dsh-app-search-dialog * { box-sizing: border-box; }\n.dsh-app-button { border: 0; background: transparent; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 10px; min-width: 34px; height: 34px; padding: 6px; border-radius: 9px; font: inherit; }\n.dsh-app-button:hover, .dsh-app-button.is-active { background: var(--dsh-app-hover); }\n.dsh-app-button:focus-visible, .dsh-app-cost:focus-visible, .dsh-app-feature-menu button:focus-visible, .dsh-app-search-result:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4d6bfe); outline-offset: -2px; }\n.dsh-app-rail { position: fixed; z-index: 16; left: 0; top: calc(var(--dsh-app-chrome-height) + 10px); bottom: 8px; width: var(--dsh-app-rail-width); display: flex; flex-direction: column; align-items: center; gap: 13px; padding: 0 8px; }\n.dsh-app-rail > .dsh-app-button, .dsh-app-rail-menu-anchor > .dsh-app-button { width: 40px; height: 40px; border-radius: 12px; color: var(--dsh-app-muted); }\n.dsh-app-rail > .dsh-app-rail-home { color: var(--dsh-app-label); }\n.dsh-app-rail > .dsh-app-rail-home.is-active::after { content: ''; position: absolute; width: 7px; height: 7px; background: #4d8aff; border-radius: 50%; top: 6px; right: 13px; }\n.dsh-app-rail-spacer { flex: 1; min-height: 12px; }\n.dsh-app-rail-mcp, .dsh-app-rail-footer { width: 40px; display: flex; justify-content: center; flex-direction: column; align-items: center; }\n.dsh-app-rail-footer:empty { display: none; }\n.dsh-app-rail-mcp .dsh-app-button, .dsh-app-rail-footer .dsh-app-button { width: 40px; height: 40px; border-radius: 12px; color: var(--dsh-app-muted); }\n.dsh-app-inline-panel { min-height: 0; height: 100%; display: flex; flex-direction: column; color: var(--dsh-app-label); }\n.dsh-app-inline-header { flex: none; min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 10px 18px; }\n.dsh-app-inline-target { flex: 1; min-height: 0; overflow: hidden; }\n.dsh-app-settings-page { height: 100%; min-height: 0; display: grid; grid-template-columns: 200px minmax(0, 1fr); }\n.dsh-app-settings-nav { min-height: 0; overflow: auto; padding: 12px; border-right: 1px solid var(--dsh-app-border); }\n.dsh-app-settings-brand { padding: 10px 12px 20px; }\n.dsh-app-settings-nav button { display: block; width: 100%; padding: 10px 12px; border: 0; border-radius: 9px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }\n.dsh-app-settings-nav button:hover, .dsh-app-settings-nav button[aria-current] { background: var(--dsh-app-hover); }\n.dsh-app-settings-body { min-height: 0; min-width: 0; display: flex; flex-direction: column; }\n.dsh-app-settings-actions { flex: none; display: flex; align-items: center; gap: 10px; justify-content: flex-end; padding: 4px 24px; }\n.dsh-app-settings-actions:empty { display: none; }\n.dsh-app-settings-options { flex: 1; min-height: 0; overflow: auto; padding: 24px; }\n.dsh-app-inline-mcp .mcpConnectorMarketPanel { background: var(--dsh-app-surface); color: var(--dsh-app-label); }\n.dsh-app-inline-mcp .mcpConnectorMarketHeader { border-color: var(--dsh-app-border); padding: 10px 20px !important; }\n.dsh-app-inline-mcp .mcpConnectorMarketPanel iframe { min-height: 0; }\n.dsh-app-rail-menu-anchor { position: relative; }\n.dsh-app-feature-menu { position: absolute; left: 48px; top: 0; width: 242px; max-height: min(600px, calc(100vh - 110px)); overflow: auto; padding: 8px; background: var(--dsh-app-surface); border: 1px solid var(--dsh-app-border); border-radius: 12px; box-shadow: 0 8px 30px #0003; z-index: 50; }\n.dsh-app-feature-menu > small { display: block; color: var(--dsh-app-muted); padding: 6px 10px 8px; }\n.dsh-app-feature-menu button { width: 100%; min-height: 36px; display: flex; align-items: center; gap: 10px; padding: 7px 10px; color: inherit; background: transparent; border: 0; border-radius: 7px; text-align: left; font: inherit; cursor: pointer; }\n.dsh-app-feature-menu button:hover, .dsh-app-feature-menu button.is-active { background: var(--dsh-app-hover); }\n.dsh-app-feature-menu hr { border: 0; border-top: 1px solid var(--dsh-app-border); margin: 7px 3px; }\n.dsh-app-session-sidebar { --dsh-sidebar-inline-padding: 12px; min-width: 0; height: 100%; display: flex; flex-direction: column; padding: 8px 12px 10px; }\n.dsh-app-brand-row { height: 48px; display: flex; align-items: center; gap: 6px; flex: none; padding: 0 3px 0 5px; }\n.dsh-app-brand-row > strong { min-width: 0; font-size: 18px; letter-spacing: -.3px; font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.dsh-app-brand-row .dsh-app-button { min-width: 28px; width: 28px; color: var(--dsh-app-muted); }\n.dsh-app-new-chat { justify-content: flex-start; width: 100%; padding: 8px 11px; height: 42px; margin: 6px 0 13px; font-size: 15px; }\n.dsh-app-workspaces { flex: 1; min-height: 0; display: flex; flex-direction: column; }\n.dsh-app-workspaces [role=treeitem] { min-height: 35px; border-radius: 9px; }\n.dsh-app-workspaces [role=treeitem][aria-selected=true] { background: var(--dsh-app-hover); }\n.dsh-app-workspaces [data-row-key^=\"workspace:\"] { margin-top: 5px; }\n.dsh-app-sidebar-foot { flex: none; border-top: 1px solid var(--dsh-app-border); padding-top: 8px; }\n.dsh-app-cost { width: 100%; min-height: 50px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 9px; color: var(--dsh-app-label); background: transparent; text-align: left; cursor: pointer; font: inherit; }\n.dsh-app-cost:hover { background: var(--dsh-app-hover); }\n.dsh-app-cost-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }\n.dsh-app-cost-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; justify-content: space-between; font-size: 12px; }\n.dsh-app-cost-heading strong { font-weight: 600; }\n.dsh-app-cost small { color: var(--dsh-app-muted); font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }\n.dsh-app-cost.has-warning small { color: var(--dsw-alias-state-warn-primary, #b88228); }\n.dsh-app-cost.is-compact { width: 40px; min-height: 40px; justify-content: center; }\n.dsh-app-cost-panel { height: 100%; display: flex; flex-direction: column; min-height: 0; }\n.dsh-app-cost-panel > header { height: 58px; flex: none; padding: 10px 18px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--dsh-app-border); }\n.dsh-app-usage-tabs { display: flex; gap: 8px; align-items: center; }\n.dsh-app-usage-tabs button { font: inherit; cursor: pointer; border: 0; border-radius: 8px; background: transparent; color: var(--dsh-app-muted); padding: 8px 12px; }\n.dsh-app-usage-tabs button[aria-selected=true], .dsh-app-usage-tabs button:hover { background: var(--dsh-app-hover); color: var(--dsh-app-label); }\n.dsh-app-usage-context { flex: 1; min-height: 0; }\n.dsh-app-cost-frame { width: 100%; flex: 1; min-height: 0; border: 0; background: var(--dsh-app-surface); }\n.dsh-app-search-mask { position: fixed; inset: 0; z-index: 2147483647; padding: max(70px, 12vh) 20px 20px; display: flex; align-items: flex-start; justify-content: center; background: #0006; }\n.dsh-app-search-dialog { width: 640px; max-width: 100%; max-height: 75vh; display: flex; flex-direction: column; border-radius: 16px; background: var(--dsh-app-surface); border: 1px solid var(--dsh-app-border); color: var(--dsh-app-label); box-shadow: 0 15px 65px #0005; overflow: hidden; font: 14px/1.5 \"Segoe UI\", \"Microsoft YaHei UI\", system-ui, sans-serif; }\n.dsh-app-search-field { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 16px; border-bottom: 1px solid var(--dsh-app-border); }\n.dsh-app-search-field > svg { color: var(--dsh-app-muted); flex: none; }\n.dsh-app-search-field input { min-width: 0; flex: 1; background: transparent; border: 0; outline: 0; color: inherit; font: inherit; }\n.dsh-app-search-results { overflow-y: auto; padding: 8px; min-height: 0; }\n.dsh-app-search-result { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 11px 13px; text-align: left; color: inherit; background: transparent; border: 0; border-radius: 9px; cursor: pointer; font: inherit; }\n.dsh-app-search-result:hover { background: var(--dsh-app-hover); }\n.dsh-app-search-result strong { font-weight: 500; width: 100%; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }\n.dsh-app-search-result small { color: var(--dsh-app-muted); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.dsh-app-search-status { margin: 0; padding: 14px 20px; color: var(--dsh-app-muted); }\n.dsh-app-search-status.has-error { color: var(--dsw-alias-state-error-primary, #d14a4a); }\n@media (prefers-reduced-motion: no-preference) { .dsh-app-button, .dsh-app-cost { transition: background .12s ease; } }\n");
  },
});
