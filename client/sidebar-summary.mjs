/** The resting sidebar is a compact, live output and agent summary. */
export default function createSidebarSummaryClient(require) {
  const { createElement: h, useCallback, useSyncExternalStore } = require('react')
  const NS = 'dshAppSidebarSummary'
  const dictionaries = {
    zh: { output: '输出内容', empty: '文件、网页与预览会显示在这里', workbench: '工作台' },
    en: { output: 'Outputs', empty: 'Files, websites and previews appear here', workbench: 'Workbench' },
  }
  function summarize(tabs) {
    return { outputs: tabs.filter(tab => !['guide', 'launcher', 'subagent', 'subagentchat', 'jobs', 'sidechat'].includes(tab.kind)) }
  }
  function Summary({ ctx, resources, sessionId, useTabInfo }) {
    const t = ctx.locale.bind(NS)
    const column = ctx.get('sidebarRight')
    useSyncExternalStore(useCallback(callback => column.openTabs.subscribe(callback), [column]), useCallback(() => column.openTabs.getSnapshot(), [column]))
    useSyncExternalStore(useCallback(callback => resources.nativeRecords?.subscribe(callback) ?? (() => {}), [resources]), useCallback(() => column.tabsIn(sessionId).map(tab => `${tab.id}:${resources.nativeRecords?.versionOf(tab.id, sessionId) ?? 0}`).join('|'), [column, resources, sessionId]))
    const info = useTabInfo?.()
    const { outputs } = summarize(column.tabsIn(sessionId))
    return h('section', { className: 'dsh-app-sidebar-summary', 'data-dsh-app-summary': '', 'aria-label': t('workbench') },
      h('header', {}, h('span', {}, t('output'))),
      outputs.length ? h('div', { className: 'dsh-app-summary-outputs' }, outputs.map(tab => h('button', { key: tab.id, type: 'button', onClick: () => column.focus(tab.id), title: tab.title },
        h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'M14 3H5v18h14V8zM14 3v5h5' })),
        h('span', {}, resources.nativeRecords?.get(tab.id, sessionId)?.tab.title ?? tab.title))))
        : h('p', { className: 'dsh-app-summary-empty' }, t('empty')),
      resources.Information && h(resources.Information, { sessionId, visible: info?.tab.visible ?? true }))
  }
  function install(ctx, resources) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: sidebar summary dictionaries')
    ctx.inject(['sidebarRight', 'sidebarRightTabs', 'uiSession'], scope => {
      scope.effect(() => ctx.slots.inject('sidebar.right.tab.guide', () => ctx.slots.register({
        name: 'sidebar.right.tab.guide', id: 'dsh-app:sidebar-summary', priority: 100, select: () => true, registrant: 'dsh-app', inject: () => ({ ctx: scope, resources }),
      }, Summary)), 'dsh-app: resting sidebar summary')
      // Native surfaces start collapsed and restore explicit per-session choices.
      // Rendering the summary must not open an untouched conversation's sidebar.
    })
  }
  return { install, summarize }
}
