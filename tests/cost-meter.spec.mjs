import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { amountOf, CostLedger, installCostMeter, priceOf, usageOf } from '../lib/cost-meter.mjs'
import { DeepSeekBalance } from '../lib/deepseek-balance.mjs'
import { createServer } from 'node:http'
import { runInNewContext } from 'node:vm'

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
  assert.ok(Math.abs(amountOf(usage, { ...rate, cacheWrite: 1.5 }) - 0.0000533) < 1e-15)
  assert.equal(priceOf({ providers: {} }, 'unknown', 'model', Date.now()), undefined)
})

test('records ASS routes without fabricating prices and applies explicit rates only to new calls', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-cost-route-'))
  try {
    const ledger = new CostLedger(home)
    const session = { id: 'ass-session', requestHeader: () => ({ config: { provider: 'ass-custom-responses', model: 'custom/model:free' } }) }
    const event = seq => ({ seq, type: 'assistant/message', time: Date.now(), data: {
      message: { source: { provider: 'ass-custom-responses', model: 'custom/model:free' } },
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 2 },
    } })
    ledger.record(session, event(1))
    ledger.record(session, event(1))
    assert.equal(ledger.summary().all.calls, 1)
    assert.equal(ledger.summary().all.unpricedCalls, 1)
    assert.equal(ledger.summary().routes[0].price, null)
    assert.equal(ledger.summary().routes[0].model, 'custom/model:free')
    assert.equal(ledger.summary().sessions[0].unpricedCalls, 1)
    ledger.updateSettings({ pricing: [{ provider: 'ass-custom-responses', model: 'custom/model:free', ...rate, cacheWrite: 1.5 }] })
    assert.equal(ledger.summary().all.apiCost, 0)
    ledger.record(session, event(2))
    assert.ok(Math.abs(ledger.summary().all.apiCost - 0.0000533) < 1e-15)
    assert.equal(ledger.summary().all.calls, 2)
    assert.equal(ledger.summary().all.unpricedCalls, 1)
    const reopened = new CostLedger(home)
    assert.equal(reopened.summary().routes[0].price.cacheWrite, 1.5)
    assert.throws(() => reopened.updateSettings({ pricing: [{ provider: 'ass', model: 'x', ...rate, cacheWrite: -1 }] }), /nonnegative/)
    assert.throws(() => reopened.updateSettings({ pricing: [{ provider: '', model: 'x', ...rate, cacheWrite: 1 }] }), /provider/)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('serves the cost page and persists authenticated settings through the HTTP routes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-cost-http-'))
  const routes = new Map(), disposers = []
  let listener
  const ctx = {
    connection: { requestRejection: request => request.headers.authorization === 'Bearer local-test' ? undefined : 401 },
    webServer: { port: 0, register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
    effect: callback => disposers.push(callback()),
    on: (name, callback) => { assert.equal(name, 'session/event'); listener = callback },
  }
  const ledger = installCostMeter(ctx, { home })
  const server = createServer((request, response) => {
    const handler = routes.get(request.url)
    if (handler) handler(request, response)
    else { response.writeHead(404); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  ctx.webServer.port = server.address().port
  const origin = `http://127.0.0.1:${ctx.webServer.port}`
  const headers = { authorization: 'Bearer local-test' }
  try {
    assert.equal((await fetch(`${origin}/dsh-app/cost.json`)).status, 401)
    assert.equal((await fetch(`${origin}/dsh-app/balance.json`)).status, 401)
    const balance = await (await fetch(`${origin}/dsh-app/balance.json`, { headers })).json()
    assert.equal(balance.status, 'unconfigured')
    assert.equal(balance.error, 'official-provider-unavailable')
    assert.equal((await fetch(`${origin}/dsh-app/balance/refresh`, { method: 'POST', headers: { ...headers, origin: 'https://other.invalid' } })).status, 403)
    assert.equal((await fetch(`${origin}/dsh-app/balance/refresh`, { method: 'POST', headers: { ...headers, origin } })).status, 200)
    const page = await fetch(`${origin}/dsh-app/cost`, { headers })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/)
    assert.match(await page.text(), /id="budget-overview"/)
    const script = await fetch(`${origin}/dsh-app/cost-ui.js`, { headers })
    assert.equal(script.status, 200)
    assert.match(script.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    listener({ id: 'http-session', requestHeader: () => ({ config: { provider: 'relay', model: 'm' } }) }, {
      seq: 1, time: Date.now(), type: 'assistant/attempt', data: { stream: [
        { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } } },
      ] },
    })
    const snapshot = await (await fetch(`${origin}/dsh-app/cost.json`, { headers })).json()
    assert.equal(snapshot.all.calls, 1)
    assert.equal(snapshot.routes[0].price, null)
    const save = await fetch(`${origin}/dsh-app/cost/settings`, {
      method: 'POST', headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ currency: 'CNY', exchangeRate: 7.2, budget: { enabled: true, amount: 20, period: 'day' },
        pricing: [{ provider: 'relay', model: 'm', cacheHit: 0, cacheMiss: 1, cacheWrite: 1.25, output: 2 }] }),
    })
    assert.equal(save.status, 204)
    assert.equal(ledger.summary().config.budget.amount, 20)
    assert.equal(ledger.summary().routes[0].price.cacheMiss, 1)
    const foreign = await fetch(`${origin}/dsh-app/cost/settings`, { method: 'POST', headers: { ...headers, origin: 'https://other.invalid' }, body: '{}' })
    assert.equal(foreign.status, 403)
  } finally {
    await new Promise(resolve => server.close(resolve))
    for (const dispose of disposers.reverse()) await dispose?.()
    rmSync(home, { recursive: true, force: true })
  }
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

test('embedded cost settings notify the same-origin sidebar after saving and keep unpriced history visible', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-cost-ui-'))
  try {
    const ledger = new CostLedger(home)
    ledger.record({ id: 'iframe-session', requestHeader: () => ({ config: { provider: 'relay', model: 'm' } }) }, {
      type: 'assistant/message', seq: 1, time: Date.now(), data: { usage: { inputTokens: 10, outputTokens: 5 } },
    })
    class Element {
      constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.style = {}; this.value = '' }
      append(node) { this.children.push(node); if (this.tag === 'select' && !this.value) this.value = node.value }
      replaceChildren() { this.children = []; if (this.tag === 'select') this.value = '' }
      addEventListener(name, listener) { this.listeners[name] = listener }
      setAttribute() {}
    }
    const html = readFileSync(new URL('../lib/cost-meter.html', import.meta.url), 'utf8')
    const nodes = new Map([...html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => [match[2], new Element(match[1])]))
    const selectedPeriod = /<button type="button" id="heatmap-(\w+)"[^>]*aria-pressed="true"/.exec(html)
    assert.ok(selectedPeriod, 'the merged period control declares its initial selection')
    const node = id => {
      assert.ok(nodes.has(id), `the rendered cost document contains ${id}`)
      return nodes.get(id)
    }
    const back = new Element('a'), notifications = []
    const parent = { document: { documentElement: { lang: 'zh' } }, postMessage: (message, origin) => notifications.push({ message, origin }) }
    const origin = 'http://127.0.0.1:3080'
    const document = { documentElement: {}, getElementById: node, createElement: tag => new Element(tag), querySelectorAll: () => [], querySelector: () => back }
    const balance = { status: 'ready', updatedAt: Date.now(), retryAt: null, error: null, stale: false, isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '23.4500', grantedBalance: '3.4500', toppedUpBalance: '20.00' }] }
    runInNewContext(readFileSync(new URL('../lib/cost-meter-ui.js', import.meta.url), 'utf8'), {
      document, navigator: { language: 'en-US' }, window: { parent, location: { origin } },
      fetch: async (path, options) => {
        if (path.startsWith('/dsh-app/balance')) return { ok: true, json: async () => balance }
        if (options.method === 'POST') { ledger.updateSettings(JSON.parse(options.body)); return { ok: true, status: 204 } }
        assert.equal(path, '/dsh-app/cost.json')
        return { ok: true, json: async () => ledger.summary() }
      },
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(document.documentElement.lang, 'zh-CN')
    assert.equal(back.hidden, true)
    assert.equal(node('usage-cost').textContent, '未计价')
    assert.equal(node('usage-tokens').textContent, '15')
    assert.equal(node('usage-calls').textContent, '1')
    assert.match(node('usage-cost-detail').textContent, /1 次调用没有可用价格/)
    assert.equal(node('days').children[0].children[5].textContent, '未计价')
    assert.equal(node('balances').children[0].children[1].textContent, '23.4500')
    assert.match(node('balance-status').textContent, /账户余额可用/)
    node('currency').value = 'CNY'
    node('exchange-rate').value = '7.2'
    node('budget-enabled').checked = true
    node('budget-period').value = 'day'
    node('budget-amount').value = '100'
    await node('settings').listeners.submit({ preventDefault() {} })
    assert.match(node('budget-label').textContent, /未计价费用未扣除/)
    assert.deepEqual(notifications.map(value => value.origin), [origin])
    assert.equal(notifications[0].message.type, 'dsh-app:cost-changed')
    // Model prices moved to Settings → Models, so this page only reports usage.
    assert.equal(node('usage-cost').textContent, '未计价')
    assert.equal(node('days').children[0].children[5].textContent, '未计价')
    node('refresh-balance').listeners.click()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(notifications[1].message.type, 'dsh-app:balance-changed')
    assert.equal(notifications[1].origin, origin)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

function balanceContext() {
  const state = { key: 'official-key-A', config: { apiKeyEnv: 'MY_OFFICIAL_KEY', baseURL: 'https://api.deepseek.com/anthropic' }, official: true, baseURL: undefined, refs: [], profiles: [] }
  const official = { provider: 'deepseek-official', settingsNs: 'custom-official-entry', settingsPath: [] }
  const ctx = {
    llm: { listProviders: () => state.official ? [{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'ass', name: 'ASS' }] : [{ id: 'ass', name: 'ASS' }],
      listConfigurableProviders: () => [official, ...state.profiles.map(row => row.provider)] },
    // The shipped 0.2 SettingsForms has describe(), not the source checkout's old get().
    settings: { describe: options => { assert.equal(options.redactSecrets, false); return [
      { ns: official.settingsNs, value: state.config }, ...state.profiles.map(row => ({ ns: row.provider.settingsNs, value: row.value })),
    ] } },
    credentials: { resolve: async ref => { state.refs.push(ref); return state.key ? { value: state.key, source: 'test' } : undefined } },
    get: name => { assert.equal(name, 'launchEnvironment'); return { get: () => state.baseURL ? { value: state.baseURL } : undefined } },
  }
  return { ctx, state }
}
const officialBalance = { is_available: true, balance_infos: [
  { currency: 'CNY', total_balance: '110.0000', granted_balance: '10.0000', topped_up_balance: '100.0000' },
  { currency: 'USD', total_balance: '1.25', granted_balance: '0.25', topped_up_balance: '1.00' },
] }

test('fetches only the official configured account, coalesces reads, caches currencies and refreshes after the minimum interval', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-balance-cache-'))
  const { ctx, state } = balanceContext()
  let time = 1_000_000, calls = 0
  const service = new DeepSeekBalance(ctx, { home, refreshMs: 5_000, minRefreshMs: 1_000, retryMs: 2_000 }, {
    now: () => time, fetch: async (url, options) => {
      calls++
      assert.equal(url, 'https://api.deepseek.com/user/balance')
      assert.equal(options.headers.authorization, `Bearer ${state.key}`)
      assert.equal(options.redirect, 'error')
      return Response.json(officialBalance)
    },
  })
  try {
    assert.equal(calls, 0)
    assert.equal(state.refs.length, 0)
    const first = service.read(), same = service.read()
    assert.equal(first, same)
    const balance = await first
    assert.equal(calls, 1)
    assert.equal(balance.status, 'ready')
    assert.equal(balance.balances[0].totalBalance, '110.0000')
    assert.equal(balance.balances[1].currency, 'USD')
    assert.equal(JSON.stringify(balance).includes('official-key'), false)
    assert.equal(Object.hasOwn(balance, 'accountFingerprint'), false)
    await service.read()
    await service.read(true)
    assert.equal(calls, 1)
    time += 1_000
    await service.read(true)
    assert.equal(calls, 2)
    assert.deepEqual([...new Set(state.refs)], ['MY_OFFICIAL_KEY'])
    const disk = readFileSync(service.path, 'utf8')
    assert.equal(disk.includes(state.key), false)
    assert.equal(JSON.parse(disk).accountFingerprint.length, 64)
    const reopened = new DeepSeekBalance(ctx, { home }, { now: () => time, fetch: async () => { throw new Error('must use fresh account cache') } })
    assert.equal((await reopened.read()).status, 'ready')
    assert.equal(Object.hasOwn(await reopened.read(), 'accountFingerprint'), false)
    await reopened.close()
  } finally { await service.close(); rmSync(home, { recursive: true, force: true }) }
})

test('never sends a relay key to DeepSeek and clears a previous account when the credential or endpoint changes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-balance-account-'))
  const { ctx, state } = balanceContext()
  let time = 1_000_000, calls = 0
  const service = new DeepSeekBalance(ctx, { home }, { now: () => time, fetch: async () => { calls++; return Response.json(officialBalance) } })
  try {
    state.config.baseURL = 'https://ass.invalid/v1'
    state.key = 'relay-key'
    assert.equal((await service.read()).error, 'non-official-endpoint')
    assert.equal(calls, 0)
    assert.equal(state.refs.length, 0)
    state.profiles = [{ provider: { provider: 'ass', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'ass'] }, value: { providers: { ass: { apiKeyEnv: 'MY_OFFICIAL_KEY', baseURL: 'https://ass.invalid' } } } }]
    state.config.baseURL = 'https://api.deepseek.com'
    assert.equal((await service.read()).error, 'credential-conflict')
    assert.equal(calls, 0)
    assert.equal(state.refs.length, 0)
    state.profiles = []
    state.config.baseURL = undefined
    state.baseURL = 'https://mify.invalid'
    assert.equal((await service.read()).error, 'non-official-endpoint')
    state.config.baseURL = 'https://api.deepseek.com'
    state.key = 'official-key-A'
    assert.equal((await service.read()).balances.length, 2)
    state.key = undefined
    const missing = await service.read()
    assert.equal(missing.error, 'missing-key')
    assert.deepEqual(missing.balances, [])
    state.key = 'official-key-B'
    service.fetch = async () => { calls++; throw new Error('secret official-key-B') }
    const changed = await service.read()
    assert.equal(changed.error, 'network')
    assert.equal(changed.updatedAt, null)
    assert.deepEqual(changed.balances, [])
    assert.equal(JSON.stringify(changed).includes(state.key), false)
    service.fetch = async () => { throw new TypeError('fetch failed official-key-B', { cause: Object.assign(new Error('private diagnostic'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }) }) }
    time += 60_000
    const certificate = await service.read()
    assert.equal(certificate.error, 'tls-error')
    assert.equal(JSON.stringify(certificate).includes('private diagnostic'), false)
    assert.equal(JSON.stringify(certificate).includes(state.key), false)
    service.fetch = async () => { throw new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error(), { code: 'ENOTFOUND' })]) }) }
    time += 60_000
    assert.equal((await service.read()).error, 'dns-error')
    service.fetch = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error(), { code: 'ECONNREFUSED' }) }) }
    time += 60_000
    assert.equal((await service.read()).error, 'connection-error')
    state.official = false
    assert.equal((await service.read()).error, 'official-provider-unavailable')
    state.official = true
    ctx.settings.describe = () => { throw new TypeError('private configuration diagnostic') }
    const invalidConfig = await service.read()
    assert.equal(invalidConfig.status, 'unconfigured')
    assert.equal(invalidConfig.error, 'configuration-error')
    assert.deepEqual(invalidConfig.balances, [])
    assert.equal(JSON.stringify(invalidConfig).includes('private configuration'), false)
  } finally { await service.close(); rmSync(home, { recursive: true, force: true }) }
})

test('keeps the last success on API errors, honors retry backoff and rejects malformed amounts', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-balance-errors-'))
  const { ctx } = balanceContext()
  let time = 1_000_000, calls = 0, reply = () => Response.json(officialBalance)
  const service = new DeepSeekBalance(ctx, { home, refreshMs: 5_000, minRefreshMs: 1_000, retryMs: 2_000 }, {
    now: () => time, fetch: async () => { calls++; return reply() },
  })
  try {
    const success = await service.read()
    time += 5_000
    reply = () => new Response('not authorized', { status: 401 })
    const failure = await service.read()
    assert.equal(failure.error, 'unauthorized')
    assert.equal(failure.stale, true)
    assert.equal(failure.updatedAt, success.updatedAt)
    assert.deepEqual(failure.balances, success.balances)
    await service.read(true)
    assert.equal(calls, 2)
    time += 2_000
    reply = () => new Response('', { status: 429, headers: { 'retry-after': '60' } })
    const limited = await service.read()
    assert.equal(limited.error, 'rate-limited')
    assert.equal(limited.retryAt, time + 60_000)
    time += 5_000
    await service.read(true)
    assert.equal(calls, 3)
    time += 55_000
    reply = () => Response.json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '<script>', granted_balance: '0', topped_up_balance: '1' }] })
    assert.equal((await service.read()).error, 'invalid-response')
    time += 2_000
    reply = () => Response.json(officialBalance)
    assert.equal((await service.read()).stale, false)
  } finally { await service.close(); rmSync(home, { recursive: true, force: true }) }
})

test('bounds slow credential or network operations and aborts owned work on disposal', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-balance-timeout-'))
  const { ctx } = balanceContext()
  let calls = 0
  ctx.credentials.resolve = () => new Promise(() => {})
  const service = new DeepSeekBalance(ctx, { home, timeoutMs: 100 }, { fetch: async () => { calls++; return Response.json(officialBalance) } })
  try {
    assert.equal((await service.read()).error, 'timeout')
    assert.equal(calls, 0)
    ctx.credentials.resolve = async () => ({ value: 'official-key-A' })
    let signal
    const aborting = new DeepSeekBalance(ctx, { home, timeoutMs: 5_000 }, { fetch: async (_, options) => { signal = options.signal; return new Promise(() => {}) } })
    const pending = aborting.read()
    while (!signal) await new Promise(resolve => setImmediate(resolve))
    await aborting.close()
    await pending
    assert.equal(signal.aborted, true)
    assert.throws(() => new DeepSeekBalance(ctx, { home, minRefreshMs: 10_000, refreshMs: 5_000 }), /must not exceed/)
  } finally { await service.close(); rmSync(home, { recursive: true, force: true }) }
})
