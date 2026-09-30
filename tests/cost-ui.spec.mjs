import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT
  ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : createRequire(import.meta.url)
const { JSDOM } = dependencies('jsdom')
const html = readFileSync(new URL('../lib/cost-meter.html', import.meta.url), 'utf8')
const script = readFileSync(new URL('../lib/cost-meter-ui.js', import.meta.url), 'utf8')
const counters = (calls, cost, input) => ({ calls, cost, apiCost: cost, input, cacheRead: 20, cacheWrite: 5, output: 10, reasoning: 2, unpricedCalls: 0 })

test('one selected-period overview filters cost details without discarding budget and price drafts', async () => {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:19780/dsh-app/cost', runScripts: 'outside-only' })
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const oldMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const oldDate = `${oldMonth.getFullYear()}-${String(oldMonth.getMonth() + 1).padStart(2, '0')}-01`
  const data = {
    today: counters(2, 0.1, 100), month: counters(4, 0.2, 200), all: counters(8, 0.4, 400),
    days: [
      { date: today, ...counters(2, 0.1, 100), models: [{ name: 'current:model', ...counters(2, 0.1, 100) }] },
      { date: oldDate, ...counters(4, 0.2, 200), models: [{ name: 'older:model', ...counters(4, 0.2, 200) }] },
    ],
    sessions: [], routes: [{ name: 'current:model', provider: 'current', model: 'model', unpricedCalls: 0, price: { cacheMiss: 1, cacheHit: 0.1, cacheWrite: 0.2, output: 2 } }],
    config: { currency: 'USD', exchangeRate: 7.2, budget: { enabled: true, period: 'month', amount: 10 } }, historyImported: true,
  }
  const writes = []
  dom.window.fetch = async (url, options = {}) => {
    if (url === '/dsh-app/cost/settings') {
      const patch = JSON.parse(options.body)
      writes.push(patch)
      if (patch.budget) data.config = { ...data.config, ...patch }
      return { ok: true }
    }
    return { ok: true, json: async () => url === '/dsh-app/cost.json' ? data : {
      status: 'ready', error: null, balances: [{ currency: 'CNY', totalBalance: '114.70', grantedBalance: '0.00', toppedUpBalance: '114.70' }], isAvailable: true, stale: false, updatedAt: Date.now(),
    } }
  }
  const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate) }
  const get = id => dom.window.document.getElementById(id)
  try {
    dom.window.eval(script)
    await settle()
    assert.equal(dom.window.document.querySelectorAll('.cards .card').length, 3)
    assert.equal(get('usage-calls').textContent, '4')
    assert.equal(get('usage-tokens').textContent, '235')
    assert.equal(get('days').children.length, 1)
    assert.doesNotMatch(get('models').textContent, /older:model/)
    assert.equal(get('budget-overview').hidden, false)
    assert.match(get('budget-label').textContent, /0\.2000.*10\.0000/)
    assert.match(get('balances').textContent, /114\.70/)
    get('budget-amount').value = '25'
    get('price-input').value = '3'
    get('usage-period').value = 'all'
    get('usage-period').dispatchEvent(new dom.window.Event('change'))
    assert.equal(get('usage-calls').textContent, '8')
    assert.equal(get('days').children.length, 2)
    assert.match(get('models').textContent, /older:model/)
    assert.equal(get('budget-amount').value, '25')
    assert.equal(get('price-input').value, '3')
    get('settings').dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(writes[0].budget.amount, 25)
    get('price-input').value = '3'
    get('pricing').dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
    await settle()
    assert.deepEqual(writes[1].pricing[0], { provider: 'current', model: 'model', cacheMiss: 3, cacheHit: 0.1, cacheWrite: 0.2, output: 2 })
    assert.ok(get('session-insight'))
  } finally { dom.window.close() }
})
