/** A single sidebar information view, backed by native stores and menu owners. */
export default function createSidebarInformationClient(require) {
  const { createElement: h, useCallback, useEffect, useState, useSyncExternalStore } = require('react')
  const { createPortal } = require('react-dom')
  const targets = new Map(), docks = new Map(), listeners = new Set(), decorated = new Map()
  const notify = () => { for (const listener of listeners) listener() }
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
  const targetFor = sessionId => [...(targets.get(sessionId)?.values() ?? [])].at(-1) ?? docks.get(sessionId) ?? null
  const NS = 'dshAppSidebarInformation'
  const dictionaries = {
    zh: { agents: '子 Agent', none: '暂无子 Agent', count: '{count} 个任务', running: '{count} 个运行中', team: '智能体团队', noTeam: '未组建', members: '{count} 位成员', mode: '模式', jobs: '后台任务', loading: '正在读取', failed: '读取失败' },
    en: { agents: 'Agents', none: 'No agents yet', count: '{count} tasks', running: '{count} running', team: 'Agent team', noTeam: 'Not created', members: '{count} members', mode: 'Mode', jobs: 'Background tasks', loading: 'Loading', failed: 'Unable to load' },
  }
  function Glyph({ kind }) {
    const paths = {
      agents: 'M9 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2',
      team: 'M8 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6M2 21v-1a6 6 0 0 1 12 0v1M17 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6m-1 9a5 5 0 0 1 6 5v1',
      mode: 'M5 6h14M5 12h14M5 18h14M9 4v4m6 2v4m-7 2v4',
      jobs: 'M4 5h16v15H4zM8 10l3 3-3 3m5 0h3',
    }
    return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[kind] }))
  }
  function Row({ kind, label, value, running, interactive, hidden, children }) {
    return h('div', { className: 'dsh-app-information-row', 'data-dsh-app-information-row': kind, 'data-running': running || undefined, hidden },
      h('div', { className: 'dsh-app-information-presentation', 'aria-hidden': interactive || undefined },
        h(Glyph, { kind }), h('span', { className: 'dsh-app-information-label' }, label),
        h('span', { className: 'dsh-app-information-value', title: value }, value),
        interactive && h('svg', { className: 'dsh-app-information-chevron', width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('path', { d: 'm9 5 7 7-7 7' }))),
      children && h('div', { className: 'dsh-app-information-control' }, children))
  }
  function Agents({ native, props, t }) {
    const projection = props.useSessions(state => state.projectionsBySession[props.sessionId])
    const child = props.useSessions(state => state.byId[props.sessionId]?.origin === 'subagent')
    const summaries = props.useSessions(state => state.byId)
    const statuses = props.useSessionStatus(value => value)
    if (child) return null // Child navigation belongs to the native lineage switcher.
    const entries = projection?.values.subagentCatalog ?? []
    const running = entries.filter(row => (statuses.get(row.id)?.running ?? summaries[row.id]?.running) === true).length
    const value = projection?.state === 'error' ? t('failed') : projection?.state !== 'idle' || projection?.values.subagentCatalog === undefined ? t('loading') : running ? t('running', { count: running }) : entries.length ? t('count', { count: entries.length }) : t('none')
    return h(Row, { kind: 'agents', label: t('agents'), value, running: running > 0, interactive: entries.length > 0 || projection?.state === 'error' }, h(native, props))
  }
  function Team({ native, props, t }) {
    const parent = props.useSession(snapshot => snapshot.subagent?.address.parentSessionId) ?? props.sessionId
    const team = props.useSessions(state => state.projectionsBySession[parent]?.values.agentTeam)
    return h(Row, { kind: 'team', label: t('team'), value: team ? t('members', { count: team.members.length }) : t('noTeam'), interactive: true }, h(native, props))
  }
  function Preset({ props, t }) {
    const id = props.useSessions(state => state.byId[props.sessionId]?.projectionValues?.agentPreset)
    const options = props.useAgentPresets(state => state.options)
    useEffect(() => { if (typeof id === 'string') props.load() }, [id, props.load])
    if (typeof id !== 'string') return null
    const option = options.find(row => row.id === id)
    const builtIn = { standard: 'presetStandardName', ptc: 'presetPtcName', minimal: 'presetMinimalName', cordis: 'presetCordisName' }
    const value = option?.name ?? (builtIn[id] ? props.t(builtIn[id]) : id)
    return h(Row, { kind: 'mode', label: t('mode'), value })
  }
  function Jobs({ native, props, t }) {
    const rows = props.useJobs(state => state.rows[props.sessionId]) ?? []
    const running = rows.filter(row => row.status === 'running' || row.status === 'stopping').length
    // Keep the native watcher mounted even while the roster is empty. It owns
    // observation, retained output, keyboard navigation and two-press stopping.
    return h(Row, { kind: 'jobs', label: t('jobs'), value: t(running ? 'running' : 'count', { count: running || rows.length }), running: running > 0, interactive: true, hidden: rows.length === 0 }, h(native, props))
  }
  const presentations = { 'subagent-catalog': Agents, 'agent-team': Team, 'agent-preset': Preset, 'job-list': Jobs }
  function Information({ sessionId, visible = true }) {
    const [node, setNode] = useState(null)
    useEffect(() => {
      if (!node || !visible) return
      let seats = targets.get(sessionId)
      if (!seats) targets.set(sessionId, seats = new Map())
      const key = Symbol()
      seats.set(key, node); notify()
      return () => { seats.delete(key); if (!seats.size) targets.delete(sessionId); notify() }
    }, [node, sessionId, visible])
    return h('div', { ref: setNode, className: 'dsh-app-session-information', 'data-dsh-app-session-information': '', 'aria-label': 'Session information' })
  }
  function install(ctx) {
    ctx.effect(() => ctx.locale?.register(NS, dictionaries) ?? (() => {}), 'dsh-app: sidebar information dictionaries')
    // Native tabs expose their Session and panel boundary. Keep information
    // available below every viewer; the start page can use its inline seat.
    ctx.effect(() => {
      if (typeof document === 'undefined') return () => {}
      const view = document.defaultView, owned = new Map()
      let pending, disposed = false
      const sync = () => {
        pending = undefined
        const next = new Map()
        for (const panel of document.querySelectorAll('[data-sidebar-right-panel]')) {
          let node = owned.get(panel)
          if (!node) {
            node = document.createElement('div')
            node.className = 'dsh-app-session-information dsh-app-session-information-dock'
            node.dataset.dshAppSessionInformation = ''
            node.dataset.dshAppSessionInformationDock = ''
            panel.append(node); owned.set(panel, node)
          }
          const sessionId = panel.closest('[data-sidebar-right-session]')?.getAttribute('data-sidebar-right-session')
          if (sessionId && !panel.closest('[hidden]') && panel.hasAttribute('data-sidebar-right-open')) next.set(sessionId, node)
        }
        for (const [panel, node] of owned) if (!panel.isConnected) { node.remove(); owned.delete(panel) }
        const changed = next.size !== docks.size || [...next].some(([id, node]) => docks.get(id) !== node)
        if (changed) { docks.clear(); for (const [id, node] of next) docks.set(id, node); notify() }
      }
      const observer = new view.MutationObserver(records => {
        const relevant = records.some(row => row.type === 'attributes' ? row.target.matches('[data-sidebar-right-session], [data-sidebar-right-panel]') : [...row.addedNodes, ...row.removedNodes].some(node => node.nodeType === 1 && (node.matches('[data-sidebar-right-session], [data-sidebar-right-panel]') || node.querySelector('[data-sidebar-right-panel]'))))
        if (relevant && pending === undefined && !disposed) pending = view.requestAnimationFrame(sync)
      })
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-sidebar-right-open'] })
      sync()
      return () => { disposed = true; observer.disconnect(); if (pending !== undefined) view.cancelAnimationFrame(pending); docks.clear(); notify(); for (const node of owned.values()) node.remove(); owned.clear() }
    }, 'dsh-app: information footer on native viewers')
    ctx.effect(() => {
      const slot = 'conversation.session.header.actions'
      let disposed = false, publishing = false
      const publish = () => {
        publishing = true
        try { ctx.slots.register({ name: slot, id: 'dsh-app:information-refresh', priority: 999 }, () => null)() }
        finally { publishing = false }
      }
      const restore = entry => {
        const record = decorated.get(entry)
        if (record && entry.component === record.wrapper) entry.component = record.original
        decorated.delete(entry)
      }
      const sync = () => {
        if (disposed || publishing) return
        const entries = ctx.slots.entries(slot)
        for (const entry of decorated.keys()) if (!entries.includes(entry)) restore(entry)
        let changed = false
        for (const entry of entries) {
          if (entry.options.id === 'dsh-app:information-refresh' || decorated.has(entry)) continue
          const original = entry.component
          const Presentation = presentations[entry.options.id]
          function InSidebar(props) {
            const target = useSyncExternalStore(subscribe, useCallback(() => targetFor(props.sessionId), [props.sessionId]))
            return target ? createPortal(h('div', { 'data-dsh-app-session-information-item': entry.options.id ?? '' },
              Presentation ? h(Presentation, { native: original, props, t: ctx.locale.bind(NS) }) : h(original, props)), target) : null
          }
          entry.component = InSidebar
          decorated.set(entry, { original, wrapper: InSidebar }); changed = true
        }
        if (changed) publish()
      }
      const stop = ctx.slots.subscribe(slot, sync)
      sync()
      return () => {
        disposed = true; stop()
        for (const entry of [...decorated.keys()]) restore(entry)
        if (ctx.slots.entries(slot).length) publish()
        targets.clear(); notify()
      }
    }, 'dsh-app: native session information in workbench')
  }
  return { install, Information }
}
