import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'
import { zipSync, strToU8 } from 'fflate'
import { stageSkillImport } from '../lib/skill-import.mjs'

async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-app-skill-import-'))
  t.after(async () => {
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + sep + 'dsh-app-skill-import-'))
    await rm(parent, { recursive: true, force: true })
  })
  const stagingRoot = join(parent, 'stage')
  await mkdir(stagingRoot)
  return { parent, stagingRoot, maxArchiveBytes: 32768, maxExpandedBytes: 65536, maxFiles: 40 }
}

test('local import stages complete skill folders and omits repository machinery', async t => {
  const options = await fixture(t), source = join(options.parent, 'source')
  await mkdir(join(source, 'first', 'scripts'), { recursive: true })
  await mkdir(join(source, 'second'), { recursive: true })
  await mkdir(join(source, '.git'), { recursive: true })
  await writeFile(join(source, 'first', 'SKILL.md'), '---\nname: first\ndescription: Example\n---\nBody')
  await writeFile(join(source, 'first', 'scripts', 'task.mjs'), 'throw new Error("Never execute")')
  await writeFile(join(source, 'second', 'SKILL.md'), 'Second')
  await writeFile(join(source, '.git', 'secret'), 'excluded')
  const result = await stageSkillImport({ ...options, source })
  assert.equal(result.candidates.length, 2)
  assert.equal(await readFile(join(result.candidates[0].path, 'scripts', 'task.mjs'), 'utf8'), 'throw new Error("Never execute")')
  await assert.rejects(readFile(join(options.stagingRoot, '.git', 'secret')), { code: 'ENOENT' })
})

test('ZIP import refuses escaping paths and link entries', async t => {
  const options = await fixture(t)
  const escaping = Buffer.from(zipSync({ '../SKILL.md': strToU8('unsafe') }))
  await assert.rejects(stageSkillImport({ ...options, zip: escaping.toString('base64') }), /Unsafe imported/)
  const link = Buffer.from(zipSync({ 'SKILL.md': strToU8('unsafe') }))
  const directory = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  link.writeUInt32LE(0xa1ff0000, directory + 38)
  await assert.rejects(stageSkillImport({ ...options, zip: link.toString('base64') }), /ZIP links/)
  const collision = Buffer.from(zipSync({ 'SKILL.md': strToU8('first'), 'skill.md': strToU8('second') }))
  await assert.rejects(stageSkillImport({ ...options, zip: collision.toString('base64') }), /collide/)
})

test('ZIP import enforces expanded bytes before decompression', async t => {
  const options = await fixture(t)
  const zip = Buffer.from(zipSync({ 'SKILL.md': strToU8('x'.repeat(2048)) }))
  await assert.rejects(stageSkillImport({ ...options, maxExpandedBytes: 1024, zip: zip.toString('base64') }), /expanded size/)
})

test('uploaded file paths cannot collide or introduce Windows alternate streams', async t => {
  const options = await fixture(t)
  await assert.rejects(stageSkillImport({ ...options, files: [{ path: 'SKILL.md:stream', base64: 'YQ==' }] }), /Unsafe imported/)
  await assert.rejects(stageSkillImport({ ...options, files: [{ path: 'SKILL.md', base64: 'YQ==' }, { path: 'skill.md', base64: 'Yg==' }] }), /collide/)
})

test('GitHub import selects the requested folder and bounds downloads', async t => {
  const options = await fixture(t)
  const archive = zipSync({ 'repo-main/skills/example/SKILL.md': strToU8('example'), 'repo-main/other/SKILL.md': strToU8('other') })
  const urls = []
  const fetchImpl = async (url, init) => { urls.push(url); assert.equal(init.redirect, 'error'); return new Response(archive) }
  const result = await stageSkillImport({ ...options, source: 'https://github.com/owner/repo/tree/main/skills', fetchImpl })
  assert.equal(result.candidates.length, 1)
  assert.equal(await readFile(join(result.candidates[0].path, 'SKILL.md'), 'utf8'), 'example')
  assert.deepEqual(urls, ['https://codeload.github.com/owner/repo/zip/main'])
  const next = await fixture(t)
  await assert.rejects(stageSkillImport({ ...next, source: 'https://evil.example/owner/repo', fetchImpl }), /public GitHub/)
  await assert.rejects(stageSkillImport({ ...next, maxArchiveBytes: 4, source: 'https://github.com/owner/repo/tree/main', fetchImpl }), /exceeds its byte limit/)
})

test('local imports refuse junctions and abort before copying', async t => {
  const options = await fixture(t), source = join(options.parent, 'source'), target = join(options.parent, 'outside')
  await mkdir(source); await mkdir(target)
  await symlink(target, join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(stageSkillImport({ ...options, source }), /contains a link/)
  await assert.rejects(stageSkillImport({ ...options, source, signal: AbortSignal.abort() }), { name: 'AbortError' })
})
