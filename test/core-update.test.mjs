import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkCoreUpdate, compareDshVersions, readDshVersion, releaseUrl } from '../desktop/core-update.mjs'

test('the newer official latest or next release is actionable', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://registry.npmjs.org/-/package/%40deepseek-ai%2Fdsh/dist-tags')
    assert.equal(options.headers.accept, 'application/json')
    return { ok: true, json: async () => ({ latest: '0.1.5-rc.3', next: '0.1.7-rc.1', alpha: '0.1.7-alpha.2' }) }
  }
  assert.deepEqual(await checkCoreUpdate('0.1.5-rc.1', fetcher), {
    phase: 'available', currentVersion: '0.1.5-rc.1', version: '0.1.7-rc.1', channel: 'next',
  })
  assert.deepEqual(await checkCoreUpdate('0.1.5-rc.3', fetcher), { phase: 'available', currentVersion: '0.1.5-rc.3', version: '0.1.7-rc.1', channel: 'next' })
  assert.deepEqual(await checkCoreUpdate('0.1.7-rc.1', fetcher), { phase: 'idle', currentVersion: '0.1.7-rc.1' })
  assert.equal(releaseUrl('0.1.7-rc.1'), 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1')
})

test('invalid package metadata cannot create an update button or external link', async () => {
  let called = false
  assert.deepEqual(await checkCoreUpdate(undefined, () => { called = true }), { phase: 'idle' })
  assert.equal(called, false)
  await assert.rejects(checkCoreUpdate('0.1.5-rc.1', async () => ({ ok: true, json: async () => ({ latest: '1.2.3/evil', next: null }) })))
  assert.throws(() => releaseUrl('1.2.3/evil'))
  assert.equal(compareDshVersions('0.1.5-rc.1', '0.1.5-rc.3'), -1)
  assert.equal(compareDshVersions('0.1.5-rc.3', '0.1.5'), -1)
  assert.equal(compareDshVersions('0.1.5', '0.1.5-rc.3'), 1)
  assert.equal(compareDshVersions('0.1.7-rc.1', '0.1.5-rc.3'), 1)
})

test('installed DSH version comes from the CLI package, not the desktop plugin', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-core-update-'))
  try {
    mkdirSync(join(directory, 'lib'))
    const cli = join(directory, 'lib', 'bin.js')
    writeFileSync(join(directory, 'package.json'), '{"name":"@deepseek-ai/dsh","version":"0.1.5-rc.1"}')
    assert.equal(readDshVersion(cli), '0.1.5-rc.1')
    writeFileSync(join(directory, 'package.json'), '{"name":"dsh-app","version":"99.0.0"}')
    assert.equal(readDshVersion(cli), undefined)
  } finally {
    unlinkSync(join(directory, 'package.json'))
    rmdirSync(join(directory, 'lib'))
    rmdirSync(directory)
  }
})
