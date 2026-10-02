/** Side Chat's owned controls retain the upstream transcript and agent protocol. */
export default function createSidebarSidechatClient(require) {
  const React = require('react')
  const { createElement: h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
  const NS = 'dshAppSidechat'
  const dictionaries = {
    zh: {
      title: 'Side Chat', untitled: '新对话', new: '新建', history: '历史', historySearch: '搜索 Side Chat', empty: '还没有 Side Chat', noMatch: '没有匹配的对话', loading: '正在读取历史…', retry: '重试', close: '关闭', rename: '重命名', name: '对话名称', save: '保存', cancel: '取消', running: '进行中', ready: '就绪', context: '引用上下文', contextHelp: '新建时继承主对话的当前上下文。主对话后续消息不会自动同步，可按需添加引用。', mainDraft: '主对话草稿', selection: '选中文本', file: '打开的文件', customContext: '补充引用或背景', attach: '添加引用', remove: '移除引用', agentContext: 'Agent 提供的上下文', contextEmpty: '主对话没有草稿或选中文本，可打开文件或补充背景。', promptContext: '以下内容是本次问题附带的参考上下文：', copy: '复制回答', copied: '回答已复制', toMain: '加入主对话草稿', added: '回答已加入主对话草稿', promote: '转为主对话', promoteHelp: '从最近一次完成的回答创建主对话', model: '继承主对话的模型与 Agent 配置', noInput: '主对话输入框暂不可用', errors: '操作失败：', pending: '草稿与引用会保留，发送后清除', transcriptError: '对话记录暂不可读', parent: '返回主对话', viewTitle: 'Side Chat 对话', historyCount: '{count} 个对话', staged: '已准备草稿，发送前可编辑',
    },
    en: {
      title: 'Side Chat', untitled: 'New chat', new: 'New', history: 'History', historySearch: 'Search Side Chats', empty: 'No Side Chats yet', noMatch: 'No matching chats', loading: 'Loading history…', retry: 'Retry', close: 'Close', rename: 'Rename', name: 'Chat name', save: 'Save', cancel: 'Cancel', running: 'Running', ready: 'Ready', context: 'Reference context', contextHelp: 'New chats inherit the current main-chat context. Later main-chat messages do not sync automatically; attach references when needed.', mainDraft: 'Main-chat draft', selection: 'Selected text', file: 'Open files', customContext: 'Add a reference or background', attach: 'Attach reference', remove: 'Remove reference', agentContext: 'Context from agent', contextEmpty: 'There is no main-chat draft or selected text. Open a file or add background.', promptContext: 'Reference context attached to this question:', copy: 'Copy answer', copied: 'Answer copied', toMain: 'Add to main-chat draft', added: 'Answer added to main-chat draft', promote: 'Continue in main chat', promoteHelp: 'Create a main chat from the latest completed answer', model: 'Uses the main chat’s model and Agent configuration', noInput: 'The main-chat composer is unavailable', errors: 'Action failed:', pending: 'Drafts and references stay until sent', transcriptError: 'The transcript could not be read', parent: 'Return to main chat', viewTitle: 'Side Chat conversation', historyCount: '{count} chats', staged: 'Draft ready to review and send',
    },
  }
  const displayTitle = (value, fallback) => value === 'Side: New thread' ? fallback : String(value ?? '').replace(/^Side: /, '') || fallback
  const bounded = text => String(text ?? '').slice(0, 32768)
  const contextSeeds = (value, title) => {
    if (typeof value === 'string') return value.trim() ? [{ title, text: bounded(value) }] : []
    if (!Array.isArray(value)) return []
    let remaining = 32768
    return value.filter(item => item && typeof item.title === 'string' && typeof item.text === 'string' && item.text.trim()).slice(0, 20).map(item => {
      const text = item.text.slice(0, Math.max(0, remaining)); remaining -= text.length
      return { title: item.title.slice(0, 160), text, ...(typeof item.source === 'string' ? { source: item.source.slice(0, 4096) } : {}) }
    }).filter(item => item.text)
  }
  const draftKey = (parentId, threadId) => `dsh-app:sidechat-draft:${parentId}:${threadId}`
  const readDraft = (parentId, threadId) => {
    if (!threadId) return undefined
    try {
      const value = JSON.parse(localStorage.getItem(draftKey(parentId, threadId)) ?? 'null')
      if (!value || typeof value.text !== 'string') return undefined
      return { text: bounded(value.text), references: contextSeeds(value.references, '') }
    } catch { return undefined }
  }
  const writeDraft = (parentId, threadId, text, references) => {
    if (!threadId) return
    try {
      const key = draftKey(parentId, threadId)
      if (!text && references.length === 0) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify({ text: bounded(text), references: contextSeeds(references, ''), updatedAt: Date.now() }))
    } catch { /* Storage quotas never block a live conversation. */ }
  }
  function listThreads(list, parentId, query = '') {
    const needle = query.trim().toLocaleLowerCase()
    return Object.values(list.byId).filter(row => row.origin === 'subagent' && row.parentId === parentId && row.displayTitle?.startsWith('Side: '))
      .filter(row => !needle || row.displayTitle.toLocaleLowerCase().includes(needle))
      .sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
  }
  const currentInput = (ctx, sessionId) => {
    const conversation = ctx.get('conversation') ?? ctx.conversation
    const scope = ctx.sessions.scope?.(sessionId)
    return scope ? conversation?.input.for(scope) : conversation?.input.shell?.(sessionId)
  }
  function openThread(ctx, resources, scope, threadId, title) {
    const column = ctx.get('sidebarRight')
    const native = (column?.tabsIn(scope.sessionId) ?? []).find(tab => {
      if (tab.kind !== 'sidechat') return false
      let meta = resources.nativeRecords?.get(tab.id, scope.sessionId)?.tab.meta
      if (!meta) meta = resources.nativeRecords?.readPersistent?.(tab.id, scope.sessionId, tab.contentId, tab.kind)?.meta
      if (!meta) { try { meta = column.tabDomain.occurrence(scope.sessionId, tab).navigation.getSnapshot().params?.meta } catch {} }
      return meta?.threadId === threadId
    })
    if (native) {
      resources.service.activateTab(native.id, scope)
      if (!ctx.get('sidebarRight').isExpanded()) ctx.get('sidebarRight').toggleExpanded()
      return native.id
    }
    resources.service.openTab({ type: 'sidechat', title, meta: { threadId } }, scope)
  }
  function openFiles(ctx, resources, scope) {
    const native = (ctx.get('sidebarRight')?.tabsIn(scope.sessionId) ?? []).flatMap(tab => {
      const record = resources.nativeRecords?.get(tab.id, scope.sessionId)?.tab
      if (record?.meta?.dir) return []
      let path = record?.path
      if (!path && tab.contentId?.startsWith('dsh-resource://file/session/')) {
        try { path = tab.contentId.slice('dsh-resource://file/session/'.length).split('/').slice(1).map(decodeURIComponent).join('/') } catch {}
      }
      return path ? [path] : []
    })
    return [...new Set(native)]
  }
  function Sidechat({ Original, resources, ...props }) {
    const { ctx, scope, tab, visible } = props
    const t = ctx.locale.bind(NS)
    const list = useSyncExternalStore(useCallback(callback => ctx.sessions.list.subscribe(callback), [ctx]), useCallback(() => ctx.sessions.list.getSnapshot(), [ctx]))
    const threadId = tab.meta?.threadId
    const restoreKey = JSON.stringify([scope.sessionId, threadId])
    const title = displayTitle(list.byId[threadId]?.displayTitle ?? tab.title, t('untitled'))
    const [history, setHistory] = useState(false), [query, setQuery] = useState(''), [contextOpen, setContextOpen] = useState(false)
    const [rename, setRename] = useState(false), [name, setName] = useState(title), [customContext, setCustomContext] = useState('')
    const [references, setReferences] = useState([]), [state, setState] = useState({}), [error, setError] = useState(''), [notice, setNotice] = useState(''), [renaming, setRenaming] = useState(false)
    const controls = useRef(null), referencesRef = useRef(references), restored = useRef(null), staged = useRef(null), draftRef = useRef(''), root = useRef(null), renameInFlight = useRef(false)
    referencesRef.current = references
    const rows = useMemo(() => listThreads(list, scope.sessionId, query), [list, scope.sessionId, query])
    const total = useMemo(() => listThreads(list, scope.sessionId).length, [list, scope.sessionId])
    const patchPending = useCallback((text, items) => {
      const meta = resources.nativeRecords?.get(tab.id, scope.sessionId)?.tab.meta ?? tab.meta ?? {}
      const draftPending = Boolean(text), contextPending = items.length > 0
      if (meta.draftPending !== draftPending || meta.contextPending !== contextPending) resources.service.updateTab(tab.id, { meta: { ...meta, draftPending, contextPending } }, scope)
    }, [resources, tab.id, tab.meta, scope.sessionId])
    const handleDraftChange = useCallback((text, id) => {
      // Mount effects precede restoration; do not replace a stored draft with an empty seed.
      if (!id) { draftRef.current = text; return }
      if (restored.current !== JSON.stringify([scope.sessionId, id])) return
      draftRef.current = text
      writeDraft(scope.sessionId, id, text, referencesRef.current)
      patchPending(text, referencesRef.current)
    }, [scope.sessionId, patchPending])
    useEffect(() => {
      if (!threadId || restored.current === restoreKey) return
      const previous = readDraft(scope.sessionId, threadId)
      const fresh = restored.current === null
      const freshDraft = fresh ? draftRef.current : ''
      const freshReferences = fresh ? referencesRef.current : []
      restored.current = restoreKey
      draftRef.current = previous?.text ?? freshDraft
      setReferences(previous?.references ?? freshReferences)
      controls.current?.setDraft(previous?.text ?? freshDraft)
      setNotice(''); setError(''); setRename(false)
    }, [threadId, scope.sessionId, restoreKey])
    useEffect(() => {
      if (typeof tab.meta?.draft !== 'string' && typeof tab.meta?.context !== 'string' && !Array.isArray(tab.meta?.context)) { staged.current = null; return }
      const signature = JSON.stringify([scope.sessionId, tab.meta.draft, tab.meta.context])
      if (staged.current !== signature) {
        staged.current = signature
        if (typeof tab.meta.draft === 'string' && tab.meta.draft.trim()) {
          const seed = bounded(tab.meta.draft)
          draftRef.current = draftRef.current.trim() ? `${draftRef.current}\n\n${seed}` : seed
          controls.current?.setDraft(draftRef.current)
          setNotice(t('staged'))
        }
        referencesRef.current = [...referencesRef.current, ...contextSeeds(tab.meta.context, t('agentContext'))].slice(0, 20)
        setReferences(referencesRef.current)
      }
      // Keep pre-thread seeds durable until the child is bound; then the independent thread cache owns them.
      if (threadId) {
        writeDraft(scope.sessionId, threadId, draftRef.current, referencesRef.current)
        resources.service.updateTab(tab.id, { meta: { draft: undefined, context: undefined } }, scope)
      }
    }, [threadId, tab.meta?.draft, tab.meta?.context, tab.id, resources, scope.sessionId])
    useEffect(() => {
      if (restored.current !== restoreKey) return
      writeDraft(scope.sessionId, threadId, draftRef.current, references)
      patchPending(draftRef.current, references)
    }, [references, threadId, scope.sessionId, restoreKey, patchPending])
    useEffect(() => {
      if (!history && !contextOpen && !rename) return
      const escape = event => { if (event.key === 'Escape') { event.preventDefault(); setHistory(false); setContextOpen(false); setRename(false); controls.current?.focus() } }
      root.current?.addEventListener('keydown', escape)
      return () => root.current?.removeEventListener('keydown', escape)
    }, [history, contextOpen, rename])
    const onState = useCallback(next => setState(next), [])
    const preparePrompt = useCallback(text => referencesRef.current.length === 0 ? text : `${text}\n\n${t('promptContext')}\n\n${referencesRef.current.map(item => `### ${item.title}\n${item.text}`).join('\n\n')}`, [ctx])
    const onSent = useCallback(() => { setReferences([]); setNotice(''); draftRef.current = ''; writeDraft(scope.sessionId, threadId, '', []) }, [scope.sessionId, threadId])
    const addReference = (referenceTitle, text) => {
      if (!String(text ?? '').trim()) return
      setReferences(current => current.some(item => item.title === referenceTitle && item.text === text) ? current : [...current, { title: referenceTitle, text: bounded(text) }].slice(0, 20))
      setContextOpen(false); controls.current?.focus()
    }
    const perform = async action => { setError(''); setNotice(''); try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
    const submitName = event => {
      event.preventDefault()
      if (!threadId || !name.trim() || renameInFlight.current) return
      renameInFlight.current = true; setRenaming(true)
      void perform(async () => {
        const renamed = `Side: ${name.trim().slice(0, 160)}`
        const apply = async binding => { const result = await binding.session.rename(renamed); if (result?.ok === false) throw new Error(result.error?.message ?? 'Rename failed') }
        if (ctx.sessions.using) await ctx.sessions.using(threadId, { source: 'controllerOperation' }, apply)
        else { const binding = ctx.sessions.binding?.(threadId); if (!binding) throw new Error('This conversation is unavailable'); await apply(binding) }
        resources.service.updateTab(tab.id, { title: name.trim() }, scope); setRename(false)
      }).finally(() => { renameInFlight.current = false; setRenaming(false) })
    }
    const addToMain = () => void perform(() => {
      const input = currentInput(ctx, scope.sessionId)
      if (!input) throw new Error(t('noInput'))
      const before = input.state.getSnapshot().draft
      input.setDraft([before, `Side Chat — ${title}\n\n${state.latestReply}`].filter(Boolean).join('\n\n'))
      setNotice(t('added'))
    })
    const model = [state.info?.preset, state.info?.model ?? state.info?.provider].filter(Boolean).join(' · ')
    const button = (key, action, extra = {}) => h('button', { type: 'button', onClick: action, title: t(key), ...extra }, extra.children ?? t(key))
    const attachments = references.length ? h('div', { className: 'dsh-app-sidechat-references', 'aria-label': t('context') }, references.map((item, index) => h('span', { key: `${item.title}:${index}`, className: 'dsh-app-sidechat-reference', title: item.text }, h('span', {}, item.title), button('remove', () => setReferences(current => current.filter((_, candidate) => candidate !== index)), { 'aria-label': `${t('remove')}: ${item.title}`, children: '×' })))) : null
    return h('section', { ref: root, className: 'dsh-app-sidechat', 'data-dsh-app-sidechat': '', 'aria-label': t('viewTitle') },
      h('header', { className: 'dsh-app-sidechat-header' },
        h('div', { className: 'dsh-app-sidechat-identity' }, h('strong', { title }, title), h('span', { className: state.running ? 'is-running' : '', role: 'status' }, t(state.running ? 'running' : 'ready'))),
        h('div', { className: 'dsh-app-sidechat-actions' }, button('history', () => { setHistory(value => !value); setContextOpen(false) }, { 'aria-expanded': history, 'aria-controls': `${tab.id}-history` }), button('new', () => resources.service.openTab({ type: 'sidechat' }, scope)))) ,
      h('div', { className: 'dsh-app-sidechat-toolbar' }, button('context', () => { setContextOpen(value => !value); setHistory(false) }, { 'aria-expanded': contextOpen, 'aria-controls': `${tab.id}-context` }), button('rename', () => { setName(title); setRename(value => !value) }, { disabled: !threadId }), button('promote', () => void controls.current?.save(), { disabled: !state.canSave || Boolean(state.busy), title: t('promoteHelp') }), model && h('span', { className: 'dsh-app-sidechat-model', title: `${t('model')} · ${model}` }, model)),
      rename && h('form', { className: 'dsh-app-sidechat-rename', onSubmit: submitName }, h('input', { value: name, maxLength: 160, autoFocus: true, 'aria-label': t('name'), onChange: event => setName(event.target.value) }), h('button', { type: 'submit', disabled: !name.trim() || renaming }, t('save')), button('cancel', () => setRename(false))),
      history && h('section', { id: `${tab.id}-history`, className: 'dsh-app-sidechat-history', 'aria-label': t('history') },
        h('div', { className: 'dsh-app-sidechat-history-search' }, h('input', { autoFocus: true, type: 'search', value: query, placeholder: t('historySearch'), 'aria-label': t('historySearch'), onChange: event => setQuery(event.target.value) }), h('span', {}, t('historyCount', { count: total }))),
        h('div', { className: 'dsh-app-sidechat-history-list' }, rows.map(row => h('button', { key: row.id, type: 'button', 'aria-current': row.id === threadId ? 'true' : undefined, onClick: () => { openThread(ctx, resources, scope, row.id, displayTitle(row.displayTitle, t('untitled'))); setHistory(false) } }, h('strong', {}, displayTitle(row.displayTitle, t('untitled'))), h('span', {}, row.running ? t('running') : row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : t('ready')))), rows.length === 0 && h('p', {}, list.phase === 'pending' ? t('loading') : query ? t('noMatch') : t('empty'))),
        button('retry', () => void perform(() => ctx.sessions.refresh()))),
      contextOpen && h('section', { id: `${tab.id}-context`, className: 'dsh-app-sidechat-context', 'aria-label': t('context') },
        h('p', {}, t('contextHelp')),
        h('div', { className: 'dsh-app-sidechat-context-sources' }, button('mainDraft', () => addReference(t('mainDraft'), currentInput(ctx, scope.sessionId)?.state.getSnapshot().draft), { disabled: !currentInput(ctx, scope.sessionId)?.state.getSnapshot().draft?.trim() }), button('selection', () => addReference(t('selection'), window.getSelection()?.toString()), { disabled: !window.getSelection()?.toString().trim() })),
        openFiles(ctx, resources, scope).map(path => h('button', { key: path, type: 'button', className: 'dsh-app-sidechat-file', title: path, onClick: () => addReference(path.split(/[\\/]/).at(-1), `@${path}`) }, path.split(/[\\/]/).at(-1))),
        h('form', { className: 'dsh-app-sidechat-context-form', onSubmit: event => { event.preventDefault(); addReference(t('context'), customContext); setCustomContext('') } }, h('textarea', { rows: 2, value: customContext, maxLength: 32768, placeholder: t('customContext'), 'aria-label': t('customContext'), onChange: event => setCustomContext(event.target.value) }), h('button', { type: 'submit', disabled: !customContext.trim() }, t('attach')))),
      error && h('p', { className: 'dsh-app-sidechat-error', role: 'alert' }, `${t('errors')} ${error}`),
      state.fetchError && h('div', { className: 'dsh-app-sidechat-error', role: 'alert' }, h('span', {}, `${t('transcriptError')}: ${state.fetchError}`), button('retry', () => void controls.current?.retry())),
      notice && h('p', { className: 'dsh-app-sidechat-notice', role: 'status' }, notice),
      h('div', { className: 'dsh-app-sidechat-body' }, h(Original, { ...props, controlsRef: controls, onState, onDraftChange: handleDraftChange, preparePrompt, onSent, hideHeader: true, composerAttachments: attachments })),
      h('footer', { className: 'dsh-app-sidechat-footer' }, button('copy', () => void perform(async () => { await navigator.clipboard.writeText(state.latestReply); setNotice(t('copied')) }), { disabled: !state.latestReply }), button('toMain', addToMain, { disabled: !state.latestReply }), button('parent', () => (ctx.get('uiWorkspace') ?? ctx.uiWorkspace)?.openSession(scope.sessionId)), h('span', { title: t('pending') }, references.length ? `${references.length} · ${t('context')}` : '')))
  }
  function install(ctx, resources) {
    ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-app: Side Chat dictionaries')
    ctx.effect(() => {
      const original = resources.service.getTab('sidechat')
      if (!original) return
      const component = props => h(Sidechat, { ...props, resources, Original: original.component })
      return resources.service.replaceTab({ ...original, description: () => ctx.locale.bind(NS)('contextHelp'), component })
    }, 'dsh-app: Side Chat conversation controls')
  }
  return { install, Sidechat, NS, dictionaries, listThreads, openThread, readDraft }
}
