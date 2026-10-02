/** Prepare only the destination of an explicit New Chat navigation. The native
 * beforeOpen hook runs before selection, including when an old blank is reused
 * without changing the current Session id. Later user and Agent opens are free
 * to expand the saved surface again.
 */
export default function createSidebarNewChatClient() {
  let generation = 0, disposed = false

  function startSession(ctx, workspaceId) {
    if (disposed) return
    const request = ++generation
    const target = newChatWorkspace(ctx, workspaceId)
    if (target === undefined) return ctx.uiWorkspace.startSession(workspaceId)
    return ctx.uiWorkspace.openWorkspace(target, sessionId => {
      if (!disposed && request === generation) collapseNewChatSidebar(ctx, sessionId)
    }).catch(reason => { console.warn('new session failed:', reason) })
  }

  return { startSession, dispose() { disposed = true; generation++ } }
}

/** Mirror the public navigation service's Workspace choice and stable ties. */
export function newChatWorkspace(ctx, workspaceId) {
  if (workspaceId !== undefined) return workspaceId
  const workspaces = ctx.workspaces?.list?.getSnapshot()
  const sessions = ctx.sessions?.list?.getSnapshot()
  if (!workspaces || !sessions) return undefined
  const current = ctx.uiSession?.adapter?.current?.getSnapshot()?.key
  const currentWorkspace = current === undefined ? undefined : workspaces.items.find(item => item.sessionIds.includes(current))?.workspaceId
  if (currentWorkspace !== undefined) return currentWorkspace
  if (workspaces.phase !== 'ready' || sessions.phase !== 'ready') return undefined
  let selected, selectedTime = Number.NEGATIVE_INFINITY
  for (const workspace of workspaces.items) {
    let latest = Number.NEGATIVE_INFINITY
    for (const id of workspace.sessionIds) {
      const session = sessions.byId[id]
      if (session !== undefined) latest = Math.max(latest, session.updatedAt)
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt)
    if (selected === undefined || latest > selectedTime) {
      selected = workspace.workspaceId
      selectedTime = latest
    }
  }
  return selected
}

export function collapseNewChatSidebar(ctx, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false
  const column = ctx.get?.('sidebarRight') ?? ctx.sidebarRight
  const actions = column?.actionsFor?.(sessionId)
  if (typeof actions?.setExpanded === 'function') {
    actions.setExpanded(sessionId, false)
    return true
  }

  // This exact shared handle is native-owned. Its factory reads and validates
  // the official persisted layout, then adopts the scoped instance. Only use
  // it before the target has an adopted store: creating a second instance for
  // an already mounted Session would replace the renderer's authority. The
  // renderer's subsequent factory call reads the collapsed persisted layout.
  const seats = ctx.slots?.entries?.('rightbar.session') ?? []
  const handle = ctx.slots?.entries?.('conversation.session.header.corner')
    ?.find(entry => entry.store && seats.some(seat => seat.store === entry.store))?.store
  if (typeof handle?.create !== 'function') return false
  const instance = handle.create(sessionId)
  if (typeof instance?.actions?.setExpanded !== 'function') return false
  instance.actions.setExpanded(sessionId, false)
  return true
}
