import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { installSidebarPresentation } from '../client/sidebar-bridge.mjs'

test('owned workbench presentation isolates inherited themes through late injection and restores them on unmount', async t => {
  const dom = new JSDOM('<!doctype html><html><head><style data-dsh-preset-css="desktop" media="screen">body { color: red }</style><style data-plugin-css="dsh-better-sidebar/layout.css">body { --dsh-title-bar-strip: 38px }</style></head><body></body></html>')
  const previous = new Map(['document', 'MutationObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of previous.keys()) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true })
  t.after(() => { dom.window.close(); for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] })
  const { document } = dom.window
  const preset = document.querySelector('[data-dsh-preset-css]')
  const structural = document.querySelector('[data-plugin-css]')
  let dispose
  installSidebarPresentation({ effect: callback => { dispose = callback() } })
  assert.equal(preset.media, 'screen', 'the shared Web surface keeps its existing styles before app UI activation')
  document.documentElement.setAttribute('data-dsh-app-ui', '')
  await new Promise(resolve => dom.window.setTimeout(resolve, 0))
  assert.equal(preset.media, 'not all')
  assert.equal(structural.getAttribute('media'), null, 'split layout and title-strip rules remain active')
  const custom = document.createElement('style')
  custom.setAttribute('data-dsh-custom-css', 'custom')
  custom.textContent = 'body { background: purple !important }'
  document.head.append(custom)
  await new Promise(resolve => dom.window.setTimeout(resolve, 0))
  assert.equal(custom.media, 'not all', 'a theme inserted after app activation is isolated')
  document.documentElement.removeAttribute('data-dsh-app-ui')
  await new Promise(resolve => dom.window.setTimeout(resolve, 0))
  assert.equal(preset.media, 'screen')
  assert.equal(custom.getAttribute('media'), null)
  document.documentElement.setAttribute('data-dsh-app-ui', '')
  await new Promise(resolve => dom.window.setTimeout(resolve, 0))
  assert.equal(custom.media, 'not all')
  dispose()
  assert.equal(preset.media, 'screen')
  assert.equal(custom.getAttribute('media'), null)
  custom.textContent = 'body { background: blue }'
  await new Promise(resolve => dom.window.setTimeout(resolve, 0))
  assert.equal(custom.getAttribute('media'), null, 'disposed observers do not reclaim styles')
})
