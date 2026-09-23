import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { enforcePluginQuarantine, quarantineFailedPluginActivation } from '../desktop/plugin-activation-recovery.mjs'

const alpha = '@example/alpha'
const beta = '@example/beta'
const core = '@deepseek-ai/dsh-base'
const diagnostic = packageName => `[1.000s] [stderr] Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): failed to apply loader entry plugin (${packageName}): root.events.on is unavailable from a plugin activation`

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-activation-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'profile')
  const desktopLink = join(root, 'dsh-app')
  const backups = join(desktopLink, 'backups')
  mkdirSync(profile)
  const manifest = {
    name: 'dsh-profile-web',
    dependencies: { [alpha]: '0.3.16', [beta]: '0.1.11' },
    dsh: { profile: { bundles: [core, alpha, beta] } },
  }
  const writeManifest = () => writeFileSync(join(profile, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const install = (name, version) => {
    const path = join(profile, 'node_modules', name)
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, version }))
  }
  writeManifest()
  install(alpha, '0.3.16')
  install(beta, '0.1.11')
  return { root, profile, desktopLink, backups, manifest, writeManifest, install,
    current: () => JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) }
}

test('isolates successive loader failures while preserving dependencies and an exact backup', t => {
  const f = fixture(t)
  const first = quarantineFailedPluginActivation(f.profile, f.desktopLink, f.backups, diagnostic(alpha))
  assert.equal(first.packageName, alpha)
  assert.equal(first.version, '0.3.16')
  assert.deepEqual(f.current().dsh.profile.bundles, [core, beta])
  assert.equal(JSON.parse(readFileSync(join(first.backup, 'package.json'), 'utf8')).dsh.profile.bundles.includes(alpha), true)
  assert.match(readFileSync(join(first.backup, 'startup-error.log'), 'utf8'), /root\.events\.on/)
  const second = quarantineFailedPluginActivation(f.profile, f.desktopLink, f.backups,
    `[34.942s] [error] Error: Error: failed to apply loader entry example-beta (${beta}): root.effect is unavailable from a plugin activation`)
  assert.equal(second.packageName, beta)
  assert.deepEqual(f.current().dependencies, f.manifest.dependencies)
  assert.deepEqual(f.current().dsh.profile.bundles, [core])
  assert.equal(quarantineFailedPluginActivation(f.profile, f.desktopLink, f.backups, diagnostic(beta)), undefined)
  assert.deepEqual(enforcePluginQuarantine(f.profile, f.desktopLink).map(item => item.packageName), [alpha, beta])
})

test('prevents a same-version reinstall from crashing the next boot and releases a new version', t => {
  const f = fixture(t)
  quarantineFailedPluginActivation(f.profile, f.desktopLink, f.backups, diagnostic(alpha))
  f.manifest.dsh.profile.bundles = [core, alpha, beta]
  f.writeManifest()
  assert.equal(enforcePluginQuarantine(f.profile, f.desktopLink).length, 1)
  assert.deepEqual(f.current().dsh.profile.bundles, [core, beta])
  f.install(alpha, '0.3.17')
  f.manifest.dependencies[alpha] = '0.3.17'
  f.writeManifest()
  assert.deepEqual(enforcePluginQuarantine(f.profile, f.desktopLink), [])
  f.manifest.dsh.profile.bundles = [core, alpha, beta]
  f.writeManifest()
  assert.deepEqual(enforcePluginQuarantine(f.profile, f.desktopLink), [])
  assert.deepEqual(f.current().dsh.profile.bundles, [core, alpha, beta])
})

test('does not change the profile for unrelated output, missing installations, or core failures', t => {
  const f = fixture(t)
  for (const output of [
    `plugin (${alpha}): root.events.on failed`,
    diagnostic('../../other'),
    diagnostic(core),
    diagnostic('dsh-app'),
    diagnostic('@other/not-installed'),
    '[stderr] Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): config failed',
  ]) assert.equal(quarantineFailedPluginActivation(f.profile, f.desktopLink, f.backups, output), undefined)
  assert.deepEqual(f.current().dsh.profile.bundles, [core, alpha, beta])
  assert.equal(existsSync(join(f.desktopLink, 'plugin-quarantine.json')), false)
})
