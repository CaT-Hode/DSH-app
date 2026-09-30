/** Context insight renders official Session projections and one bounded activity fold. */
export default function createContextInsightClient(require) {
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
