/** Stage local folders, uploaded files and public GitHub ZIPs without executing their contents. */
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { unzipSync } from 'fflate'

const ignored = new Set(['.git', 'node_modules', '.DS_Store'])

function safeName(value) {
  if (typeof value !== 'string' || !value || value.includes('\\')) throw new Error('Invalid imported file path')
  const parts = value.replace(/\/$/, '').split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\u0000-\u001f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe imported file path')
  return parts.join('/')
}

function decode(value, limit) {
  if (typeof value !== 'string' || value.length > Math.ceil(limit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid or oversized base64 upload')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length > limit) throw new Error('Upload exceeds its byte limit')
  return bytes
}

/** Reject link entries and ZIP64 before fflate allocates decompressed buffers. */
function checkZipHeaders(bytes, maxFiles) {
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break }
  }
  if (end < 0) throw new Error('Invalid ZIP directory')
  const count = bytes.readUInt16LE(end + 10)
  const size = bytes.readUInt32LE(end + 12)
  const start = bytes.readUInt32LE(end + 16)
  if (count === 65535 || start === 0xffffffff || size === 0xffffffff || start + size !== end || count > maxFiles || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new Error('Unsupported or oversized ZIP directory')
  let offset = start
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP entry')
    const flags = bytes.readUInt16LE(offset + 8)
    const mode = bytes.readUInt32LE(offset + 38) >>> 16
    if ((mode & 0xf000) === 0xa000 || (flags & 1) !== 0) throw new Error('ZIP links and encrypted entries are unsupported')
    const compressed = bytes.readUInt32LE(offset + 20), expanded = bytes.readUInt32LE(offset + 24)
    if (compressed === 0xffffffff || expanded === 0xffffffff) throw new Error('ZIP64 entries are unsupported')
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  if (offset !== end) throw new Error('Invalid ZIP directory length')
}

async function boundedResponse(url, maxBytes, signal, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'error', signal, headers: { 'user-agent': 'DSH-App-Skills', accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`Skill source returned HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Downloaded skill source exceeds its byte limit')
  let size = 0
  const chunks = []
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted()
      size += chunk.length
      if (size > maxBytes) throw new Error('Downloaded skill source exceeds its byte limit')
      chunks.push(chunk)
    }
  } catch (error) {
    await response.body?.cancel().catch(() => {}) // The stream may already be closed by async iteration.
    throw error
  }
  return Buffer.concat(chunks, size)
}

async function githubSource(source, options) {
  const url = new URL(source)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new Error('Use a public GitHub HTTPS repository URL')
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent)
  const [owner, rawRepository, mode, suppliedRef, ...folder] = parts
  const repository = rawRepository?.replace(/\.git$/, '')
  if (!/^[\w.-]+$/.test(owner ?? '') || !/^[\w.-]+$/.test(repository ?? '') || owner === '.' || owner === '..' || repository === '.' || repository === '..' || (mode !== undefined && mode !== 'tree')) throw new Error('Invalid GitHub repository URL')
  let ref = suppliedRef
  if (mode === 'tree' && !/^[\w.-]+$/.test(ref ?? '')) throw new Error('Invalid GitHub branch or tag')
  if (!ref) {
    const metadata = JSON.parse((await boundedResponse(`https://api.github.com/repos/${owner}/${repository}`, 65536, options.signal, options.fetchImpl)).toString('utf8'))
    ref = metadata.default_branch
    if (typeof ref !== 'string' || !/^[\w./-]+$/.test(ref) || ref.includes('..')) throw new Error('GitHub did not return a supported default branch')
  }
  const subtree = folder.length ? safeName(folder.join('/')) : undefined
  const bytes = await boundedResponse(`https://codeload.github.com/${owner}/${repository}/zip/${encodeURIComponent(ref)}`, options.maxArchiveBytes, options.signal, options.fetchImpl)
  return { bytes, subtree }
}

/**
 * Copy exactly one selected source into a caller-owned empty staging directory.
 * @param options Source/upload, staging path, cancellation and byte/file limits.
 * @returns Candidate directories containing SKILL.md; the caller validates and publishes them.
 */
export async function stageSkillImport({ source, files, zip, stagingRoot, maxArchiveBytes, maxExpandedBytes, maxFiles, signal, requestTimeoutMs = 15000, fetchImpl = fetch }) {
  for (const value of [maxArchiveBytes, maxExpandedBytes, maxFiles, requestTimeoutMs]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Import limits must be positive integers')
  if ([source !== undefined, files !== undefined, zip !== undefined].filter(Boolean).length !== 1) throw new Error('Select exactly one import source')
  const stagingStat = await lstat(stagingRoot)
  if (stagingStat.isSymbolicLink() || !stagingStat.isDirectory() || (await readdir(stagingRoot)).length) throw new Error('Import staging directory must be an empty real directory')
  const root = await realpath(stagingRoot)
  const requestSignal = AbortSignal.any([AbortSignal.timeout(requestTimeoutMs), ...(signal ? [signal] : [])])
  const seen = new Set(), skillDirectories = new Set(), warnings = []
  let total = 0, count = 0
  async function put(name, bytes) {
    signal?.throwIfAborted()
    const safe = safeName(name)
    if (safe.split('/').some(part => ignored.has(part))) return
    const identity = safe.toLowerCase()
    if (seen.has(identity)) throw new Error('Imported paths collide on Windows')
    seen.add(identity)
    if (++count > maxFiles || (total += bytes.length) > maxExpandedBytes) throw new Error('Imported files exceed their limit')
    const target = resolve(root, ...safe.split('/'))
    if (!target.startsWith(root + sep)) throw new Error('Imported path leaves staging directory')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
    if (basename(target) === 'SKILL.md') skillDirectories.add(dirname(target))
  }
  async function unpack(bytes, subtree) {
    checkZipHeaders(bytes, maxFiles)
    let advertised = 0
    const archivePaths = new Set()
    const entries = unzipSync(bytes, { filter(file) {
      const name = safeName(file.name).toLowerCase()
      if (archivePaths.has(name)) throw new Error('ZIP paths collide on Windows')
      archivePaths.add(name)
      advertised += file.originalSize
      if (advertised > maxExpandedBytes) throw new Error('ZIP expanded size exceeds its limit')
      return !file.name.endsWith('/')
    } })
    for (let [name, bytes] of Object.entries(entries)) {
      if (subtree) {
        const tail = name.split('/').slice(1).join('/')
        if (!tail.startsWith(subtree + '/')) continue
        name = tail.slice(subtree.length + 1)
      }
      await put(name, bytes)
    }
  }
  if (zip !== undefined) await unpack(decode(zip, maxArchiveBytes))
  else if (files !== undefined) {
    if (!Array.isArray(files) || files.length < 1 || files.length > maxFiles) throw new Error('Invalid uploaded file list')
    let uploadedBytes = 0
    for (const row of files) {
      const bytes = decode(row?.base64, maxExpandedBytes)
      if ((uploadedBytes += bytes.length) > maxExpandedBytes) throw new Error('Uploaded files exceed their byte limit')
      await put(row?.path, bytes)
    }
  } else {
    if (typeof source !== 'string') throw new Error('Invalid skill source')
    if (/^https:/i.test(source)) {
      const result = await githubSource(source, { maxArchiveBytes, signal: requestSignal, fetchImpl })
      await unpack(result.bytes, result.subtree)
    } else {
      if (!isAbsolute(source)) throw new Error('Use an absolute local skill directory')
      const stat = await lstat(source)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Skill source must be a real directory')
      const sourceRoot = await realpath(source)
      const overlap = relative(sourceRoot, root)
      if (!overlap || (!overlap.startsWith('..' + sep) && overlap !== '..' && !isAbsolute(overlap))) throw new Error('Staging directory cannot be inside the skill source')
      async function walk(directory, prefix = '') {
        signal?.throwIfAborted()
        for (const row of await readdir(directory, { withFileTypes: true })) {
          if (ignored.has(row.name)) continue
          const path = join(directory, row.name), name = prefix + row.name
          if (row.isSymbolicLink()) throw new Error('Skill source contains a link')
          if (row.isDirectory()) await walk(path, name + '/')
          else if (row.isFile()) {
            const stat = await lstat(path)
            if (stat.isSymbolicLink() || stat.size > maxExpandedBytes - total) throw new Error('Skill source exceeds its byte limit or contains a link')
            const chunks = []; let size = 0
            for await (const chunk of createReadStream(path)) {
              signal?.throwIfAborted()
              if ((size += chunk.length) > maxExpandedBytes - total) throw new Error('Skill source exceeds its byte limit')
              chunks.push(chunk)
            }
            await put(name, Buffer.concat(chunks, size))
          } else throw new Error('Skill source contains an unsupported file')
        }
      }
      await walk(sourceRoot)
    }
  }
  const candidates = [...skillDirectories].sort((a, b) => a.length - b.length).filter((path, index, all) => {
    const nested = all.slice(0, index).some(parent => path.startsWith(parent + sep))
    if (nested) warnings.push('A nested SKILL.md remains inside its parent skill')
    return !nested
  }).map(path => ({ path }))
  if (!candidates.length) throw new Error('The selected source has no SKILL.md')
  return { candidates, warnings }
}
