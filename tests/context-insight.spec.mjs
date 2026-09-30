import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createContextInsightProjection } from '../lib/context-insight.mjs'
import createContextInsightClient from '../client/context-insight.mjs'

// DSH owns these versioned exports. Source-only checks select the installed CLI explicitly.
const runtime = createRequire(process.env.DSH_CORE_CLI || import.meta.url)
const { z } = runtime('zod')
const sessionExports = runtime('@deepseek-ai/dsh-session')
const estimator = runtime('@deepseek-ai/dsh-token-meter/estimate')
const dependencies = { z, ...sessionExports, ...estimator }
const text = (role, value, source) => ({ id: `message:${value}`, role, content: [{ type: 'text', text: value }], source })
const event = (seq, type, data, surfaceOp) => ({ seq, type, data, time: 1000 + seq * 10, ...(surfaceOp ? { surfaceOp } : {}) })
const fold = (definition, events) => events.reduce((state, next) => definition.apply(state, next), definition.init())

test('preserves surface positions across a nonnumeric replacement range and retains the official heuristic', () => {
  const definition = createContextInsightProjection(dependencies)
  const prompt = text('system', 'system instructions', { kind: 'plugin', plugin: 'system-prompt' })
  const first = text('user', 'first message', { kind: 'user' })
  const second = text('user', 'second message', { kind: 'user' })
  const third = text('user', 'third message', { kind: 'user' })
  const replacement = text('user', 'summary', { kind: 'plugin', plugin: 'compaction-basic' })
  const events = [
    event(0, 'system/message', { message: prompt }, 'append'),
    event(1, 'user/message', first, 'append'),
    event(2, 'user/message', second, 'append'),
    event(3, 'user/message', third, 'append'),
    event(4, 'user/message', replacement, { op: 'replace', startSeq: 1, endSeq: 2 }),
    event(5, 'compaction/summary', { shadowedSeqs: [4, 3], shadowedTokenCount: 400 }),
    event(6, 'user/message', replacement, { op: 'replace', startSeq: 4, endSeq: 3 }),
  ]
  const state = fold(definition, events)
  assert.deepEqual(state.nodes.map(node => node.seq), [0, 6])
  assert.equal(state.view.composition.system, estimator.estimateMessage(prompt))
  assert.equal(state.view.composition.injected, estimator.estimateMessage(replacement))
  assert.equal(state.view.composition.user, 0)
  assert.equal(state.view.totals.compactions, 1)
  assert.equal(state.view.totals.inputs, 3)
  assert.deepEqual(state.view.activity.find(row => row.kind === 'compaction'), { seq: 5, time: 1050, kind: 'compaction', detail: '', tokens: 400, count: 2 })
  definition.stateSchema.parse(state)
  const original = fold(definition, events.slice(0, 4))
  const saved = JSON.stringify(original)
  definition.apply(original, events[4])
  assert.equal(JSON.stringify(original), saved)
  assert.equal(definition.apply(state, event(7, 'extension/unobserved', {})), state)
})

test('records actual provider usage without adding reasoning twice or inventing missing usage', () => {
  const definition = createContextInsightProjection(dependencies)
  const answer = text('assistant', 'response', { kind: 'model', provider: 'ASS', model: 'opaque/model' })
  const state = fold(definition, [
    event(0, 'request/header', { header: { config: { provider: 'ASS', model: 'opaque/model' }, tools: [{ name: 'read', description: 'read content', parameters: {} }] } }),
    event(1, 'request/context', { provider: 'ASS', model: 'opaque/model', contextWindow: 120000 }),
    event(2, 'step/start', { turn: 1, step: 1 }),
    event(3, 'user/message', text('user', 'my prompt', { kind: 'user' }), 'append'),
    event(4, 'assistant/message', { turn: 1, step: 1, message: answer, usage: { inputTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 20, outputTokens: 30, reasoningTokens: 7 } }, 'append'),
    event(5, 'step/end', { turn: 1, step: 1 }),
    event(6, 'assistant/message', { turn: 1, step: 2, message: answer }, 'append'),
  ])
  assert.equal(state.view.history[0].prompt, 130)
  assert.equal(state.view.history[0].output, 30)
  assert.equal(state.view.history[0].provider, 'ASS')
  assert.equal(state.view.history[0].model, 'opaque/model')
  assert.equal(state.view.history[1].prompt, undefined)
  assert.equal(state.view.totals.requests, 2)
  assert.equal(state.view.totals.requestMs, 30)
  assert.equal(state.stepStart, undefined)
  assert.equal(state.view.history[0].estimated, state.view.history[0].composition.tools + state.view.history[0].composition.user)
  const checkpoint = definition.stateSchema.parse(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(definition.wire.view(checkpoint), state.view)
  assert.throws(() => definition.stateSchema.parse({ ...state, view: { ...state.view, totals: { ...state.view.totals, requests: -1 } } }))
  assert.throws(() => createContextInsightProjection(dependencies, { historyLimit: 0 }), /historyLimit/)
})

test('bounds published history, tool names and pending calls while retaining lifetime totals and failures', () => {
  const definition = createContextInsightProjection(dependencies, { historyLimit: 3, activityLimit: 4, toolLimit: 2, pendingLimit: 2 })
  const events = []
  let seq = 0
  for (let index = 0; index < 12; index++) {
    const id = `call:${index}`
    events.push(event(seq++, 'tool/call', { callId: id, name: `tool-${index}`, arguments: 'sensitive argument' }))
    const failed = index % 3 === 0
    const result = { id: `result:${index}`, role: 'user', source: { kind: 'tool', callId: id }, content: [{ type: 'tool-result', toolCallId: id, content: [{ type: 'text', text: 'sensitive result' }], ...(failed ? { isError: true } : {}) }] }
    events.push(event(seq++, 'tool/result', { message: result }, 'append'))
    events.push(event(seq++, 'assistant/message', { turn: 1, step: index, message: text('assistant', 'sensitive response', { kind: 'model', provider: 'test', model: 'test' }) }, 'append'))
  }
  const state = fold(definition, events)
  assert.equal(state.view.totals.toolCalls, 12)
  assert.equal(state.view.totals.toolFailures, 4)
  assert.equal(state.view.totals.requests, 12)
  assert.equal(state.view.history.length, 3)
  assert.equal(state.view.activity.length, 4)
  assert.equal(state.view.tools.length, 3)
  assert.equal(state.view.tools.reduce((sum, row) => sum + row.calls, 0), 12)
  assert.equal(state.view.tools.reduce((sum, row) => sum + row.failures, 0), 4)
  assert.equal(state.pending.length, 0)
  assert.doesNotMatch(JSON.stringify(state), /sensitive/)
  definition.stateSchema.parse(state)
})

test('registers and replays through the official Session projection registry', async () => {
  const { Context } = runtime('@deepseek-ai/cordis')
  const Registry = runtime('@deepseek-ai/dsh-session-projection').default
  const Store = sessionExports.default
  const { createUserMessage, createMessage } = runtime('@deepseek-ai/dsh-llm')
  const ctx = new Context()
  try {
    await ctx.plugin(Store)
    await ctx.plugin(Registry)
    ctx.sessionProjections.register(createContextInsightProjection(dependencies))
    const session = ctx.sessions.create()
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'test prompt' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('assistant/message', { turn: 1, step: 1, stream: [], usage: { inputTokens: 42, outputTokens: 3 }, message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'mock', model: 'mock-model' }, content: [{ type: 'text', text: 'yes' }] }) }, { surfaceOp: 'append' })
    const snapshot = ctx.sessionProjections.snapshot(session)
    assert.equal(snapshot.values.dshAppContext.totals.requests, 1)
    assert.equal(snapshot.values.dshAppContext.history[0].prompt, 42)
    assert.equal(snapshot.values.dshAppContext.history[0].model, 'mock-model')
  } finally { await ctx.fiber.dispose() }
})

test('frontend reads only the current session projections and marks heuristic figures', () => {
  const createElement = (type, props, ...children) => typeof type === 'function' ? type({ ...props, children }) : { type, props, children }
  const { ContextInsight, ContextSummary, dictionaries } = createContextInsightClient(name => {
    assert.equal(name, 'react')
    return { createElement }
  })
  const definition = createContextInsightProjection(dependencies)
  const insight = definition.wire.view(fold(definition, [
    event(0, 'user/message', text('user', 'private prompt', { kind: 'user' }), 'append'),
    event(1, 'assistant/message', { turn: 1, step: 1, message: text('assistant', 'private response', { kind: 'model', provider: 'ASS', model: 'model' }), usage: { inputTokens: 50, outputTokens: 12 } }, 'append'),
  ]))
  const queried = []
  const useProjection = key => { queried.push(key); return ({ dshAppContext: insight, contextPressure: { pressureTokens: 50, projectedTokens: 62, contextWindow: 100 }, tokenUsage: { uncachedInputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, outputTokens: 12 } })[key] }
  const t = (key, parameters = {}) => (dictionaries.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, key) => parameters[key])
  const html = JSON.stringify(ContextInsight({ sessionId: 'current', useProjection, t }))
  assert.match(html, /上下文与活动/)
  assert.match(html, /62%/)
  assert.match(html, /累计 Token/)
  assert.match(html, /请求与上下文变化/)
  assert.doesNotMatch(html, /private prompt|private response/)
  assert.deepEqual(queried, ['contextPressure', 'contextBreakdown', 'tokenUsage', 'dshAppContext'])
  assert.match(JSON.stringify(ContextSummary({ sessionId: 'current', useProjection, t })), /62%/)
})
