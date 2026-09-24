import assert from 'node:assert/strict'
import test from 'node:test'
import { isCurrentCoreUpdateCheck } from '../desktop/core-update-order.mjs'

test('only the latest check for the current CLI may publish after an async fetch', () => {
  assert.equal(isCurrentCoreUpdateCheck(3, '0.1.5-rc.1', 3, '0.1.5-rc.1', false), true)
  assert.equal(isCurrentCoreUpdateCheck(3, '0.1.5-rc.1', 4, '0.1.5-rc.1', false), false)
  assert.equal(isCurrentCoreUpdateCheck(3, '0.1.5-rc.1', 3, '0.1.7-rc.1', false), false)
  assert.equal(isCurrentCoreUpdateCheck(3, '0.1.5-rc.1', 3, '0.1.5-rc.1', true), false)
})
