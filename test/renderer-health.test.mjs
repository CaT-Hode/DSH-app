import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { observeRendererHealth } from '../desktop/renderer-health.mjs'

const origin = 'http://127.0.0.1:3080'
function contents(state = { origin, ready: true, overlay: false }) {
  return Object.assign(new EventEmitter(), { isDestroyed: () => false, executeJavaScript: async () => state })
}

test('a stable application render completes and releases event listeners', async () => {
  const page = contents()
  const health = observeRendererHealth(page)
  await health.verify(origin, { timeout: 500, stable: 10, poll: 5 })
  health.dispose()
  assert.equal(page.listenerCount('console-message'), 0)
  assert.equal(page.listenerCount('render-process-gone'), 0)
})

test('a blank app or a rendered startup page cannot commit an update', async () => {
  for (const state of [{ origin, ready: false }, { origin: 'null', ready: true }]) {
    const health = observeRendererHealth(contents(state))
    try { await assert.rejects(health.verify(origin, { timeout: 25, stable: 0, poll: 5 }), /未能完成渲染/) }
    finally { health.dispose() }
  }
})

test('late component and withdrawn core API failures reject an otherwise rendered page', async () => {
  for (const message of ['Minified React error #130', 'slot entry crashed in sidebar', 'gateway/definition-unavailable: session/control']) {
    const page = contents()
    const health = observeRendererHealth(page)
    const timer = setTimeout(() => page.emit('console-message', { level: 'error', message }), 5)
    try { await assert.rejects(health.verify(origin, { timeout: 500, stable: 50, poll: 5 }), /组件或核心接口错误/) }
    finally { clearTimeout(timer); health.dispose() }
  }
})

test('renderer exit, framework overlay, and a hung renderer cannot pass readiness', async () => {
  const exited = contents()
  const exitHealth = observeRendererHealth(exited)
  exited.emit('render-process-gone', {}, { reason: 'crashed' })
  await assert.rejects(exitHealth.verify(origin), /意外退出/)
  exitHealth.dispose()
  const overlay = observeRendererHealth(contents({ origin, ready: true, overlay: true }))
  await assert.rejects(overlay.verify(origin), /错误页面/)
  overlay.dispose()
  const hung = contents()
  hung.executeJavaScript = () => new Promise(() => {})
  const hungHealth = observeRendererHealth(hung)
  await assert.rejects(hungHealth.verify(origin, { timeout: 25 }), /无响应/)
  hungHealth.dispose()
})

