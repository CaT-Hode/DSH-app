/** Cached account balance from the official DeepSeek API; never derives funds from usage. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const endpoint = 'https://api.deepseek.com/user/balance'
const defaults = { refreshMs: 300_000, timeoutMs: 5_000, retryMs: 60_000, minRefreshMs: 30_000 }
const empty = () => ({ status: 'loading', updatedAt: null, attemptedAt: null, retryAt: null,
  stale: false, isAvailable: null, balances: [], error: null })

function optionsOf(options) {
  const resolved = { ...defaults }
  for (const name of Object.keys(defaults)) if (options[name] !== undefined) resolved[name] = options[name]
  for (const [name, value] of Object.entries(resolved)) {
    const minimum = name === 'timeoutMs' ? 100 : 1_000
    const maximum = name === 'timeoutMs' ? 60_000 : 86_400_000
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(`DeepSeek balance ${name} must be an integer from ${minimum} to ${maximum}`)
  }
  if (resolved.minRefreshMs > resolved.refreshMs) throw new Error('DeepSeek balance minRefreshMs must not exceed refreshMs')
  return resolved
}

function officialURL(value) {
  try {
    const url = new URL(value)
    return url.origin === 'https://api.deepseek.com' && !url.username && !url.password && !url.search && !url.hash
      && ['/', '/v1', '/v1/', '/anthropic', '/anthropic/', '/anthropic/v1', '/anthropic/v1/'].includes(url.pathname)
  } catch { return false }
}

function parsedBalance(value) {
  if (!value || typeof value.is_available !== 'boolean' || !Array.isArray(value.balance_infos)
    || value.balance_infos.length < 1 || value.balance_infos.length > 10) throw new Error('invalid-response')
  const currencies = new Set()
  const balances = value.balance_infos.map(info => {
    if (!info || !['USD', 'CNY'].includes(info.currency) || currencies.has(info.currency)) throw new Error('invalid-response')
    currencies.add(info.currency)
    const balance = { currency: info.currency }
    for (const [apiName, name] of [['total_balance', 'totalBalance'], ['granted_balance', 'grantedBalance'], ['topped_up_balance', 'toppedUpBalance']]) {
      const amount = info[apiName]
      if (typeof amount !== 'string' || amount.length > 80 || !/^-?\d+(?:\.\d+)?$/.test(amount) || !Number.isFinite(Number(amount)))
        throw new Error('invalid-response')
      balance[name] = amount
    }
    return balance
  })
  return { isAvailable: value.is_available, balances }
}

function cachedBalance(value) {
  if (value?.version !== 1 || !/^[a-f0-9]{64}$/.test(value.accountFingerprint)
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0) throw new Error('invalid-cache')
  const parsed = parsedBalance({ is_available: value.isAvailable, balance_infos: value.balances?.map(info => ({
    currency: info.currency, total_balance: info.totalBalance, granted_balance: info.grantedBalance, topped_up_balance: info.toppedUpBalance,
  })) })
  return { ...parsed, updatedAt: value.updatedAt, accountFingerprint: value.accountFingerprint }
}

function networkErrorOf(error) {
  const codes = new Set()
  const visit = (value, depth = 0) => {
    if (!value || depth > 4) return
    if (typeof value.code === 'string') codes.add(value.code)
    visit(value.cause, depth + 1)
    if (Array.isArray(value.errors)) for (const nested of value.errors.slice(0, 8)) visit(nested, depth + 1)
  }
  visit(error)
  if (['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].some(code => codes.has(code))) return 'tls-error'
  if (['ENOTFOUND', 'EAI_AGAIN'].some(code => codes.has(code))) return 'dns-error'
  if (['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].some(code => codes.has(code))) return 'timeout'
  if (['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET'].some(code => codes.has(code))) return 'connection-error'
  return 'network'
}

/** Own lazy, deduplicated requests and an account-specific cache without persisting credentials. */
export class DeepSeekBalance {
  /** @param ctx DSH credentials, settings, LLM and optional launch-environment services. @param options Cache location and request intervals. */
  constructor(ctx, options, { fetch = globalThis.fetch, now = Date.now } = {}) {
    this.ctx = ctx
    this.options = optionsOf(options)
    this.path = join(options.home, 'storages', 'dsh-app-cost', 'deepseek-balance.json')
    this.fetch = fetch
    this.now = now
    this.state = empty()
    this.accountFingerprint = undefined
    this.inflight = undefined
    this.controller = undefined
    this.closed = false
  }

  /** Resolve only the official route's configured credential and endpoint on each operation. */
  async credential() {
    if (!this.ctx.llm?.listProviders().some(provider => provider.id === 'deepseek-official'))
      return { error: 'official-provider-unavailable' }
    const providers = this.ctx.llm.listConfigurableProviders()
    const official = providers.find(provider => provider.provider === 'deepseek-official')
    if (!official || typeof this.ctx.settings?.describe !== 'function') return { error: 'configuration-error' }
    // DSH 0.2 owns live settings by profile entry id; the auth owner declares that address.
    const descriptors = this.ctx.settings.describe({ redactSecrets: false })
    const profileOf = provider => {
      let profile = descriptors.find(row => row.ns === provider.settingsNs)?.value
      for (const part of provider.settingsPath) profile = profile?.[part]
      return profile
    }
    const config = profileOf(official)
    if (!config || typeof config !== 'object') return { error: 'configuration-error' }
    const launchEnvironment = this.ctx.get?.('launchEnvironment')
    const baseURL = config.baseURL ?? (launchEnvironment ? launchEnvironment.get('DEEPSEEK_BASE_URL')?.value : process.env.DEEPSEEK_BASE_URL)
      ?? 'https://api.deepseek.com/anthropic'
    if (!officialURL(baseURL)) return { error: 'non-official-endpoint' }
    const ref = config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'
    if (typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return { error: 'missing-key' }
    for (const provider of providers) {
      if (provider.provider === 'deepseek-official') continue
      const profile = profileOf(provider)
      if (profile?.apiKeyEnv === ref && !officialURL(profile.baseURL)) return { error: 'credential-conflict' }
    }
    const credential = await this.ctx.credentials?.resolve(ref)
    const key = credential?.value?.trim()
    if (!key) return { error: 'missing-key' }
    return { key, accountFingerprint: createHash('sha256').update(key).digest('hex') }
  }

  snapshot() {
    return { ...this.state, balances: this.state.balances.map(info => ({ ...info })),
      stale: this.state.balances.length > 0 && (this.state.status !== 'ready' || this.now() - this.state.updatedAt >= this.options.refreshMs) }
  }

  /** Read cached funds or refresh once; concurrent callers share the same bounded operation. @param force Request an early refresh within the configured minimum interval. @returns Sanitized status and API currencies. */
  read(force = false) {
    if (this.inflight) return this.inflight
    if (this.closed) return Promise.resolve(this.snapshot())
    this.inflight = this.perform(force).finally(() => { this.inflight = undefined })
    return this.inflight
  }

  async perform(force) {
    const controller = new AbortController()
    this.controller = controller
    let timeout
    const stopped = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error(this.closed ? 'closed' : 'timeout')), { once: true })
      timeout = setTimeout(() => controller.abort(), this.options.timeoutMs)
    })
    const bounded = promise => Promise.race([promise, stopped])
    let attempted = false
    try {
      const credential = await bounded(this.credential().catch(() => ({ error: 'configuration-error' })))
      if (this.closed) return this.snapshot()
      if (credential.error) {
        this.accountFingerprint = undefined
        this.state = { ...empty(), status: 'unconfigured', error: credential.error }
        return this.snapshot()
      }
      if (this.accountFingerprint !== credential.accountFingerprint) {
        this.accountFingerprint = credential.accountFingerprint
        this.state = empty()
        try {
          const cache = cachedBalance(JSON.parse(await bounded(readFile(this.path, 'utf8'))))
          if (cache.accountFingerprint === this.accountFingerprint && cache.updatedAt <= this.now())
            this.state = { ...empty(), balances: cache.balances, isAvailable: cache.isAvailable,
              updatedAt: cache.updatedAt, status: 'ready', retryAt: cache.updatedAt + this.options.refreshMs }
        } catch (error) {
          // Missing or invalid disposable balance caches cannot affect the cost ledger or an API refresh.
          if (controller.signal.aborted) throw error
        }
      }
      const time = this.now()
      const minimum = this.state.attemptedAt === null ? 0 : this.state.attemptedAt + this.options.minRefreshMs
      if ((force && time < Math.max(minimum, this.state.status === 'error' ? this.state.retryAt ?? 0 : 0))
        || (!force && this.state.retryAt !== null && time < this.state.retryAt)) return this.snapshot()
      this.state.attemptedAt = time
      attempted = true
      const response = await bounded(this.fetch(endpoint, {
        headers: { accept: 'application/json', authorization: `Bearer ${credential.key}` }, redirect: 'error', signal: controller.signal,
      }))
      if (!response.ok) {
        const code = [401, 403].includes(response.status) ? 'unauthorized' : response.status === 429 ? 'rate-limited' : 'http-error'
        if (response.status === 429) {
          const header = response.headers.get('retry-after'), seconds = Number(header)
          const retryTime = header === null ? NaN : /^\d+$/.test(header) ? time + seconds * 1_000 : Date.parse(header)
          if (Number.isFinite(retryTime)) this.state.retryAt = Math.min(time + 86_400_000, Math.max(time, retryTime))
        }
        throw new Error(code)
      }
      const text = await bounded(response.text())
      if (text.length > 131_072) throw new Error('invalid-response')
      let value
      try { value = JSON.parse(text) } catch { throw new Error('invalid-response') }
      const balance = parsedBalance(value)
      if (this.closed) return this.snapshot()
      const updatedAt = this.now()
      this.state = { ...empty(), ...balance, status: 'ready', updatedAt, attemptedAt: time, retryAt: updatedAt + this.options.refreshMs }
      try {
        await bounded(mkdir(dirname(this.path), { recursive: true }))
        const temporary = `${this.path}.${process.pid}.tmp`
        await bounded(writeFile(temporary, JSON.stringify({ version: 1, accountFingerprint: this.accountFingerprint, updatedAt, ...balance }), { mode: 0o600 }))
        await bounded(rename(temporary, this.path))
      } catch {
        // The optional disk cache may be unavailable; the fetched balance stays valid in memory.
      }
      return this.snapshot()
    } catch (error) {
      if (this.closed) return this.snapshot()
      const allowed = ['unauthorized', 'rate-limited', 'http-error', 'timeout', 'invalid-response']
      const code = controller.signal.aborted ? 'timeout' : allowed.includes(error.message) ? error.message : networkErrorOf(error)
      const time = this.now()
      this.state = { ...this.state, status: 'error', error: code, attemptedAt: attempted ? this.state.attemptedAt : time,
        retryAt: Math.max(time + this.options.retryMs, code === 'rate-limited' ? this.state.retryAt ?? 0 : 0) }
      return this.snapshot()
    } finally {
      clearTimeout(timeout)
      this.controller = undefined
    }
  }

  /** Abort and await the owned operation before disposing the Host plugin. */
  async close() {
    this.closed = true
    this.controller?.abort()
    await this.inflight
  }
}
