import assert from 'node:assert/strict'
import test from 'node:test'
import { compactTokens, periodUsage } from '../client/plugin.mjs'

const summary = {
  today: { input: 10, cacheRead: 1, cacheWrite: 2, output: 3, apiCost: 0.1, apiCostCny: 0.7, calls: 4, unpricedCalls: 1 },
  month: { input: 100, cacheRead: 0, cacheWrite: 0, output: 0, apiCost: 1, apiCostCny: 7, calls: 9, unpricedCalls: 0 },
  week: [
    { date: '2026-09-28', buckets: [
      { input: 1, output: 1, apiCost: 0.01, apiCostCny: 0.07, calls: 1, unpricedCalls: 0 },
      { input: 2, output: 0, apiCost: 0.02, apiCostCny: 0.14, calls: 1, unpricedCalls: 1 }, {}] },
    { date: '2026-09-29', buckets: [{ input: 4, output: 4, apiCost: 0.04, apiCostCny: 0.28, calls: 2, unpricedCalls: 0 }] },
  ],
}

test('token volume shortens to the largest unit that keeps the number readable', () => {
  assert.equal(compactTokens(0), '0')
  assert.equal(compactTokens(512), '512')
  assert.equal(compactTokens(1_500), '1.5K')
  assert.equal(compactTokens(999), '999')
  assert.equal(compactTokens(999_400), '999K')
  assert.equal(compactTokens(26_770_673), '26.8M')
  assert.equal(compactTokens(27_000_000), '27M')
  assert.equal(compactTokens(949_000_000), '949M')
  assert.equal(compactTokens(1_240_000_000), '1.2B')
  // A value that would read 1000 promotes to the next unit instead.
  assert.equal(compactTokens(999_950), '1M')
  assert.equal(compactTokens(999_950_000), '1B')
  assert.equal(compactTokens(Number.NaN), '0')
})

test('the right-hand totals follow the heatmap period, summing the weekly buckets', () => {
  assert.equal(periodUsage(summary, 'today'), summary.today)
  assert.equal(periodUsage(summary, 'month'), summary.month)
  const week = periodUsage(summary, 'week')
  for (const [key, value] of Object.entries({ input: 7, output: 5, calls: 4, unpricedCalls: 1 })) assert.equal(week[key], value, key)
  assert.ok(Math.abs(week.apiCost - 0.07) < 1e-12)
  assert.ok(Math.abs(week.apiCostCny - 0.49) < 1e-12)
  assert.equal(periodUsage(null, 'week'), null)
  assert.deepEqual(periodUsage({ week: [] }, 'week'), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, apiCost: 0, apiCostCny: 0, calls: 0, unpricedCalls: 0 })
})
