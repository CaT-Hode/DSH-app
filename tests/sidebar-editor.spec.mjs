import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'

const dependencies = process.env.DSH_APP_TEST_DEPENDENCY_ROOT ? createRequire(join(process.env.DSH_APP_TEST_DEPENDENCY_ROOT, 'package.json')) : createRequire(import.meta.url)
const { JSDOM } = dependencies('jsdom')
const require = createRequire(import.meta.url)

test('lazy editable viewer moves its cursor to a requested line and clamps lines past the file end', async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/', pretendToBeVisual: true })
  const { window } = dom
  const keys = ['window', 'Window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT', '__dshChunks__']
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of ['window', 'Window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true })
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const emptyRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })
  window.Range.prototype.getClientRects = () => []
  window.Range.prototype.getBoundingClientRect = emptyRect
  runInThisContext(readFileSync(new URL('../lib/sidebar/upstream/client-editor.js', import.meta.url), 'utf8'), { filename: 'owned-sidebar-editor.js' })
  const { TextEditor } = globalThis.__dshChunks__.editor(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id))
  const React = require('react'), { createRoot } = require('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })
  const props = { ctx: {}, scope: { sessionId: 'chat', cwd: 'D:/project' }, path: 'source.txt', viewerId: 'code', content: 'first line\nsecond line\nthird line', toolbar: 'host' }
  const render = async line => {
    await React.act(async () => root.render(React.createElement(TextEditor, { ...props, line })))
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  }
  await render(2)
  await React.act(async () => { document.querySelector('.cm-content').focus(); await new Promise(resolve => setTimeout(resolve, 30)) })
  assert.equal(window.getSelection().anchorNode.textContent, 'second line', 'source navigation controls the editable cursor rather than only passing an unused prop')
  assert.equal(window.getSelection().anchorOffset, 0)
  await render(200)
  assert.equal(window.getSelection().anchorNode.textContent, 'third line')
  assert.equal(window.getSelection().anchorOffset, 0)
})
