import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { backupCoreProfileMetadata, installCoreRuntime, readActiveCore, restoreCoreProfileMetadata, rollbackCoreRuntime, switchCoreRuntime, finishCoreRuntime } from '../desktop/core-runtime.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-core-runtime-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = join(root, 'dsh-app')
  const profile = join(root, 'profile')
  mkdirSync(directory)
  mkdirSync(profile)
  return { root, directory, profile }
}

test('installs an exact core beside the old runtime and validates the executable version', async t => {
  const { root, directory } = fixture(t)
  const pnpmCli = join(root, 'fake-pnpm.cjs')
  writeFileSync(pnpmCli, `
if (process.argv.includes('--version')) { console.log('11.22.0'); process.exit(0) }
const fs = require('node:fs')
const path = require('node:path')
const prefix = process.cwd()
const version = JSON.parse(fs.readFileSync(path.join(prefix, 'package.json'), 'utf8')).dependencies['@deepseek-ai/dsh']
const packageRoot = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh')
fs.mkdirSync(path.join(packageRoot, 'lib'), { recursive: true })
fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version, bin: { dsh: 'lib/bin.js' } }))
fs.writeFileSync(path.join(packageRoot, 'lib', 'bin.js'), 'console.log(${JSON.stringify('0.1.7-rc.1')})')
`)
  const runtime = await installCoreRuntime({ directory, version: '0.1.7-rc.1', node: process.execPath, pnpmCli })
  assert.match(runtime.cli, /core-runtimes[\\/]0\.1\.7-rc\.1[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/)
  assert.equal(runtime.node, process.execPath)
  assert.equal(runtime.execArgv.length, 0)
  assert.equal(readActiveCore(directory), undefined)
  const reused = await installCoreRuntime({ directory, version: '0.1.7-rc.1', node: process.execPath, pnpmCli })
  assert.deepEqual(reused, runtime)
})

test('rejected executable version leaves the previous CLI selected', async t => {
  const { root, directory } = fixture(t)
  const pnpmCli = join(root, 'fake-pnpm.cjs')
  writeFileSync(pnpmCli, `
if (process.argv.includes('--version')) { console.log('11.22.0'); process.exit(0) }
const fs = require('node:fs')
const path = require('node:path')
const prefix = process.cwd()
const packageRoot = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh')
fs.mkdirSync(path.join(packageRoot, 'lib'), { recursive: true })
fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '2.0.0', bin: { dsh: 'lib/bin.js' } }))
fs.writeFileSync(path.join(packageRoot, 'lib', 'bin.js'), 'console.log("2.0.0")')
`)
  await assert.rejects(installCoreRuntime({ directory, version: '1.0.0', node: process.execPath, pnpmCli }), /版本或命令入口/)
  assert.equal(readActiveCore(directory), undefined)
})

test('metadata backup and interrupted update restore the prior runtime', t => {
  const { root, directory, profile } = fixture(t)
  writeFileSync(join(profile, 'package.json'), '{"name":"web"}')
  writeFileSync(join(profile, 'pnpm-lock.yaml'), 'lockfileVersion: 9')
  const backup = backupCoreProfileMetadata(profile, join(directory, 'backups'))
  assert.equal(readFileSync(join(backup, 'package.json'), 'utf8'), '{"name":"web"}')
  writeFileSync(join(profile, 'package.json'), '{"name":"changed"}')
  writeFileSync(join(profile, '.dsh-pending-updates.json'), '{}')
  restoreCoreProfileMetadata(profile, join(directory, 'backups'), backup)
  assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), '{"name":"web"}')
  assert.equal(readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8'), 'lockfileVersion: 9')
  assert.equal(existsSync(join(profile, '.dsh-pending-updates.json')), false)
  assert.equal(readActiveCore(directory), undefined)
  const oldRuntime = { cli: join(root, 'old.js'), node: process.execPath, cwd: root, execArgv: [] }
  const managedDir = join(directory, 'core-runtimes', '1.0.0')
  mkdirSync(managedDir, { recursive: true })
  const newRuntime = { cli: join(managedDir, 'new.js'), node: process.execPath, cwd: managedDir, execArgv: [] }
  switchCoreRuntime(directory, newRuntime, oldRuntime, backup)
  assert.equal(readActiveCore(directory).active.cli, newRuntime.cli)
  assert.equal(readActiveCore(directory).phase, 'pending')
  // Simulate an app exit after the pointer switch: no inline rollback runs.
  writeFileSync(join(profile, 'package.json'), '{"name":"new-core-write"}')
  assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), '{"name":"new-core-write"}')
  assert.equal(rollbackCoreRuntime(directory), true)
  restoreCoreProfileMetadata(profile, join(directory, 'backups'), backup)
  assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), '{"name":"web"}')
  assert.equal(readActiveCore(directory).active.cli, oldRuntime.cli)
  assert.equal(readActiveCore(directory).phase, 'ready')
  switchCoreRuntime(directory, newRuntime, oldRuntime, backup)
  finishCoreRuntime(directory)
  assert.equal(readActiveCore(directory).active.cli, newRuntime.cli)
  assert.equal(readActiveCore(directory).phase, 'ready')
  assert.equal(rollbackCoreRuntime(directory), false)
})
