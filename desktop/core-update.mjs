import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PACKAGE_NAME = '@deepseek-ai/dsh'
const TAGS_URL = 'https://registry.npmjs.org/-/package/%40deepseek-ai%2Fdsh/dist-tags'

function parseVersion(value) {
  if (typeof value !== 'string') return
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (!match) return
  if (match[4]?.split('.').some(part => /^\d+$/.test(part) && !/^(0|[1-9]\d*)$/.test(part))) return
  return { numbers: match.slice(1, 4).map(BigInt), prerelease: match[4]?.split('.') }
}

function compareIdentifier(left, right) {
  const leftNumeric = /^(0|[1-9]\d*)$/.test(left)
  const rightNumeric = /^(0|[1-9]\d*)$/.test(right)
  if (leftNumeric && rightNumeric) {
    const a = BigInt(left)
    const b = BigInt(right)
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}

/** Compare the DSH package versions without relying on a sibling plugin's dependencies. */
export function compareDshVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return
  for (let index = 0; index < 3; index++) {
    if (a.numbers[index] < b.numbers[index]) return -1
    if (a.numbers[index] > b.numbers[index]) return 1
  }
  if (!a.prerelease) return b.prerelease ? 1 : 0
  if (!b.prerelease) return -1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    if (a.prerelease[index] === undefined) return -1
    if (b.prerelease[index] === undefined) return 1
    const order = compareIdentifier(a.prerelease[index], b.prerelease[index])
    if (order) return order
  }
  return 0
}

/** The launcher points to <package>/lib/bin.js for both source and npm installs. */
export function readDshVersion(cli) {
  try {
    const manifest = JSON.parse(readFileSync(join(dirname(cli), '..', 'package.json'), 'utf8'))
    return manifest.name === PACKAGE_NAME && parseVersion(manifest.version) ? manifest.version : undefined
  } catch { return }
}

export async function checkCoreUpdate(currentVersion, fetcher = fetch) {
  if (!parseVersion(currentVersion)) return { phase: 'idle' }
  const response = await fetcher(TAGS_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`DSH 更新源返回 HTTP ${response.status}`)
  const tags = await response.json()
  const candidates = [['latest', tags?.latest], ['next', tags?.next]]
    .filter(([, version]) => parseVersion(version))
  if (candidates.length === 0) throw new Error('DSH 更新源返回了无效的版本标签')
  const [channel, newest] = candidates.reduce((left, right) => compareDshVersions(left[1], right[1]) < 0 ? right : left)
  return compareDshVersions(currentVersion, newest) < 0
    ? { phase: 'available', currentVersion, version: newest, channel }
    : { phase: 'idle', currentVersion }
}

export function releaseUrl(version) {
  if (!parseVersion(version)) throw new Error('DSH 更新版本无效')
  return `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${version}`
}
