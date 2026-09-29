/** Local cost accounting over durable DSH usage events and the legacy ledger. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'calls', 'cost', 'apiCost']
const zero = () => Object.fromEntries(fields.map(key => [key, 0]))
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const dayKey = time => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const own = (object, key) => Object.hasOwn(object ?? {}, key) ? object[key] : undefined

/** Read a provider usage sample from one settled, durable assistant event. */
export function usageOf(event) {
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return
  if (event.type === 'assistant/message' && event.data.usage) return event.data.usage
  for (let index = event.data.stream.length - 1; index >= 0; index--) {
    const item = event.data.stream[index]
    if (item.type === 'chunk' && item.chunk?.type === 'usage') return item.chunk.usage
  }
}

/** Select the saved price tier at the call time; unknown routes remain unpriced. */
export function priceOf(prices, provider, model, time, config = {}) {
  const providerModels = own(own(prices?.providers, provider), 'models')
  const entry = own(providerModels, model) ?? (provider === 'deepseek-official'
    ? own(prices?.models, model) ?? prices?.default : undefined)
  if (!entry) return
  if (!config.peakEnabled || !entry.peak || !entry.offPeak || time < Date.parse(config.peakEffectiveAt ?? ''))
    return entry.offPeak ?? entry
  const beijing = new Date(time + 8 * 3600_000)
  const date = beijing.toISOString().slice(0, 10)
  if (beijing.getUTCDay() === 0 || beijing.getUTCDay() === 6 || config.peakHolidays?.includes(date))
    return entry.offPeak
  const hour = new Date(time).getUTCHours()
  return config.peakWindows?.some(window => hour >= window.start && hour < window.end)
    ? entry.peak : entry.offPeak
}

/** Bill disjoint input/cache/output buckets at USD per million tokens. */
export function amountOf(usage, price) {
  if (!price) return 0
  return (finite(usage.inputTokens) * finite(price.cacheMiss)
    + (finite(usage.cacheReadTokens) + finite(usage.cacheWriteTokens)) * finite(price.cacheHit)
    + finite(usage.outputTokens) * finite(price.output)) / 1_000_000
}

function add(target, usage, amount, apiAmount = amount) {
  target.input += finite(usage.inputTokens)
  target.output += finite(usage.outputTokens)
  target.cacheRead += finite(usage.cacheReadTokens)
  target.cacheWrite += finite(usage.cacheWriteTokens)
  target.reasoning += finite(usage.reasoningTokens)
  target.calls++
  target.cost += amount
  target.apiCost += apiAmount
}

/** Own a new ledger while retaining the original cost-meter file unchanged. */
export class CostLedger {
  constructor(home) {
    this.path = join(home, 'storages', 'dsh-app-cost', 'ledger.json')
    this.legacyPath = join(home, 'storages', 'cost-meter', 'ledger.json')
    this.data = undefined
  }

  load() {
    if (this.data) return this.data
    if (existsSync(this.path)) {
      const value = JSON.parse(readFileSync(this.path, 'utf8'))
      if (value.version !== 1 || !value.days || !value.config) throw new Error('DSH cost ledger format is invalid')
      return (this.data = value)
    }
    const legacyBytes = existsSync(this.legacyPath) ? readFileSync(this.legacyPath) : undefined
    const legacy = legacyBytes ? JSON.parse(legacyBytes.toString('utf8')) : undefined
    if (legacy && (legacy.version !== 1 || !legacy.days || !legacy.config))
      throw new Error('Legacy cost ledger format is invalid; original file was not changed')
    const imported = {
      version: 1,
      importedSha256: legacyBytes ? createHash('sha256').update(legacyBytes).digest('hex') : null,
      days: legacy ? structuredClone(legacy.days) : {},
      config: {
        currency: legacy?.config.currency ?? 'USD',
        exchangeRate: finite(legacy?.config.exchangeRate) || 1,
        budget: legacy?.config.budget ?? { enabled: false, amount: 0, period: 'month' },
        prices: legacy?.config.prices ?? { models: {}, providers: {} },
        peakEnabled: legacy?.config.peakEnabled ?? false,
        peakEffectiveAt: legacy?.config.peakEffectiveAt,
        peakHolidays: legacy?.config.peakHolidays ?? [],
        peakWindows: legacy?.config.peakWindows ?? [],
      },
    }
    this.data = imported
    try { this.flush() }
    catch (error) { this.data = undefined; throw error }
    return imported
  }

  record(session, event) {
    const usage = usageOf(event)
    if (!usage) return
    const header = session.requestHeader()
    const source = event.type === 'assistant/message' ? event.data.message?.source : undefined
    const provider = source?.provider || header?.config?.provider
    const model = source?.model || header?.config?.model
    if (!provider || !model) return
    const data = this.load()
    const price = priceOf(data.config.prices, provider, model, event.time, data.config)
    const amount = amountOf(usage, price)
    const key = dayKey(event.time)
    const day = own(data.days, key) ?? (data.days[key] = { date: key, ...zero(), byProviderModel: {}, sessions: [] })
    add(day, usage, amount)
    if (!price) day.unpricedCalls = finite(day.unpricedCalls) + 1
    const route = `${provider}:${model}`
    const modelRow = own(day.byProviderModel, route) ?? (day.byProviderModel[route] = zero())
    add(modelRow, usage, amount)
    if (!price) modelRow.unpricedCalls = finite(modelRow.unpricedCalls) + 1
    const sessionId = String(session.id)
    let row = day.sessions.find(value => value.id === sessionId)
    if (!row) {
      row = { id: sessionId, ...zero(), byProviderModel: {}, at: event.time }
      day.sessions.push(row)
    }
    add(row, usage, amount)
    if (!price) row.unpricedCalls = finite(row.unpricedCalls) + 1
    add(own(row.byProviderModel, route) ?? (row.byProviderModel[route] = zero()), usage, amount)
    this.flush()
  }

  summary() {
    const data = this.load()
    const days = Object.values(data.days).sort((a, b) => b.date.localeCompare(a.date))
    const today = dayKey(Date.now())
    const month = today.slice(0, 7)
    const sum = rows => rows.reduce((value, row) => {
      for (const field of fields) value[field] += finite(row[field])
      value.unpricedCalls += finite(row.unpricedCalls)
      return value
    }, { ...zero(), unpricedCalls: 0 })
    return {
      today: sum(days.filter(row => row.date === today)),
      month: sum(days.filter(row => row.date.startsWith(month))),
      all: sum(days),
      days: days.map(row => ({ date: row.date, ...Object.fromEntries(fields.map(field => [field, finite(row[field])])), unpricedCalls: finite(row.unpricedCalls),
        models: Object.entries(row.byProviderModel ?? {}).map(([name, value]) => ({ name, ...Object.fromEntries(fields.map(field => [field, finite(value[field])])), unpricedCalls: finite(value.unpricedCalls) })) })),
      sessions: (days.find(row => row.date === today)?.sessions ?? []).map(row => ({
        id: String(row.id), title: typeof row.title === 'string' ? row.title : '',
        ...Object.fromEntries(fields.map(field => [field, finite(row[field])])),
      })).sort((a, b) => b.apiCost - a.apiCost).slice(0, 50),
      config: { currency: data.config.currency, exchangeRate: data.config.exchangeRate, budget: data.config.budget },
      historyImported: data.importedSha256 !== null,
    }
  }

  updateSettings(patch) {
    const data = this.load()
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid cost settings')
    const { currency, exchangeRate, budget } = patch
    if (currency !== undefined && !['USD', 'CNY'].includes(currency)) throw new Error('Currency must be USD or CNY')
    if (exchangeRate !== undefined && (!Number.isFinite(exchangeRate) || exchangeRate <= 0))
      throw new Error('Exchange rate must be positive')
    if (budget !== undefined && (typeof budget !== 'object' || budget === null
      || typeof budget.enabled !== 'boolean' || !Number.isFinite(budget.amount) || budget.amount < 0
      || !['day', 'month'].includes(budget.period))) throw new Error('Invalid budget')
    const previous = data.config
    data.config = {
      ...previous,
      ...(currency === undefined ? {} : { currency }),
      ...(exchangeRate === undefined ? {} : { exchangeRate }),
      ...(budget === undefined ? {} : { budget: { ...previous.budget, enabled: budget.enabled, amount: budget.amount, period: budget.period } }),
    }
    try { this.flush() }
    catch (error) { data.config = previous; throw error }
  }

  flush() {
    if (!this.data) return
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 })
    renameSync(temporary, this.path)
  }

  close() {
    this.flush()
  }
}

/** Mount authenticated read/update routes and record only settled model usage. */
export function installCostMeter(ctx, { home }) {
  const ledger = new CostLedger(home)
  ctx.effect(() => () => ledger.close(), 'dsh-app: cost ledger close')
  let recordFailureLogged = false
  ctx.on('session/event', (session, event) => {
    try { ledger.record(session, event) }
    catch (error) {
      if (!recordFailureLogged) console.warn(`DSH cost ledger recording failed: ${String(error)}`)
      recordFailureLogged = true
    }
  }, { global: true })
  const html = readFileSync(new URL('./cost-meter.html', import.meta.url))
  const script = readFileSync(new URL('./cost-meter-ui.js', import.meta.url))
  const routes = [
    ['/dsh-app/cost', 'text/html; charset=utf-8', html],
    ['/dsh-app/cost-ui.js', 'text/javascript; charset=utf-8', script],
    ['/dsh-app/cost.json', 'application/json', () => JSON.stringify(ledger.summary())],
  ]
  for (const [path, type, content] of routes) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path,
    handler(request, response) {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
      if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
      try {
        const value = typeof content === 'function' ? content() : content
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'" })
        response.end(value)
      } catch {
        if (!response.headersSent) response.writeHead(500)
        response.end('Cost ledger unavailable')
      }
    },
  }))
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-app/cost/settings',
    handler(request, response) {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
      if (request.method !== 'POST') { response.writeHead(405); response.end(); return }
      const origin = `http://127.0.0.1:${ctx.webServer.port}`
      if (request.headers.origin !== origin) { response.writeHead(403); response.end(); return }
      let body = '', tooLarge = false
      request.on('data', chunk => {
        if (tooLarge) return
        if (Buffer.byteLength(body) + chunk.length > 16_384) { tooLarge = true; body = ''; return }
        body += chunk
      })
      request.on('end', () => {
        if (tooLarge) { response.writeHead(413); response.end(); return }
        try {
          ledger.updateSettings(JSON.parse(body))
          response.writeHead(204); response.end()
        } catch (error) {
          response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          response.end(String(error.message))
        }
      })
    },
  }))
  return ledger
}
