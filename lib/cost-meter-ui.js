const byId = id => document.getElementById(id)
const language = (window.parent !== window ? window.parent.document.documentElement.lang : navigator.language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
const dictionaries = {
  'zh-CN': {
    title: '费用与用量', refresh: '刷新', back: '返回 DSH', loading: '正在读取账本…', overview: '用量概览',
    allSessions: '所有会话', usageScope: '所选周期的模型调用', details: '费用明细与历史', tokens: 'Token',
    today: '今天', month: '本月', all: '累计', daily: '每日费用', date: '日期', calls: '调用', input: '未缓存输入', cache: '缓存读取', output: '输出', cost: '费用',
    budgetAndDisplay: '预算与显示', enableBudget: '启用预算提醒', period: '周期', everyDay: '每天', everyMonth: '每月', budgetAmount: '预算金额',
    currency: '货币', exchangeRate: '美元兑人民币', save: '保存设置', modelCosts: '模型费用', model: '模型', todaySessions: '今日会话',
    session: '会话', historyTitle: '历史数据', historyNote: '原 dsh-cost-meter 账本保留在原位置，新账本单独保存。启动不等待余额请求；账户余额只查询 DeepSeek 官方 API，不查询第三方额度。',
    estimateNote: '预算只提醒，不阻止发送。费用由模型返回的用量估算；没有价格的模型计数但显示为未计价。',
    budgetOff: '预算提醒未启用', budgetReached: '已达到预算提醒阈值。发送消息仍可正常使用。', saved: '设置已保存。',
    noHistory: '尚无旧账本；新用量会从当前会话开始记录。',
    history: days => `已保留旧账本中的 ${days} 天记录。`,
    unpriced: calls => `${calls} 次调用没有可用价格，未计入金额。`,
    tokenDetail: value => `未缓存输入 ${value.input.toLocaleString()} · 缓存读取 ${value.cacheRead.toLocaleString()} · 缓存写入 ${value.cacheWrite.toLocaleString()} · 输出 ${value.output.toLocaleString()}（含推理 ${value.reasoning.toLocaleString()}）`,
    readError: message => `费用账本读取失败：${message}`, saveError: message => `保存失败：${message}`,
    routePricing: '模型价格', route: '提供商与模型', uncachedPrice: '未缓存输入', cacheReadPrice: '缓存读取', cacheWritePrice: '缓存写入', outputPrice: '输出', savePrice: '保存模型价格',
    priceNote: '单位：美元 / 百万 Token。ASS 和其他中转服务请填写该服务的实际价格；保存后只用于新调用，不改写历史费用。',
    noRoutes: '还没有产生模型调用', unconfigured: '价格未配置', unpricedAmount: '未计价', priceSaved: '模型价格已保存，新调用将按此价格估算。',
    mixedCost: value => `${value} + 未计价`,
    priceMissing: calls => `${calls} 次历史调用未计价；保存价格不会重新估算旧调用。`,
    partialBudget: '未计价费用未扣除',
    balanceTitle: 'DeepSeek API 余额', balanceRefresh: '刷新余额', balanceLoading: '正在查询官方账户余额…', balanceTotal: '总余额', balanceGranted: '赠送余额', balanceTopup: '充值余额',
    balanceNote: '余额来自 DeepSeek 官方 user/balance 接口，保留接口币种，不由本地用量估算。仅使用官方提供商的 API Key；请求经过缓存，刷新间隔由插件配置控制。',
    balanceAvailable: '账户余额可用', balanceUnavailable: '官方接口报告余额不可用', balanceStale: '上次成功余额，当前数据已过期',
    balanceUpdated: time => `查询成功：${time}`, balanceRetry: time => `可重试时间：${time}`, balanceReadError: '无法读取余额，请稍后重试。',
    balanceErrors: { 'missing-key': '官方 DeepSeek API Key 未配置。请在模型设置中配置官方提供商凭据。', 'official-provider-unavailable': 'DeepSeek 官方提供商未启用。', 'non-official-endpoint': '官方提供商当前指向第三方地址，未向 DeepSeek 发送此凭据。', 'credential-conflict': '官方凭据与第三方提供商共用，请配置独立的官方 API Key。', 'configuration-error': '无法读取当前官方提供商配置，请检查 DSH 插件兼容性。', unauthorized: '官方 API Key 无效或没有余额查询权限。', 'rate-limited': '官方接口限制了请求频率。', timeout: '官方余额查询超时。', network: '无法连接 DeepSeek 官方余额接口。', 'tls-error': '官方接口证书验证失败，请检查系统证书与代理。', 'dns-error': '无法解析 DeepSeek 官方接口域名，请检查网络与代理。', 'connection-error': '无法连接官方接口，请检查网络与代理。', 'invalid-response': '官方余额接口返回了无法识别的数据。', 'http-error': '官方余额接口暂时无法完成查询。' },
  },
  en: {
    title: 'Cost and usage', refresh: 'Refresh', back: 'Back to DSH', loading: 'Loading ledger…', overview: 'Usage overview',
    allSessions: 'All conversations', usageScope: 'Model calls in the selected period', details: 'Cost details and history', tokens: 'Tokens',
    today: 'Today', month: 'This month', all: 'All time', daily: 'Daily cost', date: 'Date', calls: 'Calls', input: 'Uncached input', cache: 'Cache read', output: 'Output', cost: 'Cost',
    budgetAndDisplay: 'Budget and display', enableBudget: 'Enable budget warning', period: 'Period', everyDay: 'Daily', everyMonth: 'Monthly', budgetAmount: 'Budget amount',
    currency: 'Currency', exchangeRate: 'USD to CNY', save: 'Save settings', modelCosts: 'Cost by model', model: 'Model', todaySessions: 'Today’s conversations',
    session: 'Conversation', historyTitle: 'History', historyNote: 'The original dsh-cost-meter ledger remains in place; the new ledger is saved separately. Startup does not wait for balance requests. Account balances are queried only from the official DeepSeek API.',
    estimateNote: 'Budgets warn without blocking messages. Costs are estimated from model-reported usage; calls without a price remain counted as unpriced.',
    budgetOff: 'Budget warning is off', budgetReached: 'Budget warning threshold reached. You can still send messages.', saved: 'Settings saved.',
    noHistory: 'No older ledger found; new usage is recorded from this conversation onward.',
    history: days => `Preserved ${days} days from the old ledger.`,
    unpriced: calls => `${calls} calls have no available price and are excluded from the amount.`,
    tokenDetail: value => `Uncached input ${value.input.toLocaleString()} · cache read ${value.cacheRead.toLocaleString()} · cache write ${value.cacheWrite.toLocaleString()} · output ${value.output.toLocaleString()} (including ${value.reasoning.toLocaleString()} reasoning)`,
    readError: message => `Could not read the cost ledger: ${message}`, saveError: message => `Could not save settings: ${message}`,
    routePricing: 'Model prices', route: 'Provider and model', uncachedPrice: 'Uncached input', cacheReadPrice: 'Cache read', cacheWritePrice: 'Cache write', outputPrice: 'Output', savePrice: 'Save model price',
    priceNote: 'USD per million tokens. Enter the actual rates charged by ASS or another relay. Saved rates apply to new calls and leave historical costs unchanged.',
    noRoutes: 'No model calls recorded yet', unconfigured: 'Price not configured', unpricedAmount: 'Unpriced', priceSaved: 'Model price saved. New calls will use these rates.',
    mixedCost: value => `${value} + unpriced`,
    priceMissing: calls => `${calls} historical calls are unpriced. Saving rates will not recalculate them.`,
    partialBudget: 'Unpriced costs are not deducted',
    balanceTitle: 'DeepSeek API balance', balanceRefresh: 'Refresh balance', balanceLoading: 'Checking the official account balance…', balanceTotal: 'Total balance', balanceGranted: 'Granted balance', balanceTopup: 'Topped-up balance',
    balanceNote: 'Balances come from the official DeepSeek user/balance API, retain their original currencies, and are independent of local usage estimates. Only the official provider’s API key is used. Requests are cached and refresh intervals are controlled by plugin configuration.',
    balanceAvailable: 'Account balance is available', balanceUnavailable: 'The official API reports an unavailable balance', balanceStale: 'Last successful balance; current data is stale',
    balanceUpdated: time => `Last successful check: ${time}`, balanceRetry: time => `Retry after: ${time}`, balanceReadError: 'Could not read the balance. Try again later.',
    balanceErrors: { 'missing-key': 'The official DeepSeek API key is not configured. Add the official provider’s credential in model settings.', 'official-provider-unavailable': 'The official DeepSeek provider is not enabled.', 'non-official-endpoint': 'The official provider currently points to a third-party URL; its credential was not sent to DeepSeek.', 'credential-conflict': 'The official credential reference is shared with a third-party provider. Configure a separate official API key.', 'configuration-error': 'Could not read the active official provider configuration. Check DSH plugin compatibility.', unauthorized: 'The official API key is invalid or cannot query balances.', 'rate-limited': 'The official API has limited the request rate.', timeout: 'The official balance request timed out.', network: 'Could not connect to the official DeepSeek balance API.', 'tls-error': 'The official endpoint certificate could not be verified. Check system certificates and proxy settings.', 'dns-error': 'Could not resolve the official DeepSeek hostname. Check network and proxy settings.', 'connection-error': 'Could not connect to the official endpoint. Check network and proxy settings.', 'invalid-response': 'The official balance API returned unrecognized data.', 'http-error': 'The official balance API could not complete this request.' },
  },
}
const copy = dictionaries[language]
document.documentElement.lang = language
document.title = `${copy.title} — DSH`
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = copy[node.dataset.i18n]
for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', copy[node.dataset.i18nAria])
if (window.parent !== window) document.querySelector('a[data-i18n="back"]').hidden = true
let state

function notifySaved() {
  if (window.parent !== window) window.parent.postMessage({ type: 'dsh-app:cost-changed' }, window.location.origin)
}

function renderBalance(data) {
  const rows = byId('balances')
  rows.replaceChildren()
  for (const balance of data.balances) {
    const row = document.createElement('tr')
    for (const value of [balance.currency, balance.totalBalance, balance.grantedBalance, balance.toppedUpBalance]) cell(row, value)
    rows.append(row)
  }
  const notices = []
  if (data.error) notices.push(copy.balanceErrors[data.error] ?? copy.balanceReadError)
  if (data.balances.length) {
    notices.push(data.stale ? copy.balanceStale : data.isAvailable ? copy.balanceAvailable : copy.balanceUnavailable)
    notices.push(copy.balanceUpdated(new Date(data.updatedAt).toLocaleString(language)))
  }
  if (data.status === 'error' && data.retryAt) notices.push(copy.balanceRetry(new Date(data.retryAt).toLocaleString(language)))
  byId('balance-status').textContent = notices.join(' · ')
}

async function loadBalance(force = false) {
  const button = byId('refresh-balance')
  if (button.disabled) return
  button.disabled = true
  try {
    const response = await fetch(force ? '/dsh-app/balance/refresh' : '/dsh-app/balance.json', { method: force ? 'POST' : 'GET', cache: 'no-store' })
    if (!response.ok) throw new Error('balance-response')
    renderBalance(await response.json())
    if (force && window.parent !== window) window.parent.postMessage({ type: 'dsh-app:balance-changed' }, window.location.origin)
  } catch { byId('balance-status').textContent = copy.balanceReadError }
  finally { button.disabled = false }
}

function money(value) {
  const factor = state.config.currency === 'CNY' ? state.config.exchangeRate : 1
  return `${state.config.currency === 'CNY' ? '¥' : '$'}${(value * factor).toFixed(4)}`
}

function billed(value) {
  if (value.unpricedCalls >= value.calls && value.calls > 0) return copy.unpricedAmount
  return value.unpricedCalls > 0 ? copy.mixedCost(money(value.apiCost)) : money(value.apiCost)
}

function showRoutePrice() {
  const route = state.routes.find(row => row.name === byId('price-route').value)
  const price = route?.price
  for (const [id, key] of [['input', 'cacheMiss'], ['cache', 'cacheHit'], ['write', 'cacheWrite'], ['output', 'output']]) {
    byId(`price-${id}`).value = price ? price[key] ?? price.cacheHit : ''
    byId(`price-${id}`).disabled = !route
  }
  byId('save-price').disabled = !route
  byId('price-status').textContent = route?.unpricedCalls > 0 ? copy.priceMissing(route.unpricedCalls) : price ? '' : copy.unconfigured
}

function cell(row, value) {
  const node = document.createElement('td')
  node.textContent = value
  row.append(node)
}

function renderPeriod() {
  if (!state) return
  const key = byId('usage-period').value
  const usage = state[key]
  byId('usage-cost').textContent = billed(usage)
  byId('usage-cost-detail').textContent = usage.unpricedCalls > 0 ? copy.unpriced(usage.unpricedCalls) : copy[key]
  byId('usage-tokens').textContent = (usage.input + usage.cacheRead + usage.cacheWrite + usage.output).toLocaleString(language)
  byId('usage-token-detail').textContent = copy.tokenDetail(usage)
  byId('usage-calls').textContent = usage.calls.toLocaleString(language)
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const selectedDays = state.days.filter(row => key === 'all' || (key === 'today' ? row.date === date : row.date.startsWith(date.slice(0, 7))))
  const days = byId('days')
  days.replaceChildren()
  for (const day of selectedDays.slice(0, 90)) {
    const row = document.createElement('tr')
    for (const value of [day.date, day.calls, day.input, day.cacheRead, day.output, billed(day)]) cell(row, String(value))
    days.append(row)
  }
  const models = new Map()
  for (const day of selectedDays) for (const model of day.models) {
    const value = models.get(model.name) ?? { calls: 0, apiCost: 0, unpricedCalls: 0 }
    value.calls += model.calls
    value.apiCost += model.apiCost
    value.unpricedCalls += model.unpricedCalls
    models.set(model.name, value)
  }
  const modelRows = byId('models')
  modelRows.replaceChildren()
  for (const [name, value] of [...models].sort((a, b) => b[1].apiCost - a[1].apiCost)) {
    const row = document.createElement('tr')
    for (const field of [name, value.calls.toLocaleString(), billed(value)]) cell(row, field)
    modelRows.append(row)
  }
}

function render(data) {
  state = data
  renderPeriod()
  const sessions = byId('sessions')
  sessions.replaceChildren()
  for (const session of data.sessions) {
    const row = document.createElement('tr')
    for (const field of [session.title || session.id.slice(0, 16), session.calls.toLocaleString(), billed(session)]) cell(row, field)
    sessions.append(row)
  }
  const budget = data.config.budget
  byId('budget-enabled').checked = budget.enabled
  byId('budget-period').value = budget.period === 'day' ? 'day' : 'month'
  byId('budget-amount').value = budget.amount
  byId('currency').value = data.config.currency
  byId('exchange-rate').value = data.config.exchangeRate
  const spent = budget.period === 'day' ? data.today.apiCost : data.month.apiCost
  const periodUsage = budget.period === 'day' ? data.today : data.month
  const cap = budget.amount / (data.config.currency === 'CNY' ? data.config.exchangeRate : 1)
  byId('budget-overview').hidden = !budget.enabled
  byId('budget-scope').textContent = `${copy.budgetAndDisplay} · ${copy[budget.period === 'day' ? 'today' : 'month']}`
  byId('budget-label').textContent = budget.enabled
    ? `${money(spent)} / ${money(cap)}${periodUsage.unpricedCalls > 0 ? ` · ${copy.partialBudget}` : ''}`
    : copy.budgetOff
  byId('budget-fill').style.width = budget.enabled && cap > 0 ? `${Math.min(100, spent / cap * 100)}%` : '0%'
  byId('history').textContent = data.historyImported ? copy.history(data.days.length) : copy.noHistory
  byId('status').textContent = budget.enabled && cap > 0 && spent >= cap
    ? copy.budgetReached
    : data.all.unpricedCalls > 0 ? copy.unpriced(data.all.unpricedCalls) : ''
  const select = byId('price-route')
  const selectedRoute = select.value
  select.replaceChildren()
  for (const route of data.routes) {
    const option = document.createElement('option')
    option.value = route.name
    option.textContent = `${route.name}${route.price ? '' : ` — ${copy.unconfigured}`}`
    select.append(option)
  }
  if (!data.routes.length) {
    const option = document.createElement('option')
    option.textContent = copy.noRoutes
    select.append(option)
  } else if (data.routes.some(route => route.name === selectedRoute)) select.value = selectedRoute
  showRoutePrice()
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
    notifySaved()
  } catch (error) { byId('status').textContent = copy.saveError(error.message) }
})

byId('refresh').addEventListener('click', () => { void load(); void loadBalance() })
byId('usage-period').addEventListener('change', renderPeriod)
byId('refresh-balance').addEventListener('click', () => { void loadBalance(true) })
byId('price-route').addEventListener('change', showRoutePrice)
byId('pricing').addEventListener('submit', async event => {
  event.preventDefault()
  const route = state.routes.find(row => row.name === byId('price-route').value)
  if (!route) return
  try {
    const response = await fetch('/dsh-app/cost/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pricing: [{
        provider: route.provider, model: route.model,
        cacheMiss: Number(byId('price-input').value), cacheHit: Number(byId('price-cache').value),
        cacheWrite: Number(byId('price-write').value), output: Number(byId('price-output').value),
      }] }),
    })
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
    await load()
    byId('status').textContent = copy.priceSaved
    notifySaved()
  } catch (error) { byId('status').textContent = copy.saveError(error.message) }
})
void load()
void loadBalance()
