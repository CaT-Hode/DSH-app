import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import createUsageHeatmapClient, { activityCells } from '../client/usage-heatmap.mjs'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const summary = { date: '2026-10-31', timeZone: 'Asia/Shanghai', activity: { date: '2026-10-31', hour: 16, unlocatedTokens: 0,
  hours: Array.from({ length: 24 }, (_, hour) => ({ input: hour === 15 ? 25 : 0, cacheRead: hour === 15 ? 100 : 0, output: hour === 15 ? 5 : 0, reasoning: 1000 })) },
  week: Array.from({ length: 7 }, (_, index) => ({ date: new Date(2026, 9, 26 + index).toLocaleDateString('en-CA'), unlocatedTokens: index === 3 ? 5 : 0,
    buckets: [{ input: index === 2 ? 8 : 0 }, { output: index === 2 ? 4 : 0 }, {}] })),
  days: [{ date: '2026-10-30', input: 30, output: 3 }, { date: '2026-10-31', input: 31, output: 4 }] }

test('24 hours and 30 monthly cells preserve all tokens, including day 31 and leap February', () => {
  const today = activityCells(summary)
  assert.equal(today.length, 24)
  assert.equal(today[15].tokens, 130)
  assert.equal(today[17].future, true)
  const month = activityCells(summary, 'month')
  assert.equal(month.length, 30)
  assert.equal(month[29].tokens, 68)
  assert.deepEqual(month[29].parts.map(row => row.label), ['2026-10-30', '2026-10-31'])
  assert.equal(month[29].current, true)
  const february = activityCells({ ...summary, date: '2028-02-29', activity: { date: '2028-02-29' } }, 'month')
  assert.equal(february[28].parts.length, 1)
  assert.equal(february[29].parts.length, 0)
})

test('21 weekly cells cover seven weekday columns of three eight-hour slices each', () => {
  const week = activityCells(summary, 'week')
  assert.equal(week.length, 21)
  // One column per weekday: index runs down a day's three slices before the next day.
  assert.deepEqual(week.slice(0, 3).map(cell => cell.parts[0].label.slice(0, 10)), ['2026-10-26', '2026-10-26', '2026-10-26'])
  assert.deepEqual(week.slice(0, 3).map(cell => cell.parts[0].label.slice(-11)), ['00:00–08:00', '08:00–16:00', '16:00–24:00'])
  assert.deepEqual(week.slice(3, 6).map(cell => cell.parts[0].label.slice(0, 10)), ['2026-10-27', '2026-10-27', '2026-10-27'])
  assert.equal(week[6].tokens, 8)
  // 2026-10-31 16:00 is the current slice of the last Saturday before the week rolls into November.
  assert.equal(week[17].current, true)
  assert.deepEqual([15, 16, 17, 18, 19, 20].map(index => week[index].future), [false, false, false, true, true, true])
  assert.equal(week[12].unknown, false)
  assert.equal(week[9].unknown, true)
  assert.equal(activityCells(undefined, 'week').length, 21)
})

test('mini grid reads top to bottom first then left to right, accepts the detail-page period, opens details and reveals merged dates with keyboard navigation', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://127.0.0.1' })
  const keys = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'), { createRoot } = require('react-dom/client'), { UsageHeatmap } = createUsageHeatmapClient(require)
  const root = createRoot(document.getElementById('root')), opens = []
  const t = key => key
  const flush = action => React.act(async () => { action?.(); await Promise.resolve() })
  const render = period => root.render(React.createElement(UsageHeatmap, { t, summary, period, onOpen: () => opens.push('details') }))
  const layout = () => [...document.querySelectorAll('[role="row"]')].map(row => [...row.querySelectorAll('[role="gridcell"]')].map(cell => Number(cell.dataset.usageCell)))
  const press = key => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  try {
    await flush(() => render('today'))
    assert.equal(document.querySelectorAll('[role="row"]').length, 3)
    assert.equal(document.querySelectorAll('[role="gridcell"]').length, 24)
    assert.deepEqual(layout(), [[0, 3, 6, 9, 12, 15, 18, 21], [1, 4, 7, 10, 13, 16, 19, 22], [2, 5, 8, 11, 14, 17, 20, 23]])
    assert.deepEqual(layout().map(row => row[0]), [0, 1, 2])
    await flush(() => document.querySelector('[data-usage-cell="0"]').focus())
    await flush(() => press('ArrowDown'))
    assert.equal(document.activeElement.dataset.usageCell, '1')
    await flush(() => press('ArrowRight'))
    assert.equal(document.activeElement.dataset.usageCell, '4')
    await flush(() => press('End'))
    assert.equal(document.activeElement.dataset.usageCell, '23')
    await flush(() => press('Home'))
    assert.equal(document.activeElement.dataset.usageCell, '0')
    assert.equal(document.querySelector('.dsh-app-usage-period'), null)
    await flush(() => document.querySelector('[data-usage-cell="4"]').click())
    assert.deepEqual(opens, ['details'])
    await flush(() => render('month'))
    assert.equal(document.querySelectorAll('[role="gridcell"]').length, 30)
    assert.deepEqual(layout(), [[0, 3, 6, 9, 12, 15, 18, 21, 24, 27], [1, 4, 7, 10, 13, 16, 19, 22, 25, 28], [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]])
    await flush(() => document.querySelector('[data-usage-cell="29"]').focus())
    assert.match(document.querySelector('[role="tooltip"]').textContent, /2026-10-30.*33 Token.*2026-10-31.*35 Token/s)
    assert.equal(document.querySelectorAll('[role="gridcell"][tabindex="0"]').length, 1)
    await flush(() => render('week'))
    assert.equal(document.querySelectorAll('[role="row"]').length, 3)
    assert.equal(document.querySelectorAll('[role="gridcell"]').length, 21)
    assert.deepEqual(layout(), [[0, 3, 6, 9, 12, 15, 18], [1, 4, 7, 10, 13, 16, 19], [2, 5, 8, 11, 14, 17, 20]])
    assert.equal(document.querySelector('[role="grid"]').getAttribute('aria-label'), 'weekTokens')
    await flush(() => document.querySelector('[data-usage-cell="17"]').focus())
    assert.match(document.querySelector('[role="tooltip"]').textContent, /2026-10-31.*16:00–24:00/s)
    assert.equal(document.querySelectorAll('[role="gridcell"][tabindex="0"]').length, 1)
    await flush(() => render('today'))
    assert.equal(document.querySelectorAll('[role="gridcell"][tabindex="0"]').length, 1)
  } finally {
    await flush(() => root.unmount()); dom.window.close()
    for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
  }
})
