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
    week: [{ date: today, buckets: [counters(1, 0.05, 50), counters(1, 0.05, 60), counters(1, 0.05, 70), {}] }],
    priceBook: [{ provider: 'current', model: 'model', source: 'user', checkedAt: '2026-09-30T00:00:00.000Z', mode: 'single',
      cacheMiss: 1, cacheHit: 0.1, cacheWrite: 0.2, output: 2, offPeak: null, peak: null }],
    peak: { enabled: false, windows: [], holidays: [] },
    config: { currency: 'USD', exchangeRate: 7.2, budget: { enabled: true, period: 'month', amount: 10 }, heatmapPeriod: 'month' }, historyImported: true,
  }
  const writes = []
  const notifications = []
  dom.window.postMessage = (message, origin) => notifications.push({ message, origin })
  dom.window.fetch = async (url, options = {}) => {
    if (url === '/dsh-app/cost/settings') {
      const patch = JSON.parse(options.body)
      writes.push(patch)
      if (patch.budget || patch.heatmapPeriod) data.config = { ...data.config, ...patch }
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
    // The page opens on the saved heatmap period, so one control drives both scopes.
    assert.equal(get('heatmap-month').getAttribute('aria-pressed'), 'true')
    assert.equal(get('usage-calls').textContent, '4')
    assert.equal(get('usage-tokens').textContent, '235')
    assert.equal(get('days').children.length, 1)
    assert.doesNotMatch(get('models').textContent, /older:model/)
    assert.equal(get('budget-overview').hidden, false)
    assert.match(get('budget-label').textContent, /0\.2000.*10\.0000/)
    assert.match(get('balances').textContent, /114\.70/)
    get('heatmap-all').click()
    assert.equal(get('heatmap-all').getAttribute('aria-pressed'), 'true')
    assert.equal(get('usage-calls').textContent, '8')
    assert.equal(get('days').children.length, 2)
    assert.match(get('models').textContent, /older:model/)
    get('budget-amount').value = '25'
    get('settings').dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(writes[0].budget.amount, 25)
    assert.ok(get('session-insight'))
    get('budget-amount').value = '35'
    get('heatmap-month').click()
    await settle()
    assert.deepEqual(writes[1], { heatmapPeriod: 'month' })
    assert.equal(get('heatmap-month').getAttribute('aria-pressed'), 'true')
    get('heatmap-week').click()
    await settle()
    assert.deepEqual(writes[2], { heatmapPeriod: 'week' })
    assert.equal(get('heatmap-week').getAttribute('aria-pressed'), 'true')
    assert.equal(get('heatmap-month').getAttribute('aria-pressed'), 'false')
    assert.equal(get('heatmap-all').getAttribute('aria-pressed'), 'false')
    // The same control drives the page overview: weekly totals come from the eight-hour buckets.
    assert.equal(get('usage-calls').textContent, '3')
    assert.equal(get('usage-tokens').textContent, '285')
    assert.equal(get('budget-amount').value, '35')
    // Model prices moved to Settings -> Models; the page keeps a pointer instead of the editor.
    assert.equal(get('pricing'), null)
    assert.ok(dom.window.document.querySelector('[data-i18n="priceElsewhere"]'))
    // Standalone there is no settings surface to jump to, so the button stays hidden.
    assert.equal(get('open-model-prices').hidden, true)
  } finally { dom.window.close() }
})

test('the price jump button asks the embedding shell for the Models settings', async () => {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:19780/dsh-app/cost', runScripts: 'outside-only' })
  const messages = []
  const fetchSummary = { today: counters(1, 0.1, 10), month: counters(1, 0.1, 10), all: counters(1, 0.1, 10), days: [], sessions: [], routes: [], week: [], priceBook: [], peak: null, config: { currency: 'USD', exchangeRate: 7.2, budget: { enabled: false, period: 'month', amount: 0 }, heatmapPeriod: 'today' }, historyImported: false }
  Object.defineProperty(dom.window, 'parent', { configurable: true, value: { document: { documentElement: { lang: 'zh' } }, postMessage: (message, origin) => messages.push({ message, origin }) } })
  dom.window.fetch = async url => url === '/dsh-app/cost.json'
    ? { ok: true, json: async () => fetchSummary }
    : { ok: true, json: async () => ({ status: 'unconfigured', error: null, balances: [], isAvailable: false, stale: false }) }
  try {
    dom.window.eval(script)
    await new Promise(setImmediate)
    const jump = dom.window.document.getElementById('open-model-prices')
    assert.equal(jump.hidden, false)
    jump.click()
    assert.equal(messages.length, 1)
    assert.equal(messages[0].message.type, 'dsh-app:open-model-prices')
    assert.equal(messages[0].origin, 'http://127.0.0.1:19780')
  } finally { dom.window.close() }
})
