import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { backupPluginUpdate, beginPluginUpdate, completePluginRollback, completePluginUpdates, pendingPluginUpdates, pluginUpdateInstalled, pluginUpdateRecovery, preparePluginRollback, recordPluginUpdateFailure, verifyPluginRollback } from '../desktop/pending-updates.mjs'

const alpha = { packageName: '@example/alpha', version: '1.2.3' }
const beta = { packageName: 'beta', version: '2.0.0-next.1+test' }

function fixture(t) {
  const base = resolve(tmpdir())
  const root = mkdtempSync(join(base, 'dsh-update-test-'))
  assert.ok(resolve(root).startsWith(base + sep))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'profile')
  mkdirSync(profile)
  const write = (file, value) => writeFileSync(join(profile, file), JSON.stringify(value))
  const queue = targets => write('.dsh-pending-updates.json', { packages: targets })
  const manifest = (targets, bundles = targets.map(target => target.packageName)) => write('package.json', {
    dependencies: Object.fromEntries(targets.map(target => [target.packageName, target.version])),
    dsh: { profile: { bundles } },
  })
  const install = (target, bundle = true) => {
    const folder = join(profile, 'node_modules', target.packageName)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'package.json'), JSON.stringify({
      name: target.packageName, version: target.version, ...(bundle ? { dsh: { bundle: { patch: 'bundle.yaml' } } } : {}),
    }))
  }
  return { root, profile, write, queue, manifest, install }
}

test('rejects malformed records, unsafe package specs, version ranges and core replacement', t => {
  const f = fixture(t)
  assert.deepEqual(pendingPluginUpdates(f.profile), [])
  for (const value of [null, {}, { packages: {} }]) {
    f.write('.dsh-pending-updates.json', value)
    assert.throws(() => pendingPluginUpdates(f.profile), /格式无效/)
  }
  for (const target of [
    { ...alpha, packageName: '../../outside' }, { ...alpha, packageName: 'safe&evil' },
    { ...alpha, version: '^1.2.3' }, { ...alpha, version: '1.2.3 & echo bad' },
    { ...alpha, packageName: '@deepseek-ai/dsh' },
  ]) {
    f.queue([target])
    assert.throws(() => pendingPluginUpdates(f.profile))
  }
})

test('duplicate requests use the latest recorded exact version', t => {
  const f = fixture(t)
  f.queue([alpha, beta, { ...alpha, version: '1.2.4' }])
  assert.deepEqual(pendingPluginUpdates(f.profile), [{ ...alpha, version: '1.2.4' }, beta])
})

test('declared versions alone cannot complete an update and missing activation requires repair', t => {
  const f = fixture(t)
  f.queue([alpha])
  f.manifest([alpha])
  assert.equal(pluginUpdateInstalled(f.profile, alpha), false)
  f.install({ ...alpha, version: '1.0.0' })
  assert.throws(() => completePluginUpdates(f.profile, [alpha]), /校验失败/)
  assert.deepEqual(pendingPluginUpdates(f.profile), [alpha])
  f.install(alpha)
  f.manifest([alpha], [])
  assert.equal(pluginUpdateInstalled(f.profile, alpha), false)
  f.manifest([{ ...alpha, version: '^1.2.3' }])
  assert.equal(pluginUpdateInstalled(f.profile, alpha), false)
  f.manifest([alpha])
  assert.equal(pluginUpdateInstalled(f.profile, alpha), true)
  completePluginUpdates(f.profile, [alpha])
  assert.equal(existsSync(join(f.profile, '.dsh-pending-updates.json')), false)
})

test('plain dependencies need no bundle; different queued versions remain pending', t => {
  const f = fixture(t)
  const later = { ...alpha, version: '1.2.4' }
  f.manifest([alpha, beta], [alpha.packageName])
  f.install(alpha)
  f.install(beta, false)
  f.queue([later, beta])
  assert.equal(pluginUpdateInstalled(f.profile, beta), true)
  f.manifest([alpha, beta])
  assert.equal(pluginUpdateInstalled(f.profile, beta), false, 'a former bundle must leave the activation list')
  f.manifest([alpha, beta], [alpha.packageName])
  completePluginUpdates(f.profile, [alpha, beta])
  assert.deepEqual(pendingPluginUpdates(f.profile), [later])
})

test('backup retains the requested manifest and the actually installed versions', t => {
  const f = fixture(t)
  f.queue([alpha, beta])
  f.manifest([alpha, beta])
  f.install({ ...alpha, version: '1.0.0' })
  writeFileSync(join(f.profile, 'pnpm-lock.yaml'), 'fixture lockfile\n')
  const folder = backupPluginUpdate(f.profile, join(f.root, 'backups'))
  assert.equal(readFileSync(join(folder, 'package.json'), 'utf8'), readFileSync(join(f.profile, 'package.json'), 'utf8'))
  assert.equal(readFileSync(join(folder, 'pnpm-lock.yaml'), 'utf8'), 'fixture lockfile\n')
  assert.deepEqual(JSON.parse(readFileSync(join(folder, 'installed-versions.json'), 'utf8')), [
    { ...alpha, installedVersion: '1.0.0' }, { ...beta, installedVersion: null },
  ])
})

test('retries retain the first snapshot and recovery restores installed versions rather than optimistic declarations', t => {
  const f = fixture(t)
  const backups = join(f.root, 'backups')
  f.queue([alpha, beta])
  f.manifest([alpha, beta], [alpha.packageName])
  f.install({ ...alpha, version: '1.0.0' })
  const first = beginPluginUpdate(f.profile, backups)
  f.install(alpha)
  f.install(beta)
  assert.deepEqual(beginPluginUpdate(f.profile, backups), first)
  assert.equal(recordPluginUpdateFailure(f.profile, backups, 'fixture activation failed'), true)
  assert.equal(readFileSync(join(first.backup, 'last-error.log'), 'utf8'), 'fixture activation failed\n')
  const rollback = preparePluginRollback(f.profile, backups)
  assert.deepEqual(rollback.manifest.dependencies, { [alpha.packageName]: '1.0.0' })
  assert.deepEqual(rollback.manifest.dsh.profile.bundles, [alpha.packageName])
  assert.equal(pluginUpdateRecovery(f.profile, backups).recovering, true)
  assert.throws(() => verifyPluginRollback(f.profile, rollback), /恢复校验失败/)
  assert.deepEqual(pendingPluginUpdates(f.profile), [alpha, beta])
  f.install({ ...alpha, version: '1.0.0' })
  verifyPluginRollback(f.profile, rollback)
  completePluginRollback(f.profile)
  assert.equal(pluginUpdateRecovery(f.profile, backups), undefined)
  assert.deepEqual(pendingPluginUpdates(f.profile), [])
  assert.deepEqual(JSON.parse(readFileSync(join(first.backup, 'failed-pending-updates.json'), 'utf8')).packages, [alpha, beta])
})

test('recovery rejects a snapshot outside the desktop backup directory', t => {
  const f = fixture(t)
  f.write('.dsh-app-update.json', { schemaVersion: 1, backup: join(f.root, 'outside') })
  assert.throws(() => pluginUpdateRecovery(f.profile, join(f.root, 'backups')), /有效备份目录/)
})
