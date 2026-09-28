/** Copy DSH App maintenance modules into the repository-backed Windows adapter. */
import { cp, mkdir, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = fileURLToPath(new URL('../', import.meta.url))
const repository = resolve(process.argv[2] || '')
const manifest = JSON.parse(await readFile(join(repository, 'apps', 'desktop', 'package.json'), 'utf8'))
if (manifest.name !== '@deepseek-ai/dsh-desktop')
  throw new Error('Expected the DeepSeek Harness desktop repository')
const target = join(repository, 'apps', 'desktop', 'local-windows', 'maintenance')
await mkdir(join(target, 'desktop'), { recursive: true })
await cp(join(root, 'lib'), join(target, 'lib'), { recursive: true })
for (const name of [
  'maintenance-controller.mjs',
  'maintenance-window.mjs',
  'maintenance-preload.cjs',
  'startup-log.mjs',
  'backend-runner.mjs',
  'parent-ipc.mjs'
]) {
  await cp(join(root, 'desktop', name), join(target, 'desktop', name))
}
const yaml = await realpath(createRequire(import.meta.url).resolve('yaml/package.json'))
await cp(resolve(yaml, '..'), join(target, 'node_modules', 'yaml'), { recursive: true, dereference: true })
console.log('Synchronized DSH App maintenance modules into the local Windows adapter')
