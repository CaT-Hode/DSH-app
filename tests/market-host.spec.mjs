import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { PluginMarket, catalogOf, installPluginMarket } from '../lib/market-host.mjs'
import { readMarketOperations, queueMarketOperation, recordMarketResults } from '../desktop/market-operations.mjs'

function fixture(t, options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-app-market-'))
  const profile = join(home, 'profiles', 'web')
  const directory = join(home, 'dsh-app')
  mkdirSync(join(profile, 'node_modules', 'fixture-plugin'), { recursive: true })
  const manifest = { dependencies: { 'fixture-plugin': '1.0.0' }, dsh: { profile: { bundles: ['fixture-plugin'] } } }
  writeFileSync(join(profile, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(profile, 'node_modules', 'fixture-plugin', 'package.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  const routes = new Map(), disposers = []
  const ctx = { get: () => null, connection: { requestRejection: request => request.headers.authorization === 'fixture' ? undefined : 401 }, webServer: { port: 3099, register: row => { routes.set(row.path, row.handler); return () => routes.delete(row.path) } }, effect: (effect) => { const disposer = effect(); if (disposer) disposers.push(disposer) } }
  const args = { home, profile, directory, market: options.market }
  t.after(async () => { for (const dispose of disposers.reverse()) await dispose(); rmSync(home, { recursive: true, force: true }) })
  return { home, profile, directory, ctx, args, routes }
}

const packageMetadata = (name, version = '1.1.0') => ({ name, version, dsh: { bundle: { patch: './cordis.patch.yml' } } })
const catalog = { categories: { ui: { en: 'UI', zh: '界面' } }, plugins: [{ name: 'Fixture', npm: 'fixture-plugin', version: '1.1.0', install: 'fixture-plugin', category: 'ui', description: { zh: '示例' }, url: 'https://github.com/example/fixture' }] }

test('discovery omits retired integrations while unrelated community packages stay visible', () => {
  const names = ['dshmarket', 'dsh-mcp-connector', 'dsh-better-sidebar', 'dsh-cost-meter', 'dsh-context', '@michengai/dsh-codex-ui', '@linxin666/dsh-client-ui-skill-explorer', '@michengai/dsh-skills-manager', 'fixture-plugin']
  const rows = catalogOf({ plugins: names.map(name => ({ name, npm: name })) }).plugins
  assert.deepEqual(rows.map(row => row.packageName), ['fixture-plugin'])
})

test('catalog survives normalization and its offline cache retains usable install sources', async t => {
  const { args } = fixture(t)
  let calls = 0, offline = false
  const market = new PluginMarket({ get: () => null }, args, { fetch: async () => { calls++; if (offline) throw new Error('offline'); return Response.json(catalog) } })
  t.after(() => market.close())
  assert.equal(calls, 0)
  const first = await market.catalog()
  assert.equal(first.plugins[0].packageName, 'fixture-plugin')
  assert.equal(catalogOf(first).plugins.length, 1)
  await market.catalog()
  assert.equal(calls, 1)
  offline = true
  const fallback = await market.catalog(true)
  assert.equal(fallback.stale, true)
  assert.equal(fallback.plugins[0].install, 'fixture-plugin')
  assert.match(fallback.error, /offline/)
})

test('refresh replaces a truncated catalog cache instead of leaving the market permanently unusable', async t => {
  const { args, home } = fixture(t)
  mkdirSync(join(home, 'dsh-app'), { recursive: true })
  writeFileSync(join(home, 'dsh-app', 'market-catalog.json'), '{"catalog":')
  const market = new PluginMarket({ get: () => null }, args, { fetch: async () => Response.json(catalog) })
  t.after(() => market.close())
  assert.equal((await market.catalog(true)).plugins.length, 1)
  assert.equal(JSON.parse(readFileSync(join(home, 'dsh-app', 'market-catalog.json'))).catalog.plugins[0].packageName, 'fixture-plugin')
})

test('updates record exact stopped-profile work without changing installed modules; cancel clears the request', async t => {
  const { args, profile } = fixture(t)
  let calls = 0
  const market = new PluginMarket({ get: () => null }, args, { fetch: async () => { calls++; return Response.json(packageMetadata('fixture-plugin')) }, canRestart: () => false })
  t.after(() => market.close())
  const before = readFileSync(join(profile, 'package.json'), 'utf8')
  assert.equal((await market.state()).installed[0].latestVersion, null)
  assert.equal(calls, 0)
  const checked = await market.checkUpdates()
  assert.equal(checked.installed[0].updateAvailable, true)
  const queued = await market.queue({ kind: 'update', packageName: 'fixture-plugin' })
  assert.equal(queued.state, 'queued')
  assert.equal(readMarketOperations(profile)[0].spec, 'fixture-plugin@1.1.0')
  assert.equal(readMarketOperations(profile)[0].enabledBefore, true)
  assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), before)
  assert.equal(JSON.parse(readFileSync(join(profile, 'node_modules', 'fixture-plugin', 'package.json'))).version, '1.0.0')
  assert.equal((await market.state()).pendingCount, 1)
  await assert.rejects(market.restart(), /desktop client/)
  market.cancel('fixture-plugin')
  assert.equal(readMarketOperations(profile).length, 0)
  assert.equal((await market.state()).restartRequired, false)
})

test('registry mismatches, libraries, downgrades and core changes cannot enter the persistent queue', async t => {
  const { args, profile } = fixture(t)
  let metadata = packageMetadata('other-plugin')
  const market = new PluginMarket({ get: () => null }, args, { fetch: async () => Response.json(metadata) })
  t.after(() => market.close())
  await assert.rejects(market.queue({ kind: 'update', packageName: 'fixture-plugin' }), /matching DSH/)
  metadata = { name: 'fixture-plugin', version: '2.0.0' }
  await assert.rejects(market.latest('fixture-plugin', true), /matching DSH/)
  metadata = packageMetadata('fixture-plugin', '0.9.0')
  await market.latest('fixture-plugin', true)
  await assert.rejects(market.queue({ kind: 'update', packageName: 'fixture-plugin' }), /downgrade/)
  await assert.rejects(market.queue({ kind: 'install', packageName: '@deepseek-ai/dsh' }), /core/)
  await assert.rejects(market.queue({ kind: 'install', spec: '--ignore-scripts' }), /npm package/)
  assert.equal(readMarketOperations(profile).length, 0)
})

test('restart is delivered once to its owning shell and failed delivery remains retryable', async t => {
  const { args } = fixture(t)
  let sent = 0
  const market = new PluginMarket({ get: () => null }, args, { canRestart: () => true, sendRestart: async () => { sent++; if (sent === 1) throw new Error('closed IPC') } })
  await assert.rejects(market.restart(), /closed IPC/)
  assert.equal((await market.restart()).managedBy, 'desktop-host')
  await assert.rejects(market.restart(), /already/)
  assert.equal(sent, 2)
  await market.close()
})

test('a failed startup remains visible while its pending change is retained for retry', async t => {
  const { args, profile } = fixture(t)
  const market = new PluginMarket({ get: () => null }, args, { fetch: async () => Response.json(packageMetadata('fixture-plugin')) })
  t.after(() => market.close())
  await market.queue({ kind: 'update', packageName: 'fixture-plugin' })
  const pending = readMarketOperations(profile)[0]
  recordMarketResults(profile, [{ ...pending, status: 'failed', actualVersion: '1.1.0', finishedAt: Date.now(), message: 'Backend validation failed' }])
  const state = await market.state()
  assert.equal(state.pendingCount, 1)
  assert.equal(state.restartRequired, true)
  assert.equal(state.operation.state, 'failed')
  assert.equal(state.operation.error, 'Backend validation failed')
})

test('legacy pending updates are visible and cancellable before a conflicting request can be queued', async t => {
  const { args, profile } = fixture(t)
  writeFileSync(join(profile, '.dsh-pending-updates.json'), JSON.stringify({ packages: [{ packageName: 'fixture-plugin', version: '1.0.1' }] }))
  const market = new PluginMarket({ get: () => null }, args, { fetch: async () => Response.json(packageMetadata('fixture-plugin')) })
  t.after(() => market.close())
  assert.equal((await market.state()).pending[0].legacy, true)
  await assert.rejects(market.queue({ kind: 'update', packageName: 'fixture-plugin' }), /earlier update/)
  market.cancel('fixture-plugin')
  assert.equal((await market.state()).pendingCount, 0)
  assert.equal((await market.queue({ kind: 'update', packageName: 'fixture-plugin' })).state, 'queued')
})

test('HTTP mutations require authentication and the serving origin; update-provider discovery remains honest', async t => {
  const { ctx, args, routes, profile } = fixture(t)
  installPluginMarket(ctx, args)
  async function request(path, method, body, headers = {}) {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
    Object.assign(request, { method, url: path, headers: { host: '127.0.0.1:3099', ...headers } })
    const response = { destroyed: false, status: null, headers: {}, body: '', writeHead(status, headers) { this.status = status; this.headers = headers }, end(text = '') { this.body = text } }
    await routes.get(path.split('?')[0])(request, response)
    return response
  }
  assert.equal((await request('/dsh-app/market/cancel', 'POST', { packageName: 'fixture-plugin' })).status, 401)
  assert.equal((await request('/dsh-app/market/cancel', 'POST', { packageName: 'fixture-plugin' }, { authorization: 'fixture', origin: 'https://external.example' })).status, 403)
  assert.equal((await request('/dsh-app/market/cancel', 'POST', { packageName: 'fixture-plugin' }, { authorization: 'fixture', origin: 'http://127.0.0.1:3099' })).status, 200)
  const discovery = JSON.parse((await request('/dsh-market/api/v1/capabilities', 'GET', undefined, { authorization: 'fixture' })).body)
  assert.equal(discovery.schema, 'dsh-market/update-api/v1')
  assert.equal(discovery.features.check, true)
  assert.equal(discovery.features.update, false)
  assert.equal(discovery.features.rollback, false)
  assert.equal(discovery.restart.supported, false)
  const failed = { id: 'failed-http', kind: 'update', packageName: 'fixture-plugin', spec: 'fixture-plugin@1.1.0', version: '1.1.0', beforeVersion: '1.0.0', enabledBefore: true, queuedAt: 100 }
  queueMarketOperation(profile, failed)
  recordMarketResults(profile, [{ ...failed, status: 'failed', actualVersion: '1.1.0', finishedAt: 200, message: 'Startup check failed' }])
  const observed = JSON.parse((await request('/dsh-market/api/v1/operations?operationId=failed-http', 'GET', undefined, { authorization: 'fixture' })).body)
  assert.equal(observed.operation.state, 'failed')
  assert.equal(observed.operation.failure.message, 'Startup check failed')
})
