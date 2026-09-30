import assert from 'node:assert/strict'
import test from 'node:test'
import { sidebarDescriptor, updateSidebarPrefs } from '../lib/sidebar/settings.mjs'

test('sidebar preference edits retain the parent settings and obey its revision', async () => {
  const descriptor = { ns: 'dsh-app-host', revision: 'r1', value: { sidebar: { tasksViewMode: 'graph', tabsEnabled: { git: false } }, balance: { enabled: true } }, user: { sidebar: { tasksViewMode: 'tree' }, balance: { enabled: true } } }
  const projected = sidebarDescriptor(descriptor)
  assert.deepEqual(projected.value, descriptor.value.sidebar)
  assert.deepEqual(projected.user, descriptor.user.sidebar)
  assert.equal(projected.revision, 'r1')
  assert.equal(sidebarDescriptor(undefined), undefined)
  assert.equal(sidebarDescriptor({ ns: 'dsh-app-host', value: {} }).value, undefined)
  const updates = []
  const settings = { describe: () => [descriptor], update: async (...args) => updates.push(args) }
  await updateSidebarPrefs(settings, 'dsh-app-host', { tasksViewMode: 'tree' }, 'r1')
  assert.deepEqual(updates, [['dsh-app-host', { sidebar: { tasksViewMode: 'tree', tabsEnabled: { git: false } } }, 'r1']])
  assert.deepEqual(descriptor.value.balance, { enabled: true })
  assert.equal(descriptor.value.sidebar.tasksViewMode, 'graph', 'the accepted settings object is not mutated')
  const conflict = new Error('revision conflict')
  settings.update = async () => { throw conflict }
  await assert.rejects(updateSidebarPrefs(settings, 'dsh-app-host', { editorExplorer: true }, 'stale'), error => error === conflict)
})
