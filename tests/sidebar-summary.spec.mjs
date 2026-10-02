import test from 'node:test'
import assert from 'node:assert/strict'
import createSidebarSummaryClient from '../client/sidebar-summary.mjs'

test('resting summary only lists output viewers; task and chat navigation belong to the unified information view', () => {
  const { summarize } = createSidebarSummaryClient(() => ({}))
  const tabs = [{id:'guide',kind:'guide'}, {id:'file',kind:'editor'}, {id:'web',kind:'browser'}, {id:'chat',kind:'sidechat'}, {id:'tasks',kind:'subagent'}, {id:'chooser',kind:'launcher'}, {id:'child',kind:'subagentchat'}, {id:'jobs',kind:'jobs'}]
  const result = summarize(tabs)
  assert.deepEqual(result.outputs.map(tab=>tab.id),['file','web'])
})
