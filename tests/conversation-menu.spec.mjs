import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import createConversationMenuClient from '../client/conversation-menu.mjs'

test('Session more menu shares native view selection and keeps export, feedback, busy and error behavior', async t => {
  const dom = new JSDOM('<div id="root"></div>')
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true })
  const h = React.createElement, effects = [], subscriptions = new Map(), nativeCalls = [], subscribers = new Set()
  let snapshot = { view: null, tabs: [{ id: 'chat', label: 'Chat' }, { id: 'trajectory', label: 'Trajectory' }], bySession: {}, feedback: true }
  const useSnapshot = select => select(React.useSyncExternalStore(callback => { subscribers.add(callback); return () => subscribers.delete(callback) }, () => snapshot))
  const common = { sessionId: 's1', t: key => key, useSessionLogDownload: useSnapshot, useFeedbackAvailable: () => useSnapshot(state => state.feedback),
    request: id => nativeCalls.push(['export', id]), openFeedback: id => nativeCalls.push(['feedback', id]), dismiss: id => nativeCalls.push(['dismiss', id]) }
  const primitive = {
    Button: ({children, ...props}) => h('button', props, children),
    Menu: ({open, items, anchor, onSelect}) => h(React.Fragment, {}, anchor, open && h('div', {role:'menu'}, items.filter(row => !row.type).map(row => h('button', { key:row.id, role:'menuitem', disabled:row.disabled, onClick:() => onSelect(row.id) }, row.label)))),
    Modal: ({open, title, description, footer}) => open && h('div', {role:'dialog'}, title, description, footer),
    IconEllipsisOutlineRegular: () => '…', IconDownloadOutlineRegular: () => null, IconPaperPlaneOutlineRegular: () => null,
  }
  const headerName = 'conversation.session.header', utilityName = `${headerName}.utilities`
  const menuEntry = { options:{id:'session-log-download'}, component:() => h('button', {}, 'Native more') }
  function NativeHeader() { return h('header', {}, h(menuEntry.component, common)) }
  const headerEntry = {options:{}, component:NativeHeader}
  const registry = new Map([[headerName,[headerEntry]], [utilityName,[menuEntry]]])
  const ctx = { sessions:{list:{getSnapshot:()=>({byId:{s1:{},s2:{}}})}}, uiWorkspace:{openSession:id=>nativeCalls.push(['open',id])}, effect:fn => effects.push(fn()), slots: { entries:name => registry.get(name),
    subscribe:(name, fn) => { subscriptions.set(name,fn); return () => subscriptions.delete(name) },
    register:({name}) => { subscriptions.get(name)?.(); return () => subscriptions.get(name)?.() },
  } }
  createConversationMenuClient(id => id === 'react' ? React : primitive).install(ctx)
  const root = createRoot(document.getElementById('root'))
  const flush = fn => React.act(async () => { fn(); await Promise.resolve() })
  const selectView = id => { nativeCalls.push(['view',id]); snapshot={...snapshot,view:id}; for(const fn of subscribers)fn() }
  const render = () => root.render(h(headerEntry.component, { useConversationViews:() => useSnapshot(state=>state.tabs), useStore:useSnapshot, selectView }))
  const open = () => document.querySelector('[aria-haspopup="menu"]').click()
  const select = text => [...document.querySelectorAll('[role="menuitem"]')].find(row => row.textContent===text).click()
  t.after(async () => { await flush(() => root.unmount()); for(const off of effects.reverse())off?.(); dom.window.close(); for(const [key, descriptor] of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key] })
  await flush(render)
  await flush(open)
  assert.ok(document.querySelector('[role="menuitem"] svg'), 'chat is selected by the native fallback')
  await flush(() => select('Trajectory'))
  assert.deepEqual(nativeCalls, [['view','trajectory']])
  assert.equal(document.querySelector('[role="menu"]'),null)
  await flush(open)
  assert.ok([...document.querySelectorAll('[role="menuitem"]')].find(row=>row.textContent==='Trajectory').querySelector('svg'), 'native selection is reflected when reopening')
  await flush(() => select('menu.feedback'))
  await flush(open)
  await flush(() => select('menu.download'))
  assert.deepEqual(nativeCalls.slice(-2),[['feedback','s1'],['export','s1']])
  await flush(() => { snapshot={...snapshot,bySession:{s1:{open:true,status:'downloading'}}}; for(const fn of subscribers)fn() })
  assert.match(document.querySelector('[role="dialog"]').textContent,/dialog.preparingTitle/)
  await flush(open)
  assert.equal([...document.querySelectorAll('[role="menuitem"]')].find(row=>row.textContent==='menu.download').disabled,true)
  await flush(() => { snapshot={...snapshot,feedback:false,bySession:{s1:{open:true,status:'error',error:'Export failed'}}}; for(const fn of subscribers)fn() })
  assert.equal([...document.querySelectorAll('[role="menuitem"]')].some(row=>row.textContent==='menu.feedback'),false)
  assert.match(document.querySelector('[role="dialog"]').textContent,/Export failed/)
  await flush(() => document.querySelector('[role="dialog"] button').click())
  assert.deepEqual(nativeCalls.at(-1),['dismiss','s1'])
  await flush(() => {
    window.dispatchEvent(new window.CustomEvent('dsh-app:conversation-view-select',{detail:{view:'chat'}}))
    window.dispatchEvent(new window.CustomEvent('dsh-app:conversation-view-select',{detail:{view:'unknown'}}))
    window.dispatchEvent(new window.CustomEvent('dsh-app:conversation-session-open',{detail:{sessionId:'s2'}}))
    window.dispatchEvent(new window.CustomEvent('dsh-app:conversation-session-open',{detail:{sessionId:'unknown'}}))
  })
  assert.deepEqual(nativeCalls.slice(-2),[['view','chat'],['open','s2']], 'desktop actions share native view and Session navigation, rejecting stale identifiers')
  await flush(() => { for(const off of effects.splice(0).reverse())off(); render() })
  assert.equal(headerEntry.component,NativeHeader)
  assert.match(document.querySelector('header').textContent,/Native more/)
  assert.equal(subscriptions.size,0)
})
