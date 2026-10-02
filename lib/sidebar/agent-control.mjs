/** Agent navigation into the calling conversation's right sidebar.
 * Commands use an authenticated, session-bound socket. The browser reports the
 * real tab inventory and acknowledges changes; a send alone is never an apply.
 */
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve, win32 } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'

export const SIDEBAR_AGENT_PATH = '/sidebar/ws/agent-control'
const MAX_FRAME_BYTES = 131072
const TAB_ALIASES = { files: 'editor', changes: 'git', tasks: 'subagent' }
const tabKindOf = value => Object.hasOwn(TAB_ALIASES, value) ? TAB_ALIASES[value] : value
const boundedString = (value, limit = 4096) => typeof value === 'string' && value.length > 0 && value.length <= limit && !value.includes('\0') ? value : undefined
const placementOf = value => {
  if (value !== undefined && value !== 'right') throw new Error('Only the right sidebar is supported; the bottom panel has been removed')
  return 'right'
}
const cloned = value => JSON.parse(JSON.stringify(value))

/** Rich references keep their identity while plain-text context remains compatible. */
function sidechatContextOf(value) {
  if (typeof value === 'string') {
    if (value.includes('\0') || Buffer.byteLength(value, 'utf8') > 32768) throw new Error('context must contain at most 32 KiB of text')
    return value.trim() ? value : undefined
  }
  if (!Array.isArray(value) || value.length > 20) throw new Error('context must be text or at most 20 reference objects')
  const references = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !boundedString(item.title, 160)?.trim() || typeof item.text !== 'string' || !item.text.trim() || item.text.includes('\0')) throw new Error('Each context reference requires a title of at most 160 characters and nonempty text')
    if (item.source !== undefined && !boundedString(item.source, 4096)) throw new Error('Context reference source must be nonempty text of at most 4096 characters')
    return { title: item.title, text: item.text, ...(item.source === undefined ? {} : { source: item.source }) }
  })
  if (Buffer.byteLength(JSON.stringify(references), 'utf8') > 32768) throw new Error('context references must contain at most 32 KiB in total')
  return references.length ? references : undefined
}

/** Accept only navigation metadata, never browser-supplied content or sessions. */
export function sanitizeSidebarSnapshot(value) {
  if (value === null || typeof value !== 'object' || !Array.isArray(value.tabs)) throw new Error('Invalid sidebar snapshot')
  const tabs = [], seen = new Set()
  for (const row of value.tabs.slice(0, 256)) {
    if (!row || typeof row !== 'object' || row.placement === 'bottom') continue
    const id = boundedString(row.id), type = boundedString(row.type, 256)
    if (!id || !type || seen.has(id)) continue
    seen.add(id)
    const tab = { id, type, title: boundedString(row.title, 512) ?? type, placement: placementOf(row.placement), active: row.active === true }
    for (const key of ['path', 'url', 'address']) if (boundedString(row[key])) tab[key] = row[key]
    if (type === 'sidechat') {
      if (boundedString(row.threadId, 256)) tab.threadId = row.threadId
      if (typeof row.draftPending === 'boolean') tab.draftPending = row.draftPending
      if (typeof row.contextPending === 'boolean') tab.contextPending = row.contextPending
    }
    tabs.push(tab)
  }
  const availableTabs = [], kinds = new Set()
  for (const row of (Array.isArray(value.availableTabs) ? value.availableTabs : []).slice(0, 128)) {
    const kind = boundedString(row?.kind, 256)
    if (!kind || kinds.has(kind)) continue
    if (Array.isArray(row.placements) && !row.placements.includes('right')) continue
    kinds.add(kind)
    availableTabs.push({ kind, title: boundedString(row.title, 512) ?? kind, enabled: row.enabled !== false, placements: ['right'] })
  }
  return { tabs, availableTabs, rightOpen: value.rightOpen === true }
}

/** Bounded transient commands and actual browser snapshots, owned by session. */
export class SidebarAgentRegistry {
  constructor({ acknowledgementMs = 2500, retentionMs = 900000, maxSessions = 128, maxCommands = 32, maxViews = 8, now = Date.now } = {}) {
    this.acknowledgementMs = acknowledgementMs
    this.retentionMs = retentionMs
    this.maxSessions = maxSessions
    this.maxCommands = maxCommands
    this.maxViews = maxViews
    this.now = now
    this.sessions = new Map()
    this.closed = false
  }

  entry(sessionId) {
    if (this.closed) throw new Error('Sidebar agent control is disposed')
    this.prune()
    let state = this.sessions.get(sessionId)
    if (!state) {
      if (this.sessions.size >= this.maxSessions) throw new Error('Sidebar agent session limit reached')
      state = { views: new Set(), commands: new Map(), snapshot: null, updatedAt: null, touchedAt: this.now() }
      this.sessions.set(sessionId, state)
    }
    state.touchedAt = this.now()
    return state
  }

  prune() {
    const cutoff = this.now() - this.retentionMs
    for (const [sessionId, state] of this.sessions) {
      for (const [id, record] of state.commands) if (record.createdAt < cutoff) {
        record.finish?.({ id, status: record.sent ? 'requested' : 'queued', delivered: record.sent, acknowledged: false })
        state.commands.delete(id)
      }
      if (state.views.size === 0 && state.commands.size === 0 && state.touchedAt < cutoff) this.sessions.delete(sessionId)
    }
  }

  snapshot(sessionId) {
    const state = this.entry(sessionId)
    return cloned({ connected: state.views.size > 0, fresh: state.views.has(state.snapshotOwner) && state.updatedAt !== null && this.now() - state.updatedAt < 30000,
      updatedAt: state.updatedAt, snapshot: state.snapshot, queuedCommands: [...state.commands.values()].filter(record => !record.sent).length })
  }

  attach(sessionId, send, close = () => {}) {
    const state = this.entry(sessionId), view = { send, close }
    if (state.views.size >= this.maxViews) throw new Error('Sidebar view limit reached')
    state.views.add(view)
    for (const record of [...state.commands.values()]) if (!record.sent) this.send(state, record)
    let detached = false
    return {
      receive: frame => {
        if (detached || !frame || typeof frame !== 'object') return
        if (frame.type === 'snapshot') {
          state.snapshot = sanitizeSidebarSnapshot(frame.snapshot)
          state.updatedAt = this.now()
          state.snapshotOwner = view
          state.touchedAt = this.now()
          // The most recently reporting view is the inventory and command owner.
          state.views.delete(view); state.views.add(view)
        } else if (frame.type === 'result' && typeof frame.id === 'string') {
          const record = state.commands.get(frame.id)
          if (!record || record.owner !== view || typeof frame.ok !== 'boolean') return
          if (frame.snapshot !== undefined) {
            state.snapshot = sanitizeSidebarSnapshot(frame.snapshot)
            state.updatedAt = this.now()
            state.snapshotOwner = view
            state.views.delete(view); state.views.add(view)
          }
          state.commands.delete(frame.id)
          if (!frame.ok) record.finish?.(undefined, new Error(boundedString(frame.error, 1024) ?? 'Sidebar command failed'))
          else record.finish?.({ id: frame.id, status: 'applied', delivered: true, acknowledged: true, ...(boundedString(frame.tabId) ? { tabId: frame.tabId } : {}) })
        }
      },
      detach: () => {
        if (detached) return
        detached = true
        state.views.delete(view)
        for (const record of state.commands.values()) if (record.owner === view) {
          record.finish?.({ id: record.command.id, status: 'requested', delivered: true, acknowledged: false })
        }
      },
    }
  }

  send(state, record) {
    for (const view of [...state.views].reverse()) {
      try {
        // Assign ownership before send: synchronous fixtures may acknowledge.
        record.owner = view
        record.sent = true
        if (view.send(cloned(record.command)) === false) throw new Error('Sidebar view disconnected')
        return true
      } catch {
        record.owner = undefined
        record.sent = false
        state.views.delete(view)
      }
    }
    return false
  }

  async dispatch(sessionId, command, signal) {
    signal?.throwIfAborted()
    const state = this.entry(sessionId)
    if (state.commands.size >= this.maxCommands) throw new Error('Too many pending sidebar commands; open the conversation to apply queued changes')
    const id = randomUUID(), record = { command: { ...command, type: 'command', id, sessionId }, sent: false, createdAt: this.now() }
    state.commands.set(id, record)
    if (state.views.size === 0) return { id, status: 'queued', delivered: false, acknowledged: false }
    return new Promise((settle, reject) => {
      let timer
      const abort = () => { state.commands.delete(id); record.finish(undefined, signal.reason ?? new Error('Sidebar command aborted')) }
      record.finish = (value, error) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        record.finish = undefined
        if (error) reject(error); else settle(value)
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) { abort(); return }
      if (!this.send(state, record)) { record.finish({ id, status: 'queued', delivered: false, acknowledged: false }); return }
      if (record.finish) timer = setTimeout(() => record.finish?.({ id, status: 'requested', delivered: true, acknowledged: false }), this.acknowledgementMs)
    })
  }

  clearCommands(reason = 'Sidebar agent control was disabled') {
    for (const state of this.sessions.values()) {
      for (const record of state.commands.values()) record.finish?.(undefined, new Error(reason))
      state.commands.clear()
    }
  }

  forget(sessionId) {
    const state = this.sessions.get(sessionId)
    if (!state) return
    for (const record of state.commands.values()) record.finish?.(undefined, new Error('Conversation is no longer available'))
    for (const view of state.views) try { view.close() } catch {}
    this.sessions.delete(sessionId)
  }

  dispose() {
    for (const sessionId of this.sessions.keys()) this.forget(sessionId)
    this.closed = true
  }
}

/** Authoritative session cwd; unknown conversations never inherit Host cwd. */
export async function sidebarSessionCwd(ctx, sessionId, callingSession) {
  const session = ctx.sessions.get(sessionId) ?? callingSession
  let cwd = session?.header?.cwd
  if (!session) {
    const persistence = ctx.get('sessionPersistence')
    if (!persistence) throw new Error('Conversation is not available')
    const handle = await persistence.open(sessionId, 'read')
    try { cwd = handle.header?.cwd } finally { await handle.close() }
  }
  if (!boundedString(cwd) || !isAbsolute(cwd)) throw new Error('Conversation has no valid working directory')
  return resolve(cwd)
}

function initiatingSession(exec) {
  exec.signal.throwIfAborted()
  const session = exec.agent?.session
  if (!boundedString(session?.id)) throw new Error('Sidebar tools require an initiating conversation agent')
  return session
}

/** Existing side conversations are identified by durable lineage and provider. */
export async function validateSidebarSidechatTarget(ctx, sessionId, target, signal) {
  if (target.type !== 'tab' || target.kind !== 'sidechat' || target.threadId === undefined) return
  signal?.throwIfAborted()
  const session = ctx.sessions.get(target.threadId) ?? ctx.get('agents')?.get(target.threadId)?.session
  let header, events
  if (session) {
    header = session.header
    if (header?.parentSession !== sessionId || header.origin !== 'subagent') throw new Error('Side conversation does not belong to the calling conversation')
    events = session.snapshotEvents()
  }
  else {
    const persistence = ctx.get('sessionPersistence')
    if (!persistence) throw new Error('Side conversation is not available')
    const handle = await persistence.open(target.threadId, 'read')
    try {
      header = handle.header
      if (header?.parentSession !== sessionId || header.origin !== 'subagent') throw new Error('Side conversation does not belong to the calling conversation')
      events = (await handle.read()).events
    } finally { await handle.close() }
  }
  signal?.throwIfAborted()
  if (header?.parentSession !== sessionId || header.origin !== 'subagent' || !Array.isArray(events) || foldSubagentDescriptor(events)?.provider !== 'sidechat') throw new Error('Side conversation does not belong to the calling conversation')
}

/** Same lexical local-path scope as existing sidebar reads, with stat checks. */
export async function resolveSidebarOpenTarget(args, sessionId, cwd) {
  const raw = boundedString(args.target)
  if (!raw) throw new Error('target must be a nonempty path, address, URL, or tab kind')
  const type = args.type ?? 'auto', title = boundedString(args.title, 512)
  const navigation = title ? { title } : {}
  if (args.line !== undefined) {
    if (!Number.isSafeInteger(args.line) || args.line < 1) throw new Error('line must be a positive integer')
    navigation.line = args.line
  }
  if (type === 'tab') {
    if (!boundedString(raw, 256)) throw new Error('Invalid sidebar tab kind')
    const kind = tabKindOf(raw), sidechat = {}
    const requested = ['threadId', 'draft', 'context'].some(key => args[key] !== undefined)
    if (requested && kind !== 'sidechat') throw new Error('threadId, draft and context apply only to the sidechat tab')
    if (args.threadId !== undefined) {
      if (!boundedString(args.threadId, 256)) throw new Error('threadId must identify an existing side conversation')
      sidechat.threadId = args.threadId
    }
    if (args.draft !== undefined) {
      const value = args.draft
      if (typeof value !== 'string' || value.includes('\0') || Buffer.byteLength(value, 'utf8') > 32768) throw new Error('draft must be text of at most 32 KiB')
      if (value.trim() !== '') sidechat.draft = value
    }
    if (args.context !== undefined) {
      const context = sidechatContextOf(args.context)
      if (context !== undefined) sidechat.context = context
    }
    return { type: 'tab', kind, ...navigation, ...sidechat }
  }
  if (['threadId', 'draft', 'context'].some(key => args[key] !== undefined)) throw new Error('threadId, draft and context apply only to the sidechat tab')
  if (type === 'url' || /^https?:\/\//i.test(raw)) {
    let url
    try { url = new URL(raw) } catch { throw new Error('target is not a valid HTTP(S) URL') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) URLs without embedded credentials can be opened')
    if (!['url', 'auto'].includes(type)) throw new Error('target does not match the requested type')
    return { type: 'url', url: url.href, title: title ?? url.hostname }
  }
  if (type === 'resource' || raw.startsWith('dsh-resource:')) {
    let url
    try { url = new URL(raw) } catch { throw new Error('Invalid DSH resource address') }
    if (url.protocol !== 'dsh-resource:' || !url.hostname || url.username || url.password) throw new Error('Only dsh-resource:// addresses can be opened as resources')
    if (!['resource', 'auto'].includes(type)) throw new Error('target does not match the requested type')
    // Parse the original encoded components, as the official file provider does.
    // URL.pathname normalizes dot segments before the session scope is checked.
    const encoded = raw.replace(/^dsh-resource:\/\/[^/]+\//i, '').split(/[?#]/, 1)[0]
    const parts = encoded.split('/').map(part => decodeURIComponent(part))
    if (parts[0] === 'session' && parts[1] !== sessionId) throw new Error('Resource belongs to another conversation')
    if (url.hostname === 'file') {
      if (!['session', 'absolute'].includes(parts[0])) throw new Error('Invalid file resource address')
      const segments = parts.slice(parts[0] === 'session' ? 2 : 1)
      if (segments.length === 0 || parts[0] === 'absolute' && segments.length === 1 && segments[0] === '') throw new Error('Invalid file resource path')
      let path = segments.join('/')
      if (parts[0] === 'absolute') {
        if (segments[0] === '') path = `/${path}`
        else if (!/^[a-z]:$/i.test(segments[0])) path = `/${path}`
      }
      else if (path === '') path = '.'
      const file = await resolveSidebarOpenTarget({ target: path, type: 'auto', ...navigation }, sessionId, cwd)
      if (!['file', 'folder'].includes(file.type)) throw new Error('Invalid file resource path')
      return file
    }
    const canonicalParts = url.pathname.slice(1).split('/').map(part => decodeURIComponent(part))
    if (canonicalParts[0] === 'session' && canonicalParts[1] !== sessionId) throw new Error('Resource belongs to another conversation')
    return { type: 'resource', address: url.href, ...navigation }
  }
  if (!['auto', 'file', 'folder'].includes(type)) throw new Error('Unknown sidebar target type')
  if (!/^[a-z]:[\\/]/i.test(raw) && /^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new Error('Unsupported target scheme')
  // Match the integrated filesystem API's WSL absolute-path semantics.
  const wsl = process.platform === 'win32' && /^\/(?!\/)/.test(raw) ? /^\\\\wsl\.localhost\\([^\\]+)(?:\\|$)/i.exec(cwd.replace(/\//g, '\\')) : null
  const path = wsl ? win32.resolve(`\\\\wsl.localhost\\${wsl[1]}`, raw.slice(1)) : resolve(cwd, raw)
  const info = await stat(path)
  const actual = info.isDirectory() ? 'folder' : info.isFile() ? 'file' : undefined
  if (!actual) throw new Error('Target must be a regular file or folder')
  if (type !== 'auto' && type !== actual) throw new Error(`Target is a ${actual}, not a ${type}`)
  return { type: actual, path, title: title ?? (basename(path) || path), ...navigation }
}

function ownerPreferences(ctx, config) {
  const entries = ctx.loader.entries()
  const owner = entries.find(row => row.fiber === ctx.fiber && row.options.name === 'dsh-app') ?? entries.find(row => row.options.name === 'dsh-app')
  return ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === owner?.options.id)?.value?.sidebar ?? config
}

const output = { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }

/** Install beside the compatibility sidebar_open tool; require browser auth. */
export function installSidebarAgentControl(ctx, config = {}, options = {}) {
  return ctx.inject(['connection', 'settings', 'loader'], scoped => {
    const registry = new SidebarAgentRegistry(options)
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })
    const prefs = () => ownerPreferences(scoped, config)
    const enabled = () => prefs()?.agentOpenTools === true
    const disposers = []
    let controls = []
    const tool = definition => scoped.tools.register(defineTool({ output, ...definition }))
    const scopedSession = async exec => {
      const session = initiatingSession(exec)
      const cwd = await sidebarSessionCwd(scoped, session.id, session)
      exec.signal.throwIfAborted()
      return { sessionId: session.id, cwd }
    }
    const dispatch = async (exec, command) => {
      if (!enabled()) throw new Error('Enable agent control of sidebar contents in General settings')
      const { sessionId } = await scopedSession(exec)
      if (!enabled()) throw new Error('Sidebar agent control was disabled')
      const response = await registry.dispatch(sessionId, command, exec.signal)
      return { ...response, ...registry.snapshot(sessionId) }
    }
    const controlDefinitions = [
      {
        name: 'sidebar_open_view',
        description: 'Open a file, folder, HTTP(S) page, DSH resource, or registered sidebar tab in the right sidebar of the CALLING conversation. Paths resolve from that conversation\'s working directory. Files use registered editor/preview providers and URLs use the browser. For type tab and target sidechat, title names the tab, threadId reopens an existing side conversation owned by this chat, and draft/context stage editable drafts and references for the user; this tool never sends a Side Chat message or starts a model turn. Use sidebar_get_tabs to discover native and contributed tab kinds. Applied means acknowledged by the visible client; requested means sent without acknowledgement; queued means disconnected until this conversation reconnects. Never accepts another conversation ID.',
        parameters: { target: { type: 'string', required: true }, type: { type: 'string', enum: ['auto', 'file', 'folder', 'url', 'resource', 'tab'] }, placement: { type: 'string', enum: ['right'], description: 'Only right is supported; the bottom panel has been removed. Omit to use right.' }, title: { type: 'string' }, line: { type: 'integer', description: 'One-based line for a file editor.' }, threadId: { type: 'string', description: 'For the sidechat tab only: existing child Side Chat ID from this conversation.' }, draft: { type: 'string', description: 'For Side Chat only: stage editable unsent text, at most 32 KiB.' }, context: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string', required: true }, text: { type: 'string', required: true }, source: { type: 'string' } } } }], description: 'For Side Chat only: stage text or up to 20 titled reference objects {title,text,source?}, at most 32 KiB total, for user review; never autosent.' } },
        async execute(args, exec) {
          if (!enabled()) throw new Error('Enable agent control of sidebar contents in General settings')
          const placement = placementOf(args.placement)
          const { sessionId, cwd } = await scopedSession(exec)
          const target = await resolveSidebarOpenTarget(args, sessionId, cwd)
          await validateSidebarSidechatTarget(scoped, sessionId, target, exec.signal)
          exec.signal.throwIfAborted()
          const key = target.type === 'url' ? 'browser' : ['file', 'folder'].includes(target.type) ? 'editor' : target.kind
          if (key && prefs()?.tabsEnabled?.[key] === false) throw new Error(`Sidebar tab ${key} is disabled`)
          if (target.type === 'tab') {
            const state = registry.snapshot(sessionId), available = state.snapshot?.availableTabs
            if (state.fresh && available?.length && !available.some(row => tabKindOf(row.kind) === key && row.enabled && row.placements.includes(placement))) throw new Error(`Sidebar tab ${key} is not registered, disabled, or unavailable at that placement`)
          }
          if (!enabled()) throw new Error('Sidebar agent control was disabled')
          const response = await registry.dispatch(sessionId, { action: 'open', target, placement, reveal: true }, exec.signal)
          return { ...response, target, placement, ...registry.snapshot(sessionId) }
        },
      },
      ...['close', 'activate'].map(action => ({
        name: `sidebar_${action}_tab`,
        description: `${action === 'close' ? 'Close' : 'Focus'} an existing right-sidebar tab in the calling conversation using an ID from sidebar_get_tabs.`,
        parameters: { tabId: { type: 'string', required: true } },
        async execute(args, exec) {
          if (!boundedString(args.tabId)) throw new Error('tabId is required')
          const { sessionId } = await scopedSession(exec), state = registry.snapshot(sessionId)
          if (state.fresh && !state.snapshot.tabs.some(row => row.id === args.tabId)) throw new Error('Tab does not belong to the calling conversation')
          return dispatch(exec, { action, tabId: args.tabId })
        },
      })),
      {
        name: 'sidebar_set_visibility', description: 'Show or hide the calling conversation\'s right sidebar without deleting its tabs.',
        parameters: { placement: { type: 'string', enum: ['right'], description: 'Only right is supported; the bottom panel has been removed. Omit to use right.' }, visible: { type: 'boolean', required: true } },
        execute: (args, exec) => dispatch(exec, { action: 'visibility', placement: placementOf(args.placement), visible: args.visible }),
      },
    ]
    const syncControls = () => {
      if (enabled() && controls.length === 0) controls = controlDefinitions.map(tool)
      else if (!enabled() && controls.length > 0) { controls.splice(0).forEach(dispose => dispose()); registry.clearCommands() }
    }
    scoped.effect(() => {
      disposers.push(tool({ name: 'sidebar_get_tabs', description: 'Read the calling conversation\'s actual right-sidebar tab inventory, visibility, available native and contributed tab kinds, and connection status. Side Chat metadata reports thread IDs and whether unsent draft/context is staged, without revealing private draft text. A disconnected snapshot is historical; null means no browser has reported state. Use these tab IDs for close or activate.', parameters: {},
        async execute(_args, exec) { const { sessionId } = await scopedSession(exec); return { controlEnabled: enabled(), ...registry.snapshot(sessionId) } } }))
      syncControls()
      disposers.push(scoped.on('settings/document-updated', syncControls))
      disposers.push(scoped.on('session/disposed', session => registry.forget(session.id)))
      return () => { controls.splice(0).forEach(dispose => dispose()); disposers.splice(0).reverse().forEach(dispose => dispose()); registry.dispose(); for (const socket of wss.clients) socket.terminate(); wss.close() }
    }, 'dsh-app: sidebar agent tools')
    scoped.effect(() => scoped.webServer.registerUpgrade({ path: SIDEBAR_AGENT_PATH, handler(req, socket, head) {
      if (scoped.connection.requestRejection(req) !== undefined) { socket.destroy(); return }
      let sessionId
      try { sessionId = boundedString(new URL(req.url ?? '/', 'http://dsh.internal').searchParams.get('sessionId'), 256) } catch {}
      if (!sessionId) { socket.destroy(); return }
      void sidebarSessionCwd(scoped, sessionId).then(() => {
        if (registry.closed || socket.destroyed) { socket.destroy(); return }
        wss.handleUpgrade(req, socket, head, ws => {
          let view
          try {
            view = registry.attach(sessionId, command => { if (ws.readyState !== WebSocket.OPEN) return false; ws.send(JSON.stringify(command)); return true }, () => ws.close(1001, 'Conversation disconnected'))
          } catch { ws.close(1013, 'Sidebar capacity reached'); return }
          ws.on('close', view.detach)
          ws.on('error', view.detach)
          ws.on('message', data => {
            if (Buffer.byteLength(data) > MAX_FRAME_BYTES) { ws.close(1009, 'Sidebar frame too large'); return }
            try { view.receive(JSON.parse(String(data))) } catch { ws.close(1008, 'Invalid sidebar frame') }
          })
        })
      }).catch(() => socket.destroy())
    } }), 'dsh-app: authenticated sidebar agent control socket')
  })
}
