import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { officialPriceOf } from '../lib/official-pricing.mjs'
import { amountOf, CostLedger, priceOf } from '../lib/cost-meter.mjs'

const at = text => Date.parse(text)
test('official USD and CNY rates use Beijing peak boundaries, weekends, holidays and legacy aliases', () => {
  for (const [time, tier] of [['2026-09-30T08:59:59+08:00', 'off-peak'], ['2026-09-30T09:00:00+08:00', 'peak'], ['2026-09-30T11:59:59+08:00', 'peak'], ['2026-09-30T12:00:00+08:00', 'off-peak'], ['2026-09-30T14:00:00+08:00', 'peak'], ['2026-09-30T18:00:00+08:00', 'off-peak'], ['2026-10-01T10:00:00+08:00', 'off-peak'], ['2026-09-26T10:00:00+08:00', 'off-peak']]) {
    const price = officialPriceOf('deepseek-flash', at(time))
    assert.equal(price.tier, tier, time)
    assert.equal(price.cny.output, tier === 'peak' ? 8 : 4)
    assert.equal(price.output, tier === 'peak' ? 1.2 : 0.6)
    assert.equal(price.calendarKnown, true)
  }
  const pro = officialPriceOf('deepseek-v4-pro', at('2026-09-30T10:00:00+08:00'))
  assert.deepEqual(pro.cny, { cacheHit: 0.3, cacheMiss: 9, output: 27 })
  assert.equal(pro.cacheMiss, 1.32)
  assert.deepEqual(officialPriceOf('deepseek-v4-flash', at('2026-09-30T01:00:00Z')), officialPriceOf('deepseek-flash', at('2026-09-30T01:00:00Z')))
  assert.equal(officialPriceOf('deepseek-chat', Date.now()), undefined)
  assert.equal(priceOf({}, 'relay', 'deepseek-flash', Date.now()), undefined)
  assert.equal(officialPriceOf('deepseek-flash', at('2027-02-05T10:00:00+08:00')).calendarKnown, false)
})

test('counts disjoint tokens once and retains native CNY instead of applying an exchange-rate guess', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-official-rate-'))
  try {
    const ledger = new CostLedger(home)
    const session = { id: 's', requestHeader: () => ({ config: { provider: 'deepseek-official', model: 'deepseek-flash' } }) }
    const usage = { inputTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000, reasoningTokens: 900_000 }
    ledger.record(session, { seq: 1, type: 'assistant/message', time: at('2026-09-30T10:00:00+08:00'), data: { usage } })
    ledger.updateSettings({ currency: 'CNY', exchangeRate: 1 })
    ledger.updateSettings({ heatmapPeriod: 'month' })
    assert.equal(new CostLedger(home).summary().config.heatmapPeriod, 'month')
    assert.throws(() => ledger.updateSettings({ heatmapPeriod: 'year' }), /Heatmap period/)
    const row = ledger.summary().days.find(row => row.date === new Date(at('2026-09-30T10:00:00+08:00')).toLocaleDateString('en-CA'))
    assert.ok(Math.abs(row.apiCost - 1.506) < 1e-12)
    assert.equal(row.apiCostCny, 10.04)
    assert.equal(row.unpricedCalls, 0)
    assert.equal(amountOf(usage, { cacheHit: .04, cacheMiss: 2, output: 8 }), 10.04)
    ledger.updateSettings({ exchangeRate: 100 })
    assert.equal(ledger.summary().all.apiCostCny, 10.04)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('projects the current week as seven Monday-first days of three eight-hour buckets', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-week-'))
  try {
    const ledger = new CostLedger(home)
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    const keyOf = offset => new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset).toLocaleDateString('en-CA')
    const at = (offset, hour) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, hour).getTime()
    const session = { id: 's', requestHeader: () => ({ config: { provider: 'deepseek-official', model: 'deepseek-flash' } }) }
    const event = (seq, offset, hour, inputTokens) => ({ seq, type: 'assistant/message', time: at(offset, hour), data: { usage: { inputTokens } } })
    ledger.record(session, event(1, 0, 2, 100))
    ledger.record(session, event(2, 0, 20, 7))
    ledger.record(session, event(3, 1, 9, 30))
    const week = ledger.summary().week
    assert.equal(week.length, 7)
    assert.deepEqual(week.map(row => row.date), Array.from({ length: 7 }, (_, index) => keyOf(index)))
    assert.deepEqual(week[0].buckets.map(bucket => bucket.input), [100, 0, 7])
    assert.deepEqual(week[1].buckets.map(bucket => bucket.input), [0, 30, 0])
    assert.equal(week[0].unlocatedTokens, 0)
    const bare = keyOf(3)
    ledger.load().days[bare] = { date: bare, input: 10, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 1, cost: 0, apiCost: 0, nativeCny: 0, nativeUsd: 0, byProviderModel: {}, sessions: [] }
    assert.equal(ledger.summary().week[3].unlocatedTokens, 10)
    assert.equal(ledger.summary().week[3].buckets[0].input, 0)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('stores flat, tiered and removed model prices and picks the tier by Beijing peak hours', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-price-book-'))
  try {
    const ledger = new CostLedger(home)
    const config = () => ledger.load().config
    ledger.updateSettings({ peak: { enabled: true, windows: [{ start: 9, end: 12 }], holidays: ['2026-10-01'] } })
    ledger.updateSettings({ pricing: [
      { provider: 'relay', model: 'flat-model', cacheMiss: 1, cacheHit: 0.1, cacheWrite: 0.2, output: 2 },
      { provider: 'relay', model: 'tiered-model',
        offPeak: { cacheMiss: 1, cacheHit: 0.1, cacheWrite: 0.2, output: 2 },
        peak: { cacheMiss: 3, cacheHit: 0.3, cacheWrite: 0.6, output: 6 } },
    ] })
    const summary = ledger.summary()
    assert.equal(summary.priceBook.length, 2)
    assert.equal(summary.priceBook.find(row => row.model === 'tiered-model').mode, 'tiered')
    assert.equal(summary.priceBook.find(row => row.model === 'flat-model').mode, 'single')
    assert.deepEqual(summary.peak, { enabled: true, windows: [{ start: 9, end: 12 }], holidays: ['2026-10-01'] })
    const priceAt = (model, time) => priceOf(config().prices, 'relay', model, at(time), config())
    // 2026-09-30 10:00 Beijing is a Wednesday inside 09:00–12:00; 13:00 is outside it.
    assert.equal(priceAt('tiered-model', '2026-09-30T10:00:00+08:00').output, 6)
    assert.equal(priceAt('tiered-model', '2026-09-30T13:00:00+08:00').output, 2)
    // National Day and the following Saturday stay off-peak even inside the window.
    assert.equal(priceAt('tiered-model', '2026-10-01T10:00:00+08:00').output, 2)
    assert.equal(priceAt('tiered-model', '2026-10-03T10:00:00+08:00').output, 2)
    // Flat entries ignore the schedule entirely.
    assert.equal(priceAt('flat-model', '2026-09-30T10:00:00+08:00').output, 2)
    ledger.updateSettings({ pricing: [{ provider: 'relay', model: 'flat-model', remove: true }] })
    assert.deepEqual(ledger.summary().priceBook.map(row => row.model), ['tiered-model'])
    assert.throws(() => ledger.updateSettings({ pricing: [{ provider: 'relay', model: 'bad', cacheMiss: -1 }] }), /Prices require/)
    assert.throws(() => ledger.updateSettings({ peak: { windows: [{ start: 12, end: 9 }] } }), /Peak settings/)
    assert.throws(() => ledger.updateSettings({ peak: { holidays: ['2026/10/01'] } }), /Peak settings/)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('restores only exactly matching counted history and survives repeated recovery without new calls', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-official-history-'))
  try {
    const ledger = new CostLedger(home), data = ledger.load()
    const time = Date.now(), date = new Date(time).toLocaleDateString('en-CA'), hour = new Date(time).getHours()
    const counters = { input: 50, output: 20, cacheRead: 30, cacheWrite: 0, reasoning: 0, calls: 2, cost: 0, apiCost: 0, unpricedCalls: 2 }
    data.days[date] = { date, ...counters, byProviderModel: { 'deepseek-official:deepseek-flash': { ...counters } }, sessions: [{ id: 'original', ...counters, byProviderModel: { 'deepseek-official:deepseek-flash': { ...counters } } }] }
    const event = seq => ({ seq, time, type: 'assistant/message', data: { message: { source: { provider: 'deepseek-official', model: 'deepseek-flash' } }, usage: { inputTokens: 25, cacheReadTokens: 15, outputTokens: 10 } } })
    assert.equal(ledger.restoreSessionUsage('fork', [event(1), event(2)]), false)
    assert.equal(ledger.restoreSessionUsage('original', [event(1)]), false)
    assert.equal(ledger.summary().activity.unlocatedTokens, 100)
    assert.equal(ledger.restoreSessionUsage('original', [event(1), event(1), event(2)]), true)
    const summary = ledger.summary()
    assert.equal(summary.all.calls, 2)
    assert.equal(summary.all.unpricedCalls, 0)
    assert.ok(summary.all.apiCostCny > 0)
    assert.equal(summary.activity.hours[hour].input, 50)
    assert.equal(summary.activity.unlocatedTokens, 0)
    assert.equal(ledger.restoreSessionUsage('original', [event(1), event(2)]), false)
    assert.equal(new CostLedger(home).summary().all.apiCostCny, summary.all.apiCostCny)
  } finally { rmSync(home, { recursive: true, force: true }) }
})
