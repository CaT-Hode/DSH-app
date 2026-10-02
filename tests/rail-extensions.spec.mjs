import assert from 'node:assert/strict'
import test from 'node:test'
import { createRailExtensionCatalog, groupRailExtensions } from '../client/rail-extensions.mjs'

test('plugin settings launcher follows registration, translations and unloading without moving shipped settings', () => {
  const store = createRailExtensionCatalog()
  let notifications = 0, label = 'Notes'
  const stop = store.subscribe(() => notifications++)
  const native = ['general', 'account', 'models', 'plugins', 'agent-presets', 'skills'].map(id => ({ options: { id, label: id } }))
  const notes = { options: { id: 'notes', label: () => label, order: 20 } }
  const status = { options: { id: 'session-status', label: 'Status', order: 30 } }
  store.sync([...native, status, notes])
  assert.deepEqual(store.getSnapshot().rows.map(row => row.id), ['notes', 'session-status'])
  assert.equal(store.select('notes'), 'notes')
  label = '便签'
  store.sync([...native, notes, status])
  assert.equal(store.getSnapshot().selected, 'notes')
  assert.equal(store.getSnapshot().rows[0].label, '便签')
  store.sync([...native, status])
  assert.equal(store.getSnapshot().selected, null, 'unloaded plugin cannot remain selected')
  assert.equal(store.select('notes'), null, 'stale menu selection cannot reopen an unloaded section')
  assert.equal(store.select('models'), null, 'shipped settings do not become extension pages')
  stop()
  const previous = notifications
  store.sync(native)
  assert.equal(notifications, previous)
})

test('plugin settings belong to native registrants across unrelated ids and labels', () => {
  const panels = [{ id: 'board', label: 'Smart Notes', registrant: 'notes/client' }, { id: 'notes-tools', label: 'Notes', registrant: 'other/client' }]
  const sections = [{ id: 'preferences', label: '便签', registrant: 'notes/client' }, { id: 'connection', label: 'JIRA 配置', registrant: 'jira/client' }, { id: 'notes', label: 'Same label', registrant: 'other/client' }]
  const rows = groupRailExtensions(panels, sections)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map(row => row.settings.map(section => section.id)), [['preferences'], ['notes'], ['connection']])
  assert.equal(rows[2].panelId, null, 'settings-only plugin stays reachable')
  assert.equal(rows[2].showSettings, false, 'a single settings page needs no duplicate gear action')
  assert.equal(rows[0].showSettings, true, 'a separate panel and settings keep their gear')
  assert.equal(groupRailExtensions(panels, sections.slice(1))[0].settings.length, 0, 'unloading settings removes its gear')
  const multiple = groupRailExtensions(panels, [...sections, { id: 'backup', registrant: 'notes/client' }])
  assert.deepEqual(multiple[0].settings.map(section => section.id), ['preferences', 'backup'])
  assert.equal(groupRailExtensions([], sections)[0].showSettings, false)
  assert.equal(groupRailExtensions([], [{ id: 'one', registrant: 'p' }, { id: 'two', registrant: 'p' }])[0].showSettings, true, 'multiple settings pages remain reachable from the gear')
  assert.equal(groupRailExtensions([{ id: 'orphan' }], [{ id: 'orphan-settings' }]).length, 2, 'unknown owners must not merge')
  const catalog = createRailExtensionCatalog()
  catalog.sync([{ registrant: '@deepseek-ai/settings/client', options: { id: 'mcp' } }, { registrant: 'notes/client', options: { id: 'preferences' } }])
  assert.deepEqual(catalog.getSnapshot().rows.map(row => row.registrant), ['notes/client'])
  catalog.sync([{ registrant: 'mf', options: { id: 'general' } }, { registrant: 'mf', options: { id: 'image-settings' } }])
  assert.equal(catalog.getSnapshot().rows[0].registrant, undefined, 'a shared minified fiber name must not imply ownership')
  assert.equal(groupRailExtensions([{ id: 'tasks', registrant: 'mf' }], catalog.getSnapshot().rows).length, 2, 'unrelated settings stay reachable without a false gear')
})
