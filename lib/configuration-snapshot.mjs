/** Upgrade snapshots include legacy migration inputs, excluding conversation and credential stores. */
import { copyFile, mkdir, lstat, unlink, readdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, dirname } from 'node:path'
import { optionalText, readJson, writeJson, digest } from './files.mjs'

const PROFILE_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'cordis.patch.yml',
  'cordis.yml',
  '.dsh-pending-updates.json',
  '.dsh-app-update.json'
]
const HOME_FILES = ['settings.yaml', 'settings.yaml.imported']

function destinations(home, profile) {
  return [
    ...PROFILE_FILES.map((name) => ({ key: `profile/${name}`, path: join(profile, name) })),
    ...HOME_FILES.map((name) => ({ key: `home/${name}`, path: join(home, name) }))
  ]
}

/** Identify the configuration captured by a probe without retaining its contents. */
export async function configurationRevision({ home, profile }) {
  const values = await Promise.all(
    destinations(home, profile).map(async (target) => [target.key, digest(await optionalText(target.path))])
  )
  return digest(JSON.stringify(values))
}

/** Reject recovery paths outside the app's backup directory or through a symbolic link. */
export async function assertBackupPath(root, folder) {
  const segment = relative(resolve(root), resolve(folder))
  if (
    !segment ||
    segment === '..' ||
    segment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(segment)
  )
    throw new Error('Backup path is outside the managed directory')
  let current = resolve(root)
  if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked backup directory is unsupported')
  for (const part of segment.split(/[\\/]/)) {
    current = join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked backup directory is unsupported')
  }
}

/** Snapshot only named configuration files into an existing private backup folder. */
export async function snapshotConfiguration({ home, profile, folder }) {
  const files = []
  for (const target of destinations(home, profile)) {
    const content = await optionalText(target.path)
    if (content !== null) {
      if (!(await lstat(target.path)).isFile())
        throw new Error(`Configuration is not a regular file: ${target.path}`)
      const output = join(folder, 'configuration', target.key)
      await mkdir(dirname(output), { recursive: true })
      await copyFile(target.path, output)
    }
    files.push({ key: target.key, present: content !== null, digest: digest(content) })
  }
  await writeJson(join(folder, 'configuration.json'), { schemaVersion: 1, files })
}

/** Restore captured inputs and migration outputs, retaining displaced files for recovery. */
export async function restoreConfiguration({ home, profile, folder, backupRoot }) {
  await assertBackupPath(backupRoot, folder)
  const record = await readJson(join(folder, 'configuration.json'), null)
  if (!record) return false // Legacy backups retain their older, narrower restoration path.
  const targets = destinations(home, profile)
  if (
    record.schemaVersion !== 1 ||
    !Array.isArray(record.files) ||
    record.files.length !== targets.length ||
    new Set(record.files.map((file) => file.key)).size !== targets.length
  )
    throw new Error('Invalid configuration snapshot')
  for (const file of record.files) {
    if (!targets.some((target) => target.key === file.key) || typeof file.present !== 'boolean')
      throw new Error('Invalid configuration snapshot entry')
    if (file.present && digest(await optionalText(join(folder, 'configuration', file.key))) !== file.digest)
      throw new Error(`Corrupt configuration backup: ${file.key}`)
    const target = targets.find((target) => target.key === file.key).path
    if ((await optionalText(target)) !== null && !(await lstat(target)).isFile())
      throw new Error(`Refusing linked configuration: ${target}`)
  }
  const displaced = join(folder, 'displaced', String(Date.now()))
  for (const file of record.files) {
    const target = targets.find((target) => target.key === file.key).path
    const current = await optionalText(target)
    if (current !== null) {
      if (!(await lstat(target)).isFile()) throw new Error(`Refusing linked configuration: ${target}`)
      const retained = join(displaced, file.key)
      await mkdir(dirname(retained), { recursive: true })
      await copyFile(target, retained)
    }
    if (file.present) await copyFile(join(folder, 'configuration', file.key), target)
    else if (current !== null) await unlink(target)
  }
  return true
}

/** Remove only a private probe tree, unlinking junctions without traversing installed packages. */
export async function removeProbeTree(root, folder) {
  await assertBackupPath(root, folder)
  async function remove(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory() && !item.isSymbolicLink()) await remove(path)
      else await unlink(path)
    }
    const { rmdir } = await import('node:fs/promises')
    await rmdir(directory)
  }
  await remove(folder)
}
