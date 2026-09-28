/** Private JSON records shared by the Host and desktop maintenance services. */
import { randomUUID, createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, rename, unlink, lstat } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Read an optional file; permission and parse failures remain observable. */
export async function optionalText(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** Read a JSON record, returning the supplied value only for an absent file. */
export async function readJson(path, absent) {
  const text = await optionalText(path)
  return text === null ? absent : JSON.parse(text)
}

/** Replace an owned file atomically without following a destination link. */
export async function atomicWrite(path, text) {
  await mkdir(dirname(path), { recursive: true })
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Refusing linked configuration: ${path}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, text, { flag: 'wx', mode: 0o600 })
  try {
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary)
    throw error
  }
}

/** Persist one private JSON document with a trailing newline. */
export function writeJson(path, value) {
  return atomicWrite(path, JSON.stringify(value, null, 2) + '\n')
}

/** Hash bytes or absence without exposing configuration contents. */
export function digest(value) {
  return createHash('sha256')
    .update(value === null ? '\0absent' : value)
    .digest('hex')
}
