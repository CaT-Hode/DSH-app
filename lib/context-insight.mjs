/** Incremental, content-free context history beside DSH's official token projections. */
import { createRequire } from 'node:module'

export const CONTEXT_PROJECTION = 'dshAppContext'
const categories = ['system', 'tools', 'user', 'injected', 'skill', 'assistant', 'tool']
const totalFields = ['requests', 'attempts', 'turns', 'inputs', 'toolCalls', 'toolFailures', 'compactions', 'prunes', 'requestMs', 'toolMs']
const count = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
const label = value => typeof value === 'string' ? value.slice(0, 200) : ''
const emptyComposition = () => Object.fromEntries(categories.map(key => [key, 0]))
const tail = (rows, row, limit) => [...rows.slice(-(limit - 1)), row]

/**
 * Create an immutable fold using the current DSH release's surface rules and estimator.
 * @param dependencies - current runtime exports: z, deriveEventMessage, isSurfaceEvent, estimateMessage, estimateToolsTokens.
 * @param options - positive integer caps for request, activity, tool, and pending-call collections.
 * @returns the registry definition; its wire value never contains prompt text or tool arguments.
 */
export function createContextInsightProjection(dependencies, options = {}) {
  const { z, deriveEventMessage, isSurfaceEvent, estimateMessage, estimateToolsTokens } = dependencies
  const limits = {
    historyLimit: options.historyLimit ?? 32,
    activityLimit: options.activityLimit ?? 32,
    toolLimit: options.toolLimit ?? 16,
    pendingLimit: options.pendingLimit ?? 128,
  }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 2 || value > 1000) throw new Error(`Context insight ${key} must be an integer between 2 and 1000`)
  }
  const number = z.number().finite().nonnegative()
  const integer = number.int()
  const route = z.object({ provider: z.string(), model: z.string(), contextWindow: integer.optional() }).strict()
  const composition = z.object(Object.fromEntries(categories.map(key => [key, integer]))).strict()
  const totals = z.object(Object.fromEntries(totalFields.map(key => [key, number]))).strict()
  const sample = z.object({
    seq: integer, time: number, turn: integer.optional(), step: integer.optional(),
    provider: z.string(), model: z.string(), estimated: integer,
    prompt: integer.optional(), output: integer.optional(), cacheRead: integer.optional(), cacheWrite: integer.optional(),
    requestMs: number.optional(), composition,
  }).strict()
  const activity = z.object({
    seq: integer, time: number, kind: z.enum(['request', 'tool', 'compaction', 'prune', 'inject', 'model', 'attempt']),
    detail: z.string(), tokens: integer.optional(), count: integer.optional(), failed: z.boolean().optional(),
  }).strict()
  const tool = z.object({ name: z.string(), calls: integer, failures: integer, durationMs: number }).strict()
  const wireSchema = z.object({
    version: z.literal(1), route, composition, totals,
    history: z.array(sample).max(limits.historyLimit), activity: z.array(activity).max(limits.activityLimit),
    tools: z.array(tool).max(limits.toolLimit + 1),
    limits: z.object({ historyLimit: integer, activityLimit: integer }).strict(),
  }).strict()
  const stateSchema = z.object({
    nodes: z.array(z.object({ seq: integer, category: z.enum(categories), tokens: integer }).strict()),
    pending: z.array(z.object({ id: z.string(), name: z.string(), time: number }).strict()).max(limits.pendingLimit),
    toolsTokens: integer, stepStart: number.optional(), view: wireSchema,
  }).strict()

  function category(event, message) {
    if (event.type === 'system/message') return 'system'
    if (event.type === 'assistant/message') return 'assistant'
    if (event.type === 'tool/result') return message?.source?.kind === 'skill' || message?.content?.[0]?.name === 'skill' ? 'skill' : 'tool'
    const source = message?.source
    if (source?.kind === 'skill-invocation' || source?.kind === 'skill-catalog') return 'skill'
    return source?.kind === 'user' ? 'user' : 'injected'
  }
  function compositionOf(nodes, toolsTokens) {
    const result = emptyComposition()
    for (const node of nodes) result[node.category] += node.tokens
    const system = nodes.findLast(node => node.category === 'system' && node.tokens > 0)?.tokens ?? 0
    result.injected += result.system - system
    result.system = system
    result.tools = toolsTokens
    return result
  }
  function updateTool(rows, name, failed, durationMs, called) {
    let key = name
    if (!rows.some(row => row.name === key) && rows.filter(row => row.name !== '').length >= limits.toolLimit) key = ''
    const previous = rows.find(row => row.name === key) ?? { name: key, calls: 0, failures: 0, durationMs: 0 }
    const next = { ...previous, calls: previous.calls + (called ? 1 : 0), failures: previous.failures + (failed ? 1 : 0), durationMs: previous.durationMs + durationMs }
    return [...rows.filter(row => row.name !== key), next]
  }
  const duration = (start, end) => start === undefined ? 0 : Math.max(0, end - start)
  function apply(state, event) {
    const data = event.data
    let next = state
    let view = state.view
    const update = changes => { view = { ...view, ...changes }; next = { ...next, view } }
    const increment = changes => update({ totals: Object.fromEntries(totalFields.map(key => [key, view.totals[key] + (changes[key] ?? 0)])) })
    const record = (kind, detail = '', extra = {}) => update({ activity: tail(view.activity, { seq: event.seq, time: event.time, kind, detail: label(detail), ...extra }, limits.activityLimit) })
    if (isSurfaceEvent(event)) {
      const message = deriveEventMessage(event)
      let type = category(event, message)
      if (event.type === 'tool/result') {
        const id = message?.source?.callId ?? message?.content?.[0]?.toolCallId
        if (state.pending.find(row => row.id === id)?.name === 'skill') type = 'skill'
      }
      const node = { seq: event.seq, category: type, tokens: message ? estimateMessage(message) : 0 }
      const nodes = [...state.nodes]
      if (event.surfaceOp === 'append') nodes.push(node)
      else {
        const start = nodes.findIndex(row => row.seq === event.surfaceOp.startSeq)
        const end = nodes.findIndex(row => row.seq === event.surfaceOp.endSeq)
        if (start < 0 || end < start) throw new Error('Context insight received an invalid surface replacement')
        nodes.splice(start, end - start + 1, node)
      }
      next = { ...next, nodes }
      update({ composition: compositionOf(nodes, next.toolsTokens) })
    }
    switch (event.type) {
      case 'request/header': {
        const header = data.header
        const provider = label(header.config?.provider)
        const model = label(header.config?.model)
        const changed = view.route.provider !== provider || view.route.model !== model
        const toolsTokens = estimateToolsTokens(header)
        next = { ...next, toolsTokens }
        update({ composition: { ...view.composition, tools: toolsTokens }, route: { ...view.route, provider, model } })
        if (changed && state.view.route.model) record('model', [provider, model].filter(Boolean).join('/'))
        break
      }
      case 'request/context':
        update({ route: {
          provider: label(data.provider), model: label(data.model),
          ...(Number.isSafeInteger(data.contextWindow) && data.contextWindow > 0 ? { contextWindow: data.contextWindow } : {}),
        } })
        break
      case 'turn/start': increment({ turns: 1 }); break
      case 'step/start': next = { ...next, stepStart: event.time }; break
      case 'step/end': {
        increment({ requestMs: duration(next.stepStart, event.time) })
        const { stepStart, ...rest } = next
        next = rest
        break
      }
      case 'user/message':
        if (data.source.kind === 'user') increment({ inputs: 1 })
        else record('inject', data.source.name ?? data.source.plugin ?? data.source.kind, { tokens: next.nodes.find(row => row.seq === event.seq)?.tokens ?? 0 })
        break
      case 'assistant/attempt': increment({ attempts: 1 }); record('attempt'); break
      case 'assistant/message': {
        const usage = data.usage
        const usageKnown = usage && ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].some(key => Number.isFinite(usage[key]))
        const input = count(usage?.inputTokens)
        const cacheRead = count(usage?.cacheReadTokens)
        const cacheWrite = count(usage?.cacheWriteTokens)
        const source = data.message.source
        const sample = {
          seq: event.seq, time: event.time, turn: data.turn, step: data.step,
          provider: label(source.provider ?? view.route.provider), model: label(source.model ?? view.route.model),
          estimated: Object.values(state.view.composition).reduce((sum, value) => sum + value, 0),
          composition: state.view.composition,
          ...(usageKnown ? { prompt: input + cacheRead + cacheWrite, output: count(usage.outputTokens), cacheRead, cacheWrite } : {}),
          ...(next.stepStart !== undefined ? { requestMs: duration(next.stepStart, event.time) } : {}),
        }
        update({ history: tail(view.history, sample, limits.historyLimit) })
        increment({ requests: 1 })
        record('request', [sample.provider, sample.model].filter(Boolean).join('/'), usageKnown ? { tokens: sample.prompt + sample.output } : {})
        break
      }
      case 'tool/call': {
        const toolName = label(data.name)
        next = { ...next, pending: tail(next.pending.filter(row => row.id !== data.callId), { id: data.callId, name: toolName, time: event.time }, limits.pendingLimit) }
        update({ tools: updateTool(view.tools, toolName, false, 0, true) })
        increment({ toolCalls: 1 })
        break
      }
      case 'tool/result': {
        const message = data.message
        const block = message.content[0]
        const id = message.source.callId ?? block?.toolCallId
        const pending = next.pending.find(row => row.id === id)
        const name = pending?.name ?? label(block?.name)
        const failed = Boolean(data.error) || message.isError === true || block?.isError === true
        const elapsed = duration(pending?.time, event.time)
        next = { ...next, pending: next.pending.filter(row => row.id !== id) }
        if (name) update({ tools: updateTool(view.tools, name, failed, elapsed, false) })
        increment({ toolFailures: failed ? 1 : 0, toolMs: elapsed })
        record('tool', name, { failed })
        break
      }
      case 'compaction/summary':
      case 'compaction/prune': {
        const isSummary = event.type === 'compaction/summary'
        increment(isSummary ? { compactions: 1 } : { prunes: 1 })
        record(isSummary ? 'compaction' : 'prune', '', { tokens: count(data.shadowedTokenCount), count: data.shadowedSeqs.length })
        break
      }
      default:
        // Session events are merge-extensible; unobserved events publish no update.
        break
    }
    return next
  }
  return {
    key: CONTEXT_PROJECTION, stateVersion: 1, stateSchema,
    init: () => ({
      nodes: [], pending: [], toolsTokens: 0,
      view: {
        version: 1, route: { provider: '', model: '' }, composition: emptyComposition(),
        totals: Object.fromEntries(totalFields.map(key => [key, 0])), history: [], activity: [], tools: [],
        limits: { historyLimit: limits.historyLimit, activityLimit: limits.activityLimit },
      },
    }),
    apply, wire: { viewSchema: wireSchema, view: state => state.view },
  }
}

/**
 * Register context insight on the current runtime; cold session data is folded only on demand.
 * @param ctx - owning DSH App plugin fiber.
 * @param options - validated history/activity/tool/pending caps passed to the fold factory.
 * @returns the dependency fiber, withdrawn with the owning plugin.
 */
export function installContextInsight(ctx, options = {}) {
  const runtime = createRequire(process.argv[1])
  const { z } = runtime('zod')
  const session = runtime('@deepseek-ai/dsh-session')
  const estimator = runtime('@deepseek-ai/dsh-token-meter/estimate')
  const definition = createContextInsightProjection({ z, ...session, ...estimator }, options)
  return ctx.inject(['sessionProjections'], scoped => scoped.effect(() => scoped.sessionProjections.register(definition), 'dsh-app: context insight'))
}
