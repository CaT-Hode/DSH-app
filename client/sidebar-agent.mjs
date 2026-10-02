/** Agent navigation uses the same session-owned surfaces as the user's tabs. */
export default function createSidebarAgentClient() {
  const copy = (value, address) => { try { return typeof value === 'function' ? value(address) : value } catch { return undefined } }
  const pathFromAddress = address => {
    if (!address?.startsWith('dsh-resource://file/session/')) return undefined
    try { return address.slice('dsh-resource://file/session/'.length).split('/').slice(1).map(decodeURIComponent).join('/') } catch { return undefined }
  }
  const normalizePath = path => {
    const source = String(path ?? '').replace(/\\/g, '/')
    const prefix = source.startsWith('//') ? '//' : source.startsWith('/') ? '/' : ''
    const parts = []
    for (const part of source.slice(prefix.length).split('/')) {
      if (!part || part === '.') continue
      if (part === '..' && parts.length && parts.at(-1) !== '..' && !/^[a-z]:$/i.test(parts.at(-1))) parts.pop()
      else if (part !== '..' || !prefix) parts.push(part)
    }
    const value = prefix + parts.join('/')
    return /^[a-z]:\//i.test(value) || value.startsWith('//') ? value.toLowerCase() : value
  }
  const absolutePath = (path, cwd) => path === undefined ? undefined : /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path) || !cwd ? path : `${cwd.replace(/[\\/]+$/, '')}/${path}`
  function matchesTarget(tab, target, cwd) {
    if (target.type === 'file' || target.type === 'folder') return (tab.type === 'editor' || Boolean(pathFromAddress(tab.address))) && [tab.path, absolutePath(pathFromAddress(tab.address), cwd)].some(path => normalizePath(path) === normalizePath(target.path))
    if (target.type === 'url') return tab.type === 'browser' && tab.url === target.url
    if (target.type === 'resource') return tab.address === target.address
    const kind = ({ files: 'editor', changes: 'git', tasks: 'subagent' })[target.kind] ?? target.kind
    return (tab.type === kind || kind === 'editor' && tab.type === 'files') && (!target.threadId || tab.threadId === target.threadId)
  }
  function snapshot(ctx, resources, sessionId) {
    const column = ctx.get('sidebarRight')
    const registry = ctx.get('sidebarRightTabs')
    const service = resources.service
    const activeId = column?.mounted?.getSnapshot() === sessionId ? column.active()?.id : undefined
    const native = (column?.tabsIn(sessionId) ?? []).map(tab => {
      let params = {}
      try { params = column.tabDomain.occurrence(sessionId, tab).navigation.getSnapshot().params ?? {} } catch {}
      const record = resources.nativeRecords?.get(tab.id, sessionId)
      const live = record?.tab ?? resources.nativeRecords?.readPersistent?.(tab.id, sessionId, tab.contentId, tab.kind)
      const meta = live?.meta ?? params.meta ?? {}
      const cwd = record?.scope?.cwd ?? ctx.sessions?.list?.getSnapshot()?.byId?.[sessionId]?.cwd
      const path = absolutePath(live?.path ?? params.path ?? pathFromAddress(tab.contentId), cwd)
      const url = live?.meta?.url ?? params.url
      return { id: tab.id, title: live?.title ?? params.title ?? tab.title, type: tab.kind, placement: 'right', active: tab.id === activeId,
        address: tab.contentId, ...(path ? { path } : {}), ...(url ? { url } : {}),
        ...(tab.kind === 'sidechat' ? { threadId: meta.threadId,
          draftPending: Boolean(meta.draftPending || meta.draft), contextPending: Boolean(meta.contextPending || meta.context) } : {}) }
    })
    const available = new Map((registry?.guide?.() ?? []).map(tab => [tab.kind, { kind: tab.kind, title: copy(tab.title) ?? tab.kind, enabled: true, placements: ['right'] }]))
    for (const tab of service.getTabs().filter(tab => !tab.hidden)) available.set(tab.id, { kind: tab.id, title: copy(tab.title), enabled: service.isTabEnabled(tab.id), placements: ['right'] })
    return { tabs: native, rightOpen: column?.mounted?.getSnapshot() === sessionId && column.isExpanded(), availableTabs: [...available.values()] }
  }
  function applyCommand(ctx, resources, sessionId, command) {
    if (command.sessionId !== sessionId || ctx.get('sidebarRight')?.mounted?.getSnapshot() !== sessionId) throw new Error('This chat is no longer on screen; reconnect its sidebar to apply the command.')
    if (resources.store.getSnapshot().sessionId !== sessionId) throw new Error('This chat is still restoring its workbench. Retry once its sidebar is connected.')
    if (resources.store.getPrefs().agentOpenTools !== true) throw new Error('Agent sidebar control is disabled in General settings.')
    if (resources.store.getSuspended()) throw new Error('The workbench is suspended in General settings.')
    const column = ctx.get('sidebarRight')
    const service = resources.service
    const cwd = ctx.sessions?.list?.getSnapshot()?.byId?.[sessionId]?.cwd
    const scope = { sessionId, cwd }
    const before = snapshot(ctx, resources, sessionId)
    if (command.action === 'visibility') {
      if (command.placement === 'right') { if (column.isExpanded() !== command.visible) column.toggleExpanded() }
      else throw new Error('The workbench is available in the right sidebar only.')
      return
    }
    if (command.action === 'close' || command.action === 'activate') {
      const tab = before.tabs.find(tab => tab.id === command.tabId)
      if (!tab) throw new Error('The requested tab is no longer open. Read sidebar_get_tabs again.')
      if (tab.placement === 'right') {
        if (command.action === 'close') column.close(tab.id)
        else { column.focus(tab.id); if (!column.isExpanded()) column.toggleExpanded() }
      }
      if (command.action === 'close' && snapshot(ctx, resources, sessionId).tabs.some(row => row.id === tab.id)) throw new Error('This tab is protected by the sidebar. Hide the panel instead.')
      return tab.id
    }
    if (command.action !== 'open' || !command.target) throw new Error('Unknown sidebar command.')
    const target = command.target
    const placement = command.placement ?? 'right'
    if (placement !== 'right') throw new Error('The workbench is available in the right sidebar only.')
    const seed = { title: target.title }
    if (target.type === 'file' || target.type === 'folder') {
      if (!service.isTabEnabled('editor')) throw new Error('The file viewer is disabled in General settings.')
      service.openTab({ ...seed, type: 'editor', id: `editor:${target.path}`, path: target.path, line: target.line,
        ...(target.type === 'folder' ? { meta: { dir: true } } : {}) }, scope)
    } else if (target.type === 'url') {
      if (!ctx.get('sidebarRightTabs')?.get('browser')) throw new Error('A browser preview is not available.')
      column.openTab('browser', { params: { url: target.url, title: target.title } })
    } else if (target.type === 'resource') {
      column.openResource(target.address, { params: target.line ? { line: target.line } : {} })
    } else if (target.type === 'tab') {
      const aliases = { files: 'editor', changes: 'git', tasks: 'subagent' }
      const kind = aliases[target.kind] ?? target.kind
      if (service.getTab(kind)) {
        if (service.getTab(kind).hidden) throw new Error('This viewer needs a resource address or content payload. Open its file or resource instead.')
        if (!service.isTabEnabled(kind)) throw new Error('This tab type is disabled in General settings.')
        const meta = kind === 'sidechat' ? Object.fromEntries(['threadId', 'draft', 'context'].filter(key => target[key] !== undefined).map(key => [key, target[key]])) : undefined
        const existing = kind === 'sidechat' && target.threadId ? before.tabs.find(tab => tab.placement === placement && matchesTarget(tab, target, cwd)) : undefined
        if (existing) {
          let previous = resources.nativeRecords?.get(existing.id, sessionId)?.tab?.meta
          if (!previous) try { previous = column.tabDomain.occurrence(sessionId, column.tabsIn(sessionId).find(tab => tab.id === existing.id)).navigation.getSnapshot().params?.meta } catch {}
          service.updateTab(existing.id, { ...(target.title ? { title: target.title } : {}), meta: { ...previous, ...meta } }, scope)
          service.activateTab(existing.id, scope)
          if (placement === 'right' && !column.isExpanded()) column.toggleExpanded()
        } else service.openTab({ ...seed, type: kind, ...(meta ? { meta } : {}) }, scope)
      } else if (placement === 'right' && ctx.get('sidebarRightTabs')?.get(target.kind)) column.openTab(target.kind, { params: { title: target.title } })
      else throw new Error('This tab type is unavailable at that placement. Read sidebar_get_tabs for available kinds.')
    } else throw new Error('Unknown sidebar target.')
    if (command.reveal === false) {
      if (placement === 'right' && !before.rightOpen && column.isExpanded()) column.toggleExpanded()
    }
    const after = snapshot(ctx, resources, sessionId)
    const matching = after.tabs.filter(tab => tab.placement === placement && matchesTarget(tab, target, cwd))
    const opened = matching.find(tab => tab.active)
    if (!opened) throw new Error('The requested content did not open. Check its registered provider and workbench settings.')
    return opened.id
  }
  function install(ctx, resources) {
    return ctx.inject(['sidebarRight', 'sidebarRightTabs'], scope => {
      const column = scope.get('sidebarRight')
      let socket, retry, interval, disposed = false, generation = 0, failures = 0, lastSnapshot, lastSentAt = 0, sessionId
      let serial = Promise.resolve()
      const send = value => { if (socket?.readyState === 1) socket.send(JSON.stringify(value)) }
      const publish = (force = false) => {
        if (!sessionId || socket?.readyState !== 1) return
        const current = snapshot(scope, resources, sessionId)
        const serialized = JSON.stringify(current)
        if (force || lastSnapshot !== serialized || Date.now() - lastSentAt >= 15000) { lastSnapshot = serialized; lastSentAt = Date.now(); send({ type: 'snapshot', snapshot: current }) }
      }
      const connect = () => {
        if (disposed || !sessionId) return
        const token = generation
        const url = new URL('/sidebar/ws/agent-control', location.origin)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('sessionId', sessionId)
        const current = new WebSocket(url)
        socket = current
        current.onopen = () => { if (generation === token) { failures = 0; publish(true) } }
        current.onmessage = event => {
          if (generation !== token || typeof event.data !== 'string') return
          let command
          try { command = JSON.parse(event.data) } catch { return }
          if (!command || typeof command !== 'object' || command.type !== 'command' || typeof command.id !== 'string') return
          serial = serial.then(async () => {
            if (generation !== token || disposed) return
            try {
              const tabId = applyCommand(scope, resources, sessionId, command)
              // Let slot owners commit their navigation before acknowledging the result.
              await new Promise(resolve => setTimeout(resolve, 40))
              if (generation !== token || disposed) return
              const committed = snapshot(scope, resources, sessionId)
              if (command.action === 'open' && !committed.tabs.some(tab => tab.id === tabId && tab.active && matchesTarget(tab, command.target, scope.sessions?.list?.getSnapshot()?.byId?.[sessionId]?.cwd))) throw new Error('The requested view did not finish opening. Read sidebar_get_tabs and retry.')
              send({ type: 'result', id: command.id, ok: true, ...(tabId ? { tabId } : {}), snapshot: committed })
              publish()
            } catch (error) { send({ type: 'result', id: command.id, ok: false, error: error.message, snapshot: snapshot(scope, resources, sessionId) }) }
          }).catch(error => console.error('[dsh-app] sidebar command failed', error))
        }
        current.onclose = () => {
          if (disposed || generation !== token || ++failures > 5) return
          retry = setTimeout(connect, Math.min(8000, 500 * 2 ** (failures - 1)))
        }
      }
      const syncSession = () => {
        const next = column.mounted.getSnapshot()
        if (sessionId === next) return
        generation++; clearTimeout(retry); socket?.close(); socket = undefined; lastSnapshot = undefined
        sessionId = next; resources.store.setSession(next); failures = 0; connect()
      }
      const offSession = column.mounted.subscribe(syncSession)
      const offTabs = column.openTabs?.subscribe(() => publish())
      const offState = resources.service.subscribeState(() => publish())
      const offRegistry = resources.service.subscribe(() => publish())
      // The public native inventory reports membership, so also sample focus/visibility.
      interval = setInterval(() => publish(), 750)
      syncSession()
      scope.effect(() => () => {
        disposed = true; generation++; clearTimeout(retry); clearInterval(interval); socket?.close()
        offSession(); offTabs?.(); offState(); offRegistry()
      }, 'dsh-app: agent sidebar connection')
    })
  }
  return { install, snapshot, applyCommand }
}
