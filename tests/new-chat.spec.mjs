import test from 'node:test'
import assert from 'node:assert/strict'
import { welcomeProject } from '../client/new-chat.mjs'

test('welcome titles follow the current project, renamed workspaces and default or unbound conversations', () => {
  const snapshot = { items: [{ title: 'ASS', sessionIds: ['project'] }, { title: 'default-workspace', sessionIds: ['general'] }] }
  assert.equal(welcomeProject(snapshot, 'project'), 'ASS')
  assert.equal(welcomeProject(snapshot, 'general'), undefined)
  assert.equal(welcomeProject(snapshot, undefined), undefined)
  assert.equal(welcomeProject(undefined, 'project'), undefined)
  snapshot.items[0].title = 'DSH-app'
  assert.equal(welcomeProject(snapshot, 'project'), 'DSH-app')
  assert.equal(welcomeProject(snapshot, 'missing'), undefined)
})
