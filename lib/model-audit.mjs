/** Project model identities without credentials and retain observed configuration changes. */
import { parseDocument, isSeq, isMap } from 'yaml'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { digest, optionalText, readJson, writeJson } from './files.mjs'

const ASS_ID = /^ass-[a-f0-9]{16}-(chat|responses|messages)$/
const MODEL_ENTRIES = new Set(['llm-pi-ai', 'llm-deepseek', 'agent-default-model'])

function text(value) {
  return typeof value === 'string' ? value.slice(0, 500) : undefined
}

function endpoint(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return '[invalid URL]'
  }
}

/** Parse supported model entries as YAML data; JavaScript tags are never evaluated. */
export function projectModels(source, format) {
  const doc = parseDocument(source || (format === 'patch' ? '[]' : '{}'), {
    uniqueKeys: true,
    logLevel: 'silent'
  })
  if (doc.errors.length) throw new Error('Model configuration contains invalid YAML')
  const entries = {}
  if (format === 'patch') {
    if (!isSeq(doc.contents)) throw new Error('Model profile patch must be a YAML sequence')
    for (const row of doc.contents.items) {
      if (!isMap(row) || !MODEL_ENTRIES.has(row.get('id'))) continue
      const id = row.get('id')
      if (entries[id]) throw new Error(`Duplicate model configuration: ${id}`)
      const config = row.get('config', true)
      if (config && !isMap(config)) throw new Error(`Model configuration cannot be evaluated: ${id}`)
      entries[id] = config?.toJSON() || {}
    }
  } else {
    if (!isMap(doc.contents)) throw new Error('Legacy model settings must be a YAML mapping')
    for (const id of MODEL_ENTRIES) entries[id] = doc.get(id, true)?.toJSON() || {}
  }
  const providers = []
  for (const [id, provider] of Object.entries(entries['llm-pi-ai']?.providers || {})) {
    if (!provider || typeof provider !== 'object') continue
    const models = Array.isArray(provider.models) ? provider.models : []
    providers.push({
      id,
      origin: ASS_ID.test(id) ? 'ass' : 'custom',
      name: text(provider.name),
      api: text(provider.api),
      baseURL: endpoint(provider.baseUrl ?? provider.baseURL),
      models: models
        .map((model) =>
          typeof model === 'string' ? { id: model } : { id: text(model.id), name: text(model.name) }
        )
        .filter((model) => model.id)
        .sort((a, b) => a.id.localeCompare(b.id))
    })
  }
  const deepseek = entries['llm-deepseek']
  if (deepseek && Object.keys(deepseek).length)
    providers.push({
      id: 'deepseek',
      origin: 'configured',
      baseURL: endpoint(deepseek.baseUrl ?? deepseek.baseURL),
      models: (Array.isArray(deepseek.models) ? deepseek.models : []).map((model) => ({
        id: text(typeof model === 'string' ? model : model.id)
      }))
    })
  const selected = entries['agent-default-model'] || {}
  return {
    providers: providers.sort((a, b) => a.id.localeCompare(b.id)),
    default: {
      provider: text(selected.provider),
      model: text(selected.model),
      reasoningEffort: text(selected.reasoningEffort)
    }
  }
}

/** Observe both generations; their paths are fixed and their contents stay out of audit records. */
export async function readModelConfiguration(home, profile) {
  const files = [
    { path: join(profile, 'cordis.patch.yml'), format: 'patch', role: 'profile' },
    { path: join(home, 'settings.yaml'), format: 'legacy', role: 'legacy' },
    { path: join(home, 'settings.yaml.imported'), format: 'legacy', role: 'imported' }
  ]
  const sources = []
  for (const file of files) {
    const content = await optionalText(file.path)
    if (content === null) continue
    sources.push({
      path: file.path,
      role: file.role,
      revision: digest(content),
      ...projectModels(content, file.format)
    })
  }
  return { sources, revision: digest(JSON.stringify(sources)) }
}

/** Compare model routes and defaults, ignoring formatting, credentials, and unrelated plugin fields. */
export function modelChanges(before, after) {
  const changes = []
  const old = new Map(before.sources.map((source) => [source.role, source]))
  for (const role of new Set([...old.keys(), ...after.sources.map((source) => source.role)])) {
    const left = old.get(role),
      right = after.sources.find((source) => source.role === role)
    const providers = new Set([
      ...(left?.providers || []).map((p) => p.id),
      ...(right?.providers || []).map((p) => p.id)
    ])
    for (const id of providers) {
      const a = left?.providers.find((p) => p.id === id) ?? null
      const b = right?.providers.find((p) => p.id === id) ?? null
      if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ role, provider: id, before: a, after: b })
    }
    if (JSON.stringify(left?.default || {}) !== JSON.stringify(right?.default || {})) {
      changes.push({
        role,
        provider: 'default',
        before: left?.default ?? null,
        after: right?.default ?? null
      })
    }
  }
  return changes
}

/** Preserve explicit provider configuration across a legacy-to-profile migration. */
export function compareModelConfiguration(before, after) {
  const effective = (state) => {
    const profile = state.sources.find((source) => source.role === 'profile')
    const legacy = state.sources.find((source) => source.role === 'legacy')
    return profile?.providers.length ? profile : legacy || profile
  }
  const previous = effective(before),
    current = effective(after)
  for (const provider of previous?.providers || []) {
    const next = current?.providers.find((item) => item.id === provider.id)
    if (JSON.stringify(provider) !== JSON.stringify(next))
      throw new Error(`Provider configuration changed: ${provider.id}`)
  }
  for (const [key, value] of Object.entries(previous?.default || {})) {
    if (value !== undefined && current?.default?.[key] !== value)
      throw new Error(`Default model configuration changed: ${key}`)
  }
}

/** Serializes observations; external file writes have unknown actors, even when their provider IDs name ASS. */
export class ModelAudit {
  constructor({ home, profile, directory, historyLimit = 200 }) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 2000)
      throw new Error('historyLimit must be 1–2000')
    Object.assign(this, { home, profile, historyLimit, file: join(directory, 'model-audit.json') })
    this.operation = Promise.resolve()
  }

  /** Record a named app operation or an unattributed external change, retaining before and after values. */
  observe(actor = 'external') {
    const operation = this.operation.then(async () => {
      const current = await readModelConfiguration(this.home, this.profile)
      const state = await readJson(this.file, { schemaVersion: 1, history: [], current: null })
      if (state.schemaVersion !== 1 || !Array.isArray(state.history))
        throw new Error('Unsupported model audit record')
      const changes = state.current ? modelChanges(state.current, current) : []
      if (state.current?.revision === current.revision) return state
      const history = changes.length
        ? [...state.history, { id: randomUUID(), at: new Date().toISOString(), actor, changes }].slice(
            -this.historyLimit
          )
        : state.history
      const next = { schemaVersion: 1, current, history }
      await writeJson(this.file, next)
      return next
    })
    this.operation = operation.catch(() => {}) // A failed observation is reported to its caller; later observations can retry.
    return operation
  }
}
