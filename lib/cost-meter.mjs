/** Local cost accounting over durable DSH usage events and the legacy ledger. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DeepSeekBalance } from './deepseek-balance.mjs'
import { officialPriceOf, officialPricing } from './official-pricing.mjs'

const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'calls', 'cost', 'apiCost', 'nativeCny', 'nativeUsd']
const zero = () => Object.fromEntries(fields.map(key => [key, 0]))
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const dayKey = time => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const own = (object, key) => Object.hasOwn(object ?? {}, key) ? object[key] : undefined
const rateKeys = ['cacheHit', 'cacheMiss', 'cacheWrite', 'output']
const ratesOf = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && rateKeys.every(key => Number.isFinite(value[key]) && value[key] >= 0)
const pickRates = value => Object.fromEntries(rateKeys.map(key => [key, value[key]]))

/** Accept one submitted price row: a flat rate set, a peak/off-peak pair, or a removal. */
function priceEntryOf(row) {
  if (row.remove === true) return { remove: true }
  if (ratesOf(row.offPeak) && ratesOf(row.peak)) return { offPeak: pickRates(row.offPeak), peak: pickRates(row.peak) }
  if (ratesOf(row)) return { offPeak: pickRates(row) }
  return null
}

/** Flatten the stored price book into the rows the cost page renders. */
function priceBookOf(prices) {
  const rows = []
  for (const [provider, entry] of Object.entries(prices?.providers ?? {}))
    for (const [model, price] of Object.entries(entry?.models ?? {}))
      rows.push({ provider, model, source: typeof price?.source === 'string' ? price.source : 'user',
        checkedAt: typeof price?.checkedAt === 'string' ? price.checkedAt : null,
        mode: ratesOf(price?.offPeak) && ratesOf(price?.peak) ? 'tiered' : 'single',
        ...Object.fromEntries(rateKeys.map(key => [key, finite(price?.[key])])),
        offPeak: ratesOf(price?.offPeak) ? pickRates(price.offPeak) : null,
        peak: ratesOf(price?.peak) ? pickRates(price.peak) : null })
  return rows.sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`))
}

/** Read a provider usage sample from one settled, durable assistant event. */
export function usageOf(event) {
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return
  if (event.type === 'assistant/message' && event.data?.usage) return event.data.usage
  for (let index = (event.data?.stream?.length ?? 0) - 1; index >= 0; index--) {
    const item = event.data.stream[index]
    if (item.type === 'chunk' && item.chunk?.type === 'usage') return item.chunk.usage
  }
}

/** Select the saved price tier at the call time; unknown routes remain unpriced. */
export function priceOf(prices, provider, model, time, config = {}) {
  const providerModels = own(own(prices?.providers, provider), 'models')
  const entry = own(providerModels, model) ?? (provider === 'deepseek-official'
    ? own(prices?.models, model) ?? prices?.default : undefined)
  if (!entry) return provider === 'deepseek-official' ? officialPriceOf(model, time) : undefined
  if (!config.peakEnabled || !entry.peak || !entry.offPeak || time < Date.parse(config.peakEffectiveAt ?? ''))
    return entry.offPeak ?? entry
  const beijing = new Date(time + 8 * 3600_000)
  const date = beijing.toISOString().slice(0, 10)
  if (beijing.getUTCDay() === 0 || beijing.getUTCDay() === 6 || config.peakHolidays?.includes(date))
    return entry.offPeak
  // Peak windows are Beijing hours, like the weekend and holiday rules above.
  const hour = new Date(time + 8 * 3600_000).getUTCHours()
  return config.peakWindows?.some(window => hour >= window.start && hour < window.end)
    ? entry.peak : entry.offPeak
}

/** Bill disjoint input/cache/output buckets at USD per million tokens. */
export function amountOf(usage, price) {
  if (!price) return 0
  return (finite(usage.inputTokens) * finite(price.cacheMiss)
    + finite(usage.cacheReadTokens) * finite(price.cacheHit)
    + finite(usage.cacheWriteTokens) * finite(price.cacheWrite ?? price.cacheHit)
    + finite(usage.outputTokens) * finite(price.output)) / 1_000_000
}

function add(target, usage, amount, apiAmount = amount, cny) {
  for (const field of fields) target[field] = finite(target[field])
  target.input += finite(usage.inputTokens)
  target.output += finite(usage.outputTokens)
  target.cacheRead += finite(usage.cacheReadTokens)
  target.cacheWrite += finite(usage.cacheWriteTokens)
  target.reasoning += finite(usage.reasoningTokens)
  target.calls++
  target.cost += amount
  target.apiCost += apiAmount
  if (cny !== undefined) { target.nativeUsd += apiAmount; target.nativeCny += cny }
}

/** Own a new ledger while retaining the original cost-meter file unchanged. */
export class CostLedger {
  constructor(home) {
    this.path = join(home, 'storages', 'dsh-app-cost', 'ledger.json')
    this.legacyPath = join(home, 'storages', 'cost-meter', 'ledger.json')
    this.data = undefined
    this.observed = new WeakMap()
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
        currency: legacy?.config.currency ?? 'CNY',
        heatmapPeriod: legacy?.config.heatmapPeriod === 'month' ? 'month' : 'today',
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
    // A settled event can reach the same observer twice; new retry attempts use a new seq.
    const previousSeq = this.observed.get(session)
    if (Number.isSafeInteger(event.seq) && previousSeq !== undefined && event.seq <= previousSeq) return
    const data = this.load()
    const price = priceOf(data.config.prices, provider, model, event.time, data.config)
    const amount = amountOf(usage, price)
    const cny = price?.source === 'deepseek-official' ? amountOf(usage, price.cny) : undefined
    const key = dayKey(event.time)
    const day = own(data.days, key) ?? (data.days[key] = { date: key, ...zero(), byProviderModel: {}, sessions: [] })
    add(day, usage, amount, amount, cny)
    if (!price) day.unpricedCalls = finite(day.unpricedCalls) + 1
    const route = `${provider}:${model}`
    const modelRow = own(day.byProviderModel, route) ?? (day.byProviderModel[route] = zero())
    add(modelRow, usage, amount, amount, cny)
    if (!price) modelRow.unpricedCalls = finite(modelRow.unpricedCalls) + 1
    const sessionId = String(session.id)
    let row = day.sessions.find(value => value.id === sessionId)
    if (!row) {
      row = { id: sessionId, ...zero(), byProviderModel: {}, at: event.time }
      day.sessions.push(row)
    }
    add(row, usage, amount, amount, cny)
    if (!price) row.unpricedCalls = finite(row.unpricedCalls) + 1
    const sessionModel = own(row.byProviderModel, route) ?? (row.byProviderModel[route] = zero())
    add(sessionModel, usage, amount, amount, cny)
    if (!price) sessionModel.unpricedCalls = finite(sessionModel.unpricedCalls) + 1
    const hour = new Date(event.time).getHours()
    row.hours ??= {}
    day.hours ??= {}
    add(own(row.hours, hour) ?? (row.hours[hour] = zero()), usage, amount, amount, cny)
    add(own(day.hours, hour) ?? (day.hours[hour] = zero()), usage, amount, amount, cny)
    this.flush()
    if (Number.isSafeInteger(event.seq)) this.observed.set(session, event.seq)
  }

  /** Restore only a previously counted session, with an exact counter match.
   * Forked/inherited events and unrelated sessions never create new charges.
   * Existing priced history is retained; official unpriced calls get an estimate.
   */
  restoreSessionUsage(id, events) {
    const data = this.load(), recovered = new Map(), seen = new Set()
    let header
    for (const event of events) {
      if (event.type === 'request/header') header = event.data?.header
      const usage = usageOf(event)
      if (!usage || !Number.isFinite(event.time) || seen.has(event.seq)) continue
      seen.add(event.seq)
      const source = event.data?.message?.source
      const provider = source?.provider ?? header?.config?.provider, model = source?.model ?? header?.config?.model
      if (!provider || !model) continue
      const key = dayKey(event.time), route = `${provider}:${model}`
      const row = recovered.get(key) ?? { ...zero(), hours: {}, byProviderModel: {}, unpricedCalls: 0 }
      const price = priceOf(data.config.prices, provider, model, event.time, data.config)
      const amount = amountOf(usage, price), cny = price?.source === 'deepseek-official' ? amountOf(usage, price.cny) : undefined
      add(row, usage, amount, amount, cny)
      if (!price) row.unpricedCalls++
      const modelRow = row.byProviderModel[route] ??= { ...zero(), unpricedCalls: 0 }
      add(modelRow, usage, amount, amount, cny)
      if (!price) modelRow.unpricedCalls++
      const hour = new Date(event.time).getHours()
      add(row.hours[hour] ??= zero(), usage, amount, amount, cny)
      recovered.set(key, row)
    }
    let changed = false
    for (const [key, recoveredRow] of recovered) {
      const day = data.days[key], row = day?.sessions?.find(row => row.id === id)
      if (!row || row.hoursRestoredAt || !['input', 'output', 'cacheRead', 'cacheWrite', 'calls'].every(field => finite(row[field]) === recoveredRow[field])) continue
      if (Object.keys(row.byProviderModel ?? {}).some(route => !recoveredRow.byProviderModel[route]
        || !['input', 'output', 'cacheRead', 'cacheWrite', 'calls'].every(field => finite(row.byProviderModel[route][field]) === recoveredRow.byProviderModel[route][field]))) continue
      if (finite(row.unpricedCalls) === row.calls && recoveredRow.unpricedCalls === 0
        && Object.values(recoveredRow.byProviderModel).every(value => value.nativeUsd === value.apiCost)) {
        for (const field of ['cost', 'apiCost', 'nativeUsd', 'nativeCny']) { day[field] = finite(day[field]) + recoveredRow[field] - finite(row[field]); row[field] = recoveredRow[field] }
        day.unpricedCalls = Math.max(0, finite(day.unpricedCalls) - row.calls)
        row.unpricedCalls = 0
        for (const [route, value] of Object.entries(recoveredRow.byProviderModel)) {
          const original = row.byProviderModel[route], total = day.byProviderModel[route]
          for (const field of ['cost', 'apiCost', 'nativeUsd', 'nativeCny']) total[field] = finite(total[field]) + value[field] - finite(original[field])
          total.unpricedCalls = Math.max(0, finite(total.unpricedCalls) - value.calls)
          row.byProviderModel[route] = value
        }
      }
      row.hours = recoveredRow.hours
      row.hoursRestoredAt = new Date().toISOString()
      day.hours = {}
      for (const session of day.sessions) for (const [hour, usage] of Object.entries(session.hours ?? {})) {
        const bucket = day.hours[hour] ??= zero()
        for (const field of fields) bucket[field] += finite(usage[field])
      }
      changed = true
    }
    if (changed) this.flush()
    return changed
  }

  summary() {
    const data = this.load()
    const days = Object.values(data.days).sort((a, b) => b.date.localeCompare(a.date))
    const today = dayKey(Date.now())
    const month = today.slice(0, 7)
    const currencyFields = row => ({ ...Object.fromEntries(fields.map(field => [field, finite(row?.[field])])),
      apiCostCny: finite(row?.nativeCny) + Math.max(0, finite(row?.apiCost) - finite(row?.nativeUsd)) * data.config.exchangeRate,
      unpricedCalls: finite(row?.unpricedCalls) })
    const sum = rows => rows.reduce((value, row) => {
      for (const field of fields) value[field] += finite(row[field])
      value.unpricedCalls += finite(row.unpricedCalls)
      return value
    }, { ...zero(), unpricedCalls: 0 })
    const routes = new Map()
    for (const day of days) for (const [name, value] of Object.entries(day.byProviderModel ?? {})) {
      const split = name.indexOf(':')
      if (split < 1) continue
      const row = routes.get(name) ?? { name, provider: name.slice(0, split), model: name.slice(split + 1), calls: 0, unpricedCalls: 0 }
      row.calls += finite(value.calls)
      row.unpricedCalls += finite(value.unpricedCalls)
      routes.set(name, row)
    }
    /** Tokens a day holds without an hourly bucket — imported or hourly-less history. */
    const unlocatedOf = row => Math.max(0, ['input', 'cacheRead', 'cacheWrite', 'output']
      .reduce((total, key) => total + finite(row?.[key]) - Object.values(row?.hours ?? {}).reduce((sum, value) => sum + finite(value[key]), 0), 0))
    // The week grid keeps one column per day and one row per eight-hour slice, Monday first.
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = dayKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index).getTime())
      const day = data.days[date]
      return { date, unlocatedTokens: unlocatedOf(day),
        buckets: Array.from({ length: 3 }, (_, bucket) => currencyFields(sum(Array.from({ length: 8 }, (_, offset) => own(day?.hours, bucket * 8 + offset)).filter(row => row !== undefined)))) }
    })
    return {
      today: currencyFields(sum(days.filter(row => row.date === today))),
      month: currencyFields(sum(days.filter(row => row.date.startsWith(month)))),
      all: currencyFields(sum(days)),
      date: today,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      activity: { date: today, hour: new Date().getHours(),
        hours: Array.from({ length: 24 }, (_, hour) => ({ hour, ...currencyFields(data.days[today]?.hours?.[hour]) })),
        unlocatedTokens: unlocatedOf(data.days[today]) },
      week,
      days: days.map(row => ({ date: row.date, ...currencyFields(row),
        models: Object.entries(row.byProviderModel ?? {}).map(([name, value]) => ({ name, ...currencyFields(value) })) })),
      sessions: (days.find(row => row.date === today)?.sessions ?? []).map(row => ({
        id: String(row.id), title: typeof row.title === 'string' ? row.title : '',
        ...currencyFields(row),
      })).sort((a, b) => b.apiCost - a.apiCost).slice(0, 50),
      routes: [...routes.values()].map(row => ({ ...row,
        price: priceOf(data.config.prices, row.provider, row.model, Date.now(), data.config) ?? null,
      })).sort((a, b) => b.unpricedCalls - a.unpricedCalls || b.calls - a.calls),
      config: { currency: data.config.currency, exchangeRate: data.config.exchangeRate, budget: data.config.budget, heatmapPeriod: ['today', 'week', 'month'].includes(data.config.heatmapPeriod) ? data.config.heatmapPeriod : 'today' },
      officialPricing: officialPricing(),
      priceBook: priceBookOf(data.config.prices),
      peak: { enabled: data.config.peakEnabled === true, windows: data.config.peakWindows ?? [], holidays: data.config.peakHolidays ?? [] },
      historyImported: data.importedSha256 !== null,
    }
  }

  updateSettings(patch) {
    const data = this.load()
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid cost settings')
    const { currency, exchangeRate, budget, pricing, heatmapPeriod, peak } = patch
    if (heatmapPeriod !== undefined && !['today', 'week', 'month'].includes(heatmapPeriod)) throw new Error('Heatmap period must be today, week or month')
    if (currency !== undefined && !['USD', 'CNY'].includes(currency)) throw new Error('Currency must be USD or CNY')
    if (exchangeRate !== undefined && (!Number.isFinite(exchangeRate) || exchangeRate <= 0))
      throw new Error('Exchange rate must be positive')
    if (budget !== undefined && (typeof budget !== 'object' || budget === null
      || typeof budget.enabled !== 'boolean' || !Number.isFinite(budget.amount) || budget.amount < 0
      || !['day', 'month'].includes(budget.period))) throw new Error('Invalid budget')
    if (peak !== undefined && (typeof peak !== 'object' || peak === null || Array.isArray(peak)
      || (peak.enabled !== undefined && typeof peak.enabled !== 'boolean')
      || (peak.windows !== undefined && (!Array.isArray(peak.windows) || peak.windows.length > 8 || peak.windows.some(window =>
        !window || !Number.isInteger(window.start) || !Number.isInteger(window.end)
        || window.start < 0 || window.end > 24 || window.start >= window.end)))
      || (peak.holidays !== undefined && (!Array.isArray(peak.holidays) || peak.holidays.length > 400
        || peak.holidays.some(date => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))))))
      throw new Error('Peak settings require an enabled flag, whole-hour windows and ISO holidays')
    if (pricing !== undefined && (!Array.isArray(pricing) || pricing.length > 200 || pricing.some(row =>
      !row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.provider !== 'string' || !row.provider || row.provider.length > 512
      || typeof row.model !== 'string' || !row.model || row.model.length > 512
      || priceEntryOf(row) === null)))
      throw new Error('Prices require a provider, model, and nonnegative USD rates per million tokens')
    const previous = data.config
    let prices = previous.prices
    if (pricing !== undefined) {
      prices = structuredClone(previous.prices ?? { models: {}, providers: {} })
      prices.providers ??= {}
      for (const row of pricing) {
        const provider = prices.providers[row.provider] ?? (prices.providers[row.provider] = { models: {} })
        provider.models ??= {}
        const entry = priceEntryOf(row)
        if (entry.remove) delete provider.models[row.model]
        else provider.models[row.model] = { ...entry.offPeak, ...(entry.peak ? { offPeak: entry.offPeak, peak: entry.peak } : {}),
          source: 'user', checkedAt: new Date().toISOString() }
        if (!Object.keys(provider.models).length) delete prices.providers[row.provider]
      }
    }
    data.config = {
      ...previous,
      prices,
      ...(currency === undefined ? {} : { currency }),
      ...(heatmapPeriod === undefined ? {} : { heatmapPeriod }),
      ...(exchangeRate === undefined ? {} : { exchangeRate }),
      ...(budget === undefined ? {} : { budget: { ...previous.budget, enabled: budget.enabled, amount: budget.amount, period: budget.period } }),
      ...(peak === undefined ? {} : {
        ...(peak.enabled === undefined ? {} : { peakEnabled: peak.enabled }),
        ...(peak.windows === undefined ? {} : { peakWindows: peak.windows.map(window => ({ start: window.start, end: window.end })) }),
        ...(peak.holidays === undefined ? {} : { peakHolidays: [...peak.holidays] }),
      }),
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
export function installCostMeter(ctx, { home, balance: balanceOptions = {} }) {
  const ledger = new CostLedger(home)
  const balance = new DeepSeekBalance(ctx, { ...balanceOptions, home })
  ctx.effect(() => () => ledger.close(), 'dsh-app: cost ledger close')
  ctx.effect(() => () => balance.close(), 'dsh-app: balance request close')
  // Read through DSH's public persistence seam after startup; no session is opened for writing.
  ctx.effect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const persistence = ctx.get?.('sessionPersistence')
        if (!persistence) return
        const ids = new Set(Object.values(ledger.load().days).flatMap(day => (day.sessions ?? []).filter(row => !row.hoursRestoredAt).map(row => row.id)))
        for (const id of ids) {
          if (controller.signal.aborted) return
          let handle
          try {
            handle = await persistence.open(id, 'read', { signal: controller.signal })
            const { events } = await handle.read(handle.inheritedEventCount ?? 0, Number.MAX_SAFE_INTEGER, { signal: controller.signal })
            if (!controller.signal.aborted) ledger.restoreSessionUsage(id, events)
          } catch { /* Missing or incompatible logs stay counted, with unknown hours explicitly exposed. */ }
          finally { await handle?.close() }
        }
      } catch { /* Ledger read routes report failures; startup remains independent of accounting. */ }
    }, 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, 'dsh-app: restore historical usage')
  let recordFailureLogged = false
  ctx.on('session/event', (session, event) => {
    try { ledger.record(session, event) }
    catch (error) {
      if (!recordFailureLogged) console.warn(`DSH cost ledger recording failed: ${String(error)}`)
      recordFailureLogged = true
    }
  }, { global: true })
  // Read the page files per request so an edit to them does not need a Host restart.
  const pageFile = name => () => readFileSync(new URL(name, import.meta.url))
  const routes = [
    ['/dsh-app/cost', 'text/html; charset=utf-8', pageFile('./cost-meter.html')],
    ['/dsh-app/cost-ui.js', 'text/javascript; charset=utf-8', pageFile('./cost-meter-ui.js')],
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
          'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors ${path === '/dsh-app/cost' ? "'self'" : "'none'"}` })
        response.end(value)
      } catch {
        if (!response.headersSent) response.writeHead(500)
        response.end('Cost ledger unavailable')
      }
    },
  }))
  for (const [path, method, force] of [['/dsh-app/balance.json', 'GET', false], ['/dsh-app/balance/refresh', 'POST', true]])
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path,
      async handler(request, response) {
        const rejection = ctx.connection.requestRejection(request)
        if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
        if (request.method !== method) { response.writeHead(405); response.end(); return }
        if (force && request.headers.origin !== `http://127.0.0.1:${ctx.webServer.port}`) {
          response.writeHead(403); response.end(); return
        }
        const value = await balance.read(force)
        if (response.destroyed) return
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify(value))
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
