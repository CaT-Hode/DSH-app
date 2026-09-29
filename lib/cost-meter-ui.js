const byId = id => document.getElementById(id)
const language = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
const dictionaries = {
  'zh-CN': {
    title: '费用统计', subtitle: '本地账本 · 无启动网络请求', refresh: '刷新', back: '返回 DSH', loading: '正在读取账本…', overview: '费用概览',
    today: '今天', month: '本月', all: '累计', daily: '每日费用', date: '日期', calls: '调用', input: '输入', cache: '缓存', output: '输出', cost: '费用',
    budgetAndDisplay: '预算与显示', enableBudget: '启用预算提醒', period: '周期', everyDay: '每天', everyMonth: '每月', budgetAmount: '预算金额',
    currency: '货币', exchangeRate: '美元兑人民币', save: '保存设置', modelCosts: '模型费用', model: '模型', todaySessions: '今日会话',
    session: '会话', historyTitle: '历史数据', historyNote: '原 dsh-cost-meter 账本保留在原位置，新账本单独保存。启动时不会请求外部余额或第三方额度。',
    estimateNote: '预算只提醒，不阻止发送。费用由模型返回的用量估算；没有价格的模型计数但显示为未计价。',
    budgetOff: '预算提醒未启用', budgetReached: '已达到预算提醒阈值。发送消息仍可正常使用。', saved: '设置已保存。',
    noHistory: '尚无旧账本；新用量会从当前会话开始记录。',
    history: days => `已保留旧账本中的 ${days} 天记录。`,
    unpriced: calls => `${calls} 次调用没有可用价格，未计入金额。`,
    counts: value => `${value.calls.toLocaleString()} 次调用 · 输入 ${value.input.toLocaleString()} · 缓存 ${value.cacheRead.toLocaleString()} · 输出 ${value.output.toLocaleString()} token`,
    readError: message => `费用账本读取失败：${message}`, saveError: message => `保存失败：${message}`,
  },
  en: {
    title: 'Cost and usage', subtitle: 'Local ledger · no startup network requests', refresh: 'Refresh', back: 'Back to DSH', loading: 'Loading ledger…', overview: 'Cost overview',
    today: 'Today', month: 'This month', all: 'All time', daily: 'Daily cost', date: 'Date', calls: 'Calls', input: 'Input', cache: 'Cache', output: 'Output', cost: 'Cost',
    budgetAndDisplay: 'Budget and display', enableBudget: 'Enable budget warning', period: 'Period', everyDay: 'Daily', everyMonth: 'Monthly', budgetAmount: 'Budget amount',
    currency: 'Currency', exchangeRate: 'USD to CNY', save: 'Save settings', modelCosts: 'Cost by model', model: 'Model', todaySessions: 'Today’s conversations',
    session: 'Conversation', historyTitle: 'History', historyNote: 'The original dsh-cost-meter ledger remains in place; the new ledger is saved separately. Startup does not request external balances or third-party quotas.',
    estimateNote: 'Budgets warn without blocking messages. Costs are estimated from model-reported usage; calls without a price remain counted as unpriced.',
    budgetOff: 'Budget warning is off', budgetReached: 'Budget warning threshold reached. You can still send messages.', saved: 'Settings saved.',
    noHistory: 'No older ledger found; new usage is recorded from this conversation onward.',
    history: days => `Preserved ${days} days from the old ledger.`,
    unpriced: calls => `${calls} calls have no available price and are excluded from the amount.`,
    counts: value => `${value.calls.toLocaleString()} calls · input ${value.input.toLocaleString()} · cache ${value.cacheRead.toLocaleString()} · output ${value.output.toLocaleString()} tokens`,
    readError: message => `Could not read the cost ledger: ${message}`, saveError: message => `Could not save settings: ${message}`,
  },
}
const copy = dictionaries[language]
document.documentElement.lang = language
document.title = `${copy.title} — DSH`
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = copy[node.dataset.i18n]
for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', copy[node.dataset.i18nAria])
let state

function money(value) {
  const factor = state.config.currency === 'CNY' ? state.config.exchangeRate : 1
  return `${state.config.currency === 'CNY' ? '¥' : '$'}${(value * factor).toFixed(4)}`
}

function cell(row, value) {
  const node = document.createElement('td')
  node.textContent = value
  row.append(node)
}

function render(data) {
  state = data
  for (const key of ['today', 'month', 'all']) {
    byId(key).textContent = money(data[key].apiCost)
    byId(`${key}-detail`).textContent = copy.counts(data[key])
  }
  const days = byId('days')
  days.replaceChildren()
  for (const day of data.days.slice(0, 90)) {
    const row = document.createElement('tr')
    for (const value of [day.date, day.calls, day.input, day.cacheRead, day.output, money(day.apiCost)]) cell(row, String(value))
    days.append(row)
  }
  const models = new Map()
  for (const day of data.days) for (const model of day.models) {
    const value = models.get(model.name) ?? { calls: 0, cost: 0 }
    value.calls += model.calls
    value.cost += model.apiCost
    models.set(model.name, value)
  }
  const modelRows = byId('models')
  modelRows.replaceChildren()
  for (const [name, value] of [...models].sort((a, b) => b[1].cost - a[1].cost)) {
    const row = document.createElement('tr')
    for (const field of [name, value.calls.toLocaleString(), money(value.cost)]) cell(row, field)
    modelRows.append(row)
  }
  const sessions = byId('sessions')
  sessions.replaceChildren()
  for (const session of data.sessions) {
    const row = document.createElement('tr')
    for (const field of [session.title || session.id.slice(0, 16), session.calls.toLocaleString(), money(session.apiCost)]) cell(row, field)
    sessions.append(row)
  }
  const budget = data.config.budget
  byId('budget-enabled').checked = budget.enabled
  byId('budget-period').value = budget.period === 'day' ? 'day' : 'month'
  byId('budget-amount').value = budget.amount
  byId('currency').value = data.config.currency
  byId('exchange-rate').value = data.config.exchangeRate
  const spent = budget.period === 'day' ? data.today.apiCost : data.month.apiCost
  const cap = budget.amount / (data.config.currency === 'CNY' ? data.config.exchangeRate : 1)
  byId('budget-label').textContent = budget.enabled ? `${money(spent)} / ${money(cap)}` : copy.budgetOff
  byId('budget-fill').style.width = budget.enabled && cap > 0 ? `${Math.min(100, spent / cap * 100)}%` : '0%'
  byId('history').textContent = data.historyImported ? copy.history(data.days.length) : copy.noHistory
  byId('status').textContent = budget.enabled && cap > 0 && spent >= cap
    ? copy.budgetReached
    : data.all.unpricedCalls > 0 ? copy.unpriced(data.all.unpricedCalls) : ''
}

async function load() {
  try {
    const response = await fetch('/dsh-app/cost.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    render(await response.json())
  } catch (error) { byId('status').textContent = copy.readError(error.message) }
}

byId('settings').addEventListener('submit', async event => {
  event.preventDefault()
  const body = {
    currency: byId('currency').value,
    exchangeRate: Number(byId('exchange-rate').value),
    budget: {
      enabled: byId('budget-enabled').checked,
      period: byId('budget-period').value,
      amount: Number(byId('budget-amount').value),
    },
  }
  try {
    const response = await fetch('/dsh-app/cost/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
    await load()
    byId('status').textContent = copy.saved
  } catch (error) { byId('status').textContent = copy.saveError(error.message) }
})

byId('refresh').addEventListener('click', () => { void load() })
void load()
