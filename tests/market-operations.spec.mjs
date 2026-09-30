import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyMarketOperations, cancelMarketOperation, completeMarketOperations, MARKET_OPERATIONS_FILE, marketOperationInstalled, queueMarketOperation, readMarketOperations, readMarketResults, recordMarketFailure, recordMarketResults, validateMarketOperation } from '../desktop/market-operations.mjs'
import { beginPluginUpdate, cancelPendingPluginUpdate, completePluginRollback, completePluginUpdateBatch, completePluginUpdates, hasPendingPluginOperations, pendingPluginUpdates, pluginUpdateRecovery, preparePluginRollback, verifyPluginRollback } from '../desktop/pending-updates.mjs'
import { enforcePluginQuarantine } from '../desktop/plugin-activation-recovery.mjs'

const alpha = { id: 'alpha-request', kind: 'install', packageName: '@example/alpha', spec: '@example/alpha@1.2.3', version: '1.2.3', queuedAt: 100 }
const beta = { id: 'beta-request', kind: 'update', packageName: 'beta', spec: 'beta@2.0.0', version: '2.0.0', beforeVersion: '1.0.0', enabledBefore: false, queuedAt: 101 }

function fixture(t) {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-market-test-'))
  t.after(() => rmSync(profile, { recursive: true, force: true }))
  const write = (name, value) => writeFileSync(join(profile, name), JSON.stringify(value, null, 2) + '\n')
  const manifest = () => JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  write('package.json', { name: 'isolated-dsh-profile', dependencies: {}, dsh: { profile: { bundles: [] } } })
  const install = (operation, { version = operation.version, name = operation.packageName, patch = './cordis.patch.yml', selected = true } = {}) => {
    const folder = join(profile, 'node_modules', operation.packageName)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, version, dsh: { bundle: { patch } } }))
    writeFileSync(join(folder, 'cordis.patch.yml'), '[]\n')
    const current = manifest()
    current.dependencies[operation.packageName] = operation.spec === `${operation.packageName}@${operation.version}` ? version : operation.spec
    current.dsh.profile.bundles = current.dsh.profile.bundles.filter(name => name !== operation.packageName)
    if (selected) current.dsh.profile.bundles.push(operation.packageName)
    write('package.json', current)
  }
  return { profile, write, manifest, install, backups: join(profile, 'backups') }
}

test('queue replacement and cancellation only change pending metadata, and old completion retains a newer request', t => {
  const f = fixture(t)
  const original = readFileSync(join(f.profile, 'package.json'), 'utf8')
  assert.deepEqual(readMarketOperations(f.profile), [])
  queueMarketOperation(f.profile, alpha)
  assert.equal(hasPendingPluginOperations(f.profile), true)
  const newer = { ...alpha, id: 'alpha-new', version: '1.2.4', spec: '@example/alpha@1.2.4' }
  queueMarketOperation(f.profile, newer)
  completeMarketOperations(f.profile, [alpha])
  assert.deepEqual(readMarketOperations(f.profile), [newer])
  assert.equal(readFileSync(join(f.profile, 'package.json'), 'utf8'), original)
  assert.equal(existsSync(join(f.profile, 'node_modules')), false)
  assert.deepEqual(readMarketResults(f.profile), [])
  cancelMarketOperation(f.profile, newer.packageName)
  assert.deepEqual(readMarketOperations(f.profile), [])
})

test('durable parser rejects unsafe targets, executable options, version ranges and protected management packages', t => {
  const f = fixture(t)
  for (const operation of [
    { ...alpha, packageName: '../../outside' }, { ...alpha, id: '../outside' }, { ...alpha, queuedAt: NaN },
    { ...alpha, spec: '--registry=evil' }, { ...alpha, spec: 'x\n--force' }, { ...alpha, spec: '@example/alpha@latest', version: 'latest' },
    { ...alpha, spec: 'git+https://evil.example/org/repo' }, { ...alpha, spec: 'git+https://github.com/org/repo?token=secret' },
    { ...alpha, spec: 'file:./relative.tgz' }, { ...alpha, spec: 'file:' + join(f.profile, 'folder') },
    { ...alpha, packageName: '@deepseek-ai/dsh', spec: '@deepseek-ai/dsh@1.2.3' },
    { ...alpha, kind: 'uninstall', packageName: 'dsh-app' }, { ...alpha, enabledBefore: 'false' },
  ]) assert.throws(() => validateMarketOperation(operation))
  for (const spec of ['git+https://github.com/org/repo.git#v1.0.0', 'file:' + join(f.profile, 'local plugin.tgz')]) assert.equal(validateMarketOperation({ ...alpha, spec }).spec, spec)
  f.write(MARKET_OPERATIONS_FILE, { schemaVersion: 1, operations: [alpha, alpha] })
  assert.throws(() => readMarketOperations(f.profile), /重复/)
  f.write(MARKET_OPERATIONS_FILE, { schemaVersion: 2, operations: [] })
  assert.throws(() => readMarketOperations(f.profile), /格式无效/)
})

test('installation verification requires real name, version, bundle file, dependency and activation', t => {
  const f = fixture(t)
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
  f.install(alpha, { name: 'different-package' })
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
  f.install(alpha, { version: '1.0.0' })
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
  f.install(alpha, { patch: '../outside.yml' })
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
  f.install(alpha, { patch: './missing.yml' })
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
  f.install(alpha, { selected: false })
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
  f.install(alpha)
  assert.deepEqual(marketOperationInstalled(f.profile, alpha), { actualVersion: '1.2.3', activated: true })
  const manifest = f.manifest()
  manifest.dependencies[alpha.packageName] = '^1.2.3'
  f.write('package.json', manifest)
  assert.equal(marketOperationInstalled(f.profile, alpha), undefined)
})

test('captured install, disabled update and uninstall use sequential argv and keep outcomes pending until backend readiness', async t => {
  const f = fixture(t)
  f.install(beta, { version: '1.0.0', selected: false })
  const remove = { id: 'remove-request', kind: 'uninstall', packageName: 'old-plugin', beforeVersion: '1.0.0', queuedAt: 102 }
  f.install({ ...alpha, packageName: 'old-plugin', spec: 'old-plugin@1.0.0', version: '1.0.0' })
  for (const operation of [alpha, beta, remove]) queueMarketOperation(f.profile, operation)
  const calls = []
  const applied = await applyMarketOperations(f.profile, readMarketOperations(f.profile), async args => {
    calls.push(args)
    if (args[0] === 'remove') {
      const manifest = f.manifest()
      delete manifest.dependencies[args[1]]
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== args[1])
      f.write('package.json', manifest)
    } else f.install(args.at(-1) === alpha.spec ? alpha : beta)
  })
  assert.deepEqual(calls, [
    ['add', '--save-exact', '--config.minimum-release-age=0', alpha.spec],
    ['add', '--save-exact', '--config.minimum-release-age=0', beta.spec], ['remove', 'old-plugin', '--config.minimum-release-age=0'],
  ])
  assert.equal(f.manifest().dsh.profile.bundles.includes('beta'), false, 'the package manager cannot enable a previously disabled update')
  assert.equal(applied[1].activated, false)
  assert.equal(applied[2].actualVersion, null)
  assert.equal(readMarketOperations(f.profile).length, 3)
  assert.deepEqual(readMarketResults(f.profile), [])
  recordMarketResults(f.profile, applied.map(operation => ({ ...operation, status: 'succeeded', finishedAt: 200 })))
  completeMarketOperations(f.profile, applied)
  assert.equal(readMarketOperations(f.profile).length, 0)
  assert.equal(readMarketResults(f.profile).every(item => item.status === 'succeeded'), true)
})

test('unversioned Git and local artifacts always execute instead of accepting a pre-existing package', async t => {
  const f = fixture(t)
  f.install(alpha)
  for (const spec of ['git+https://github.com/org/repo.git#main', 'file:' + join(f.profile, 'build archive.tgz')]) {
    const operation = { ...alpha, kind: 'update', spec, enabledBefore: true }
    delete operation.version
    let executions = 0
    const applied = await applyMarketOperations(f.profile, [operation], async args => {
      executions++
      assert.equal(args.at(-1), spec)
      f.install(operation, { version: '1.2.4' })
    })
    assert.equal(executions, 1)
    assert.equal(applied[0].actualVersion, '1.2.4')
  }
})

test('stale files force one rebuild, a rejected result stays queued and exposes the actual failed version', async t => {
  const f = fixture(t)
  queueMarketOperation(f.profile, alpha)
  let calls = 0
  const applied = await applyMarketOperations(f.profile, [alpha], async args => {
    calls++
    f.install(alpha, { version: calls === 1 ? '1.0.0' : alpha.version })
    if (calls === 2) assert.equal(args.at(-1), '--force')
  })
  assert.equal(calls, 2)
  assert.equal(applied[0].actualVersion, '1.2.3')
  f.install(alpha, { version: '1.0.0' })
  await assert.rejects(applyMarketOperations(f.profile, [alpha], async () => {}), /校验失败/)
  recordMarketFailure(f.profile, 'shared startup failed')
  assert.deepEqual(readMarketOperations(f.profile), [alpha])
  assert.equal(readMarketResults(f.profile)[0].status, 'failed')
  assert.equal(readMarketResults(f.profile)[0].actualVersion, '1.0.0')
})

test('first backup survives retry, rollback restores versions and records the rejected market batch', async t => {
  const f = fixture(t)
  f.install(beta, { version: '1.0.0', selected: false })
  queueMarketOperation(f.profile, beta)
  const first = beginPluginUpdate(f.profile, f.backups)
  assert.equal(existsSync(join(first.backup, MARKET_OPERATIONS_FILE)), true)
  await applyMarketOperations(f.profile, [beta], async () => f.install(beta))
  assert.deepEqual(beginPluginUpdate(f.profile, f.backups), first)
  const rollback = preparePluginRollback(f.profile, f.backups)
  assert.throws(() => verifyPluginRollback(f.profile, rollback), /恢复校验失败/)
  f.install(beta, { version: '1.0.0', selected: false })
  verifyPluginRollback(f.profile, rollback)
  completePluginRollback(f.profile)
  assert.equal(f.manifest().dependencies.beta, '1.0.0')
  assert.equal(f.manifest().dsh.profile.bundles.includes('beta'), false)
  assert.equal(pluginUpdateRecovery(f.profile, f.backups), undefined)
  assert.deepEqual(readMarketOperations(f.profile), [])
  assert.equal(readMarketResults(f.profile)[0].status, 'rolled-back')
  assert.equal(readMarketResults(f.profile)[0].actualVersion, '1.0.0')
  assert.equal(existsSync(join(first.backup, 'failed-market-operations.json')), true)
})

test('legacy completion cannot delete a still-pending market recovery snapshot', t => {
  const f = fixture(t)
  const legacy = { packageName: alpha.packageName, version: alpha.version }
  f.install(alpha)
  f.write('.dsh-pending-updates.json', { packages: [legacy] })
  queueMarketOperation(f.profile, beta)
  beginPluginUpdate(f.profile, f.backups)
  completePluginUpdates(f.profile, [legacy])
  assert.ok(pluginUpdateRecovery(f.profile, f.backups))
  completeMarketOperations(f.profile, [beta])
  completePluginUpdateBatch(f.profile)
  assert.equal(pluginUpdateRecovery(f.profile, f.backups), undefined)
})

test('result history stays bounded and a retry replaces the outcome for the same request', t => {
  const f = fixture(t)
  const records = Array.from({ length: 55 }, (_, index) => ({ ...alpha, id: 'request-' + index, status: 'failed', actualVersion: null, finishedAt: index }))
  recordMarketResults(f.profile, records)
  assert.equal(readMarketResults(f.profile).length, 50)
  assert.equal(readMarketResults(f.profile)[0].id, 'request-5')
  recordMarketResults(f.profile, [{ ...records[54], status: 'succeeded', actualVersion: '1.2.3', finishedAt: 100 }])
  assert.equal(readMarketResults(f.profile).filter(item => item.id === 'request-54').length, 1)
  assert.equal(readMarketResults(f.profile).at(-1).status, 'succeeded')
  assert.throws(() => recordMarketResults(f.profile, [{ ...records[54], status: 'queued' }]), /结果字段无效/)
})

test('legacy cancellation removes only its exact request and never discards a recovery snapshot', t => {
  const f = fixture(t)
  cancelPendingPluginUpdate(f.profile, 'not-pending')
  assert.equal(existsSync(join(f.profile, '.dsh-pending-updates.json')), false)
  const targets = [alpha, beta].map(({ packageName, version }) => ({ packageName, version }))
  f.write('.dsh-pending-updates.json', { packages: targets })
  beginPluginUpdate(f.profile, f.backups)
  cancelPendingPluginUpdate(f.profile, alpha.packageName)
  assert.deepEqual(pendingPluginUpdates(f.profile), [targets[1]])
  const original = readFileSync(join(f.profile, '.dsh-pending-updates.json'), 'utf8')
  cancelPendingPluginUpdate(f.profile, 'not-pending')
  assert.equal(readFileSync(join(f.profile, '.dsh-pending-updates.json'), 'utf8'), original)
  cancelPendingPluginUpdate(f.profile, beta.packageName)
  assert.equal(existsSync(join(f.profile, '.dsh-pending-updates.json')), false)
  assert.ok(pluginUpdateRecovery(f.profile, f.backups))
  assert.throws(() => cancelPendingPluginUpdate(f.profile, '../../outside'), /包名无效/)
  f.write('.dsh-pending-updates.json', { packages: [{ packageName: 'unsafe', version: 'latest' }] })
  assert.throws(() => cancelPendingPluginUpdate(f.profile, 'unsafe'), /无效包名或版本/)
})

test('startup quarantine is retained and cannot turn an installed market request into a successful activation', async t => {
  const f = fixture(t)
  queueMarketOperation(f.profile, alpha)
  beginPluginUpdate(f.profile, f.backups)
  const applied = await applyMarketOperations(f.profile, [alpha], async () => f.install(alpha))
  f.write('plugin-quarantine.json', { schemaVersion: 1, plugins: [{ packageName: alpha.packageName, version: alpha.version, reason: 'user-disabled' }] })
  enforcePluginQuarantine(f.profile, f.profile)
  assert.equal(marketOperationInstalled(f.profile, alpha, { enabled: applied[0].activated }), undefined)
  assert.equal(f.manifest().dsh.profile.bundles.includes(alpha.packageName), false)
  recordMarketFailure(f.profile, 'activation was blocked by quarantine')
  assert.equal(readMarketResults(f.profile)[0].status, 'failed')
  assert.deepEqual(readMarketOperations(f.profile), [alpha])
  assert.ok(pluginUpdateRecovery(f.profile, f.backups))
})
