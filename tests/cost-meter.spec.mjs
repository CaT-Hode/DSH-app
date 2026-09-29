import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { amountOf, CostLedger, priceOf, usageOf } from '../lib/cost-meter.mjs'

const rate = { cacheHit: 0.1, cacheMiss: 1, output: 2 }
const buckets = { input: 10, output: 20, cacheRead: 3, cacheWrite: 2, reasoning: 0, calls: 1, cost: 0.0000555, apiCost: 0.0000555 }

test('uses the last settled usage sample and disjoint billed token buckets', () => {
  const usage = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 2 }
  const event = { type: 'assistant/attempt', data: { stream: [
    { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 0 } } },
    { type: 'chunk', chunk: { type: 'usage', usage } },
  ] } }
  assert.deepEqual(usageOf(event), usage)
  assert.equal(amountOf(usage, rate), 0.0000505)
  assert.equal(priceOf({ providers: {} }, 'unknown', 'model', Date.now()), undefined)
})

test('imports historical totals without changing the old file, then records settled calls', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-cost-test-'))
  try {
    const legacyDirectory = join(home, 'storages', 'cost-meter')
    mkdirSync(legacyDirectory, { recursive: true })
    const legacyPath = join(legacyDirectory, 'ledger.json')
    const legacy = JSON.stringify({
      version: 1,
      days: { '2026-09-28': { date: '2026-09-28', ...buckets,
        byProviderModel: { 'deepseek-official:old': { ...buckets } }, sessions: [] } },
      config: { currency: 'USD', exchangeRate: 7.2, budget: { enabled: false, amount: 100, period: 'month', detail: true },
        prices: { models: {}, default: rate }, peakEnabled: false },
    })
    writeFileSync(legacyPath, legacy)
    const ledger = new CostLedger(home)
    assert.equal(ledger.summary().all.calls, 1)
    assert.equal(JSON.parse(readFileSync(ledger.path, 'utf8')).importedSha256.length, 64)
    const session = { id: 'new-session', requestHeader: () => ({ config: { provider: 'deepseek-official', model: 'new' } }) }
    const event = { type: 'assistant/message', time: new Date('2026-09-29T02:00:00Z').getTime(),
      data: { message: { source: { provider: 'deepseek-official', model: 'new' } },
        usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 2 } } }
    ledger.record(session, event)
    const snapshot = ledger.summary()
    assert.equal(snapshot.all.calls, 2)
    assert.equal(snapshot.days.length, 2)
    assert.equal(snapshot.days.find(day => day.date === '2026-09-29').cost, 0.0000505)
    assert.equal(snapshot.days.find(day => day.date === '2026-09-29').models[0].name, 'deepseek-official:new')
    ledger.close()
    assert.equal(readFileSync(legacyPath, 'utf8'), legacy)
    const reopened = new CostLedger(home)
    assert.equal(reopened.summary().all.calls, 2)
    reopened.updateSettings({ currency: 'CNY', exchangeRate: 7.5,
      budget: { enabled: true, amount: 100, period: 'month' } })
    assert.equal(reopened.summary().config.budget.enabled, true)
    assert.equal(reopened.summary().config.budget.detail, true)
    assert.throws(() => reopened.updateSettings({ exchangeRate: 0 }), /positive/)
    reopened.close()
  } finally { rmSync(home, { recursive: true, force: true }) }
})
