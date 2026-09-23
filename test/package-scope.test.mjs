import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('DSH bundle mounts only DSH App and ships no community plugin dependency', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.equal(manifest.name, 'dsh-app')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(patch.trim(), '- insert:\n    - id: dsh-app-host\n      name: dsh-app')
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.deepEqual(Object.keys(manifest.optionalDependencies), ['electron'])
  for (const script of ['prepare', 'prepack', 'postinstall', 'install']) {
    assert.equal(manifest.scripts?.[script], undefined, `${script} would require pnpm build approval for Git installs`)
  }
})

test('sandbox preload matches the authored base and chrome', () => {
  const read = name => readFileSync(new URL(`../desktop/${name}`, import.meta.url), 'utf8')
  assert.equal(read('preload.cjs'), `${read('preload-base.cjs')}\n${read('chrome.cjs')}`)
})
