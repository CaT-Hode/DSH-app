import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkCoreCompatibility } from '../desktop/core-compatibility.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-core-compatibility-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profile = join(root, 'profile')
  const plugin = join(profile, 'node_modules', 'example-plugin')
  const core = join(root, 'store', 'node_modules', '@deepseek-ai', 'dsh')
  const boot = join(root, 'store', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  for (const directory of [plugin, join(core, 'lib'), boot]) await mkdir(directory, { recursive: true })
  await writeFile(join(core, 'lib', 'bin.js'), '')
  await writeFile(join(boot, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }))
  await writeFile(join(boot, 'index.mjs'), `
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
export function resolveBundleDir(bin, name, anchor, profile) { return join(profile, 'node_modules', name) }
export function readProfileVersionExemptions(profile) { const file = join(profile, 'compatibility.json'); return existsSync(file) ? JSON.parse(readFileSync(file)) : {} }
export function evaluatePluginCompatibility(manifest, exemptions, version) {
  if (manifest.peerDependencies['@deepseek-ai/dsh'] === version) return
  return { name: manifest.name, version: manifest.version, exempted: exemptions[manifest.name + '@' + manifest.version]?.includes(version) }
}
`)
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['example-plugin'] } } }))
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'example-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } }, peerDependencies: { '@deepseek-ai/dsh': '1.0.0' } }))
  return { root, core, profile, boot, args: { node: process.execPath, profile, cli: join(core, 'lib', 'bin.js'), version: '2.0.0' } }
}

test('incompatible enabled plugins cancel the switch without altering profile metadata', async t => {
  const { profile, args } = await fixture(t)
  const before = await readFile(join(profile, 'package.json'), 'utf8')
  await assert.rejects(checkCoreCompatibility(args), /example-plugin@1.0.0/)
  assert.equal(await readFile(join(profile, 'package.json'), 'utf8'), before)
})

test('the candidate core validates compatible plugins and honors existing exact-version exemptions', async t => {
  const { profile, args } = await fixture(t)
  assert.equal((await checkCoreCompatibility({ ...args, version: '1.0.0' })).checked, 1)
  await writeFile(join(profile, 'compatibility.json'), '{"example-plugin@1.0.0":["2.0.0"]}')
  assert.deepEqual((await checkCoreCompatibility(args)).issues, [])
  await assert.rejects(checkCoreCompatibility({ ...args, version: '2.0.1' }), /兼容检查未通过/)
})

test('an unavailable candidate checker or malformed bundle name cannot silently pass', async t => {
  const { profile, boot, args } = await fixture(t)
  await writeFile(join(profile, 'package.json'), '{"dsh":{"profile":{"bundles":["../outside"]}}}')
  await assert.rejects(checkCoreCompatibility(args), /插件列表无效/)
  await writeFile(join(boot, 'index.mjs'), 'export const oldCore = true')
  await assert.rejects(checkCoreCompatibility(args), /不支持升级前插件检查/)
})

test('a pnpm-style linked CLI resolves compatibility code from the physical installation', async t => {
  const { root, core, args } = await fixture(t)
  const link = join(root, 'linked-cli')
  await symlink(core, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await checkCoreCompatibility({ ...args, cli: join(link, 'lib', 'bin.js'), version: '1.0.0' })).checked, 1)
})

