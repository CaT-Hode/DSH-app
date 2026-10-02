/** Own the workbench preferences shown inside the official General settings page. */

/** Serialize preference patches against the last server revision, cancelling queued writes after a failure.
 * @param options Sidebar API, shared store, wire parser and state observer.
 * @returns Read, write, subscription refresh and teardown operations for one mounted settings view.
 */
export function createSidebarPreferencesController({ api, store, parsePrefs, onState }) {
  let canonical = store.getPrefs(), revision, loaded = false, disposed = false, reading = false, writing = false, refreshRequested = false
  let queue = [], error = null
  const projected = () => queue.reduce((prefs, change) => ({ ...prefs, ...change(prefs) }), canonical)
  const publish = () => { if (!disposed) onState({ prefs: projected(), loaded, loading: reading, saving: writing || queue.length > 0, error }) }
  const adopt = view => {
    if (disposed) return
    canonical = parsePrefs(view.value)
    revision = view.revision
    loaded = true
    store.setPrefs(canonical)
  }
  const read = async ({ preserveError = false } = {}) => {
    if (disposed) return
    if (writing || queue.length || reading) { refreshRequested = true; return }
    reading = true
    if (!preserveError) error = null
    publish()
    try { adopt(await api.settingsGet()) } catch (caught) { if (!disposed) error ??= caught }
    finally {
      reading = false
      publish()
      if (!disposed && refreshRequested) { refreshRequested = false; await read({ preserveError: true }) }
    }
  }
  const drain = async () => {
    if (writing || reading || disposed) return
    writing = true
    publish()
    while (!disposed && queue.length) {
      const change = queue[0]
      try {
        const view = await api.settingsUpdate(change(canonical), revision)
        if (disposed) break
        queue.shift()
        adopt(view)
      } catch (caught) {
        if (!disposed) { error = caught; queue = []; refreshRequested = true }
        break
      }
      publish()
    }
    writing = false
    publish()
    if (!disposed && refreshRequested) { refreshRequested = false; await read({ preserveError: true }) }
  }
  return {
    load: read,
    write(change) {
      if (!loaded || disposed || reading) return
      error = null
      queue.push(typeof change === 'function' ? change : () => change)
      publish()
      void drain()
    },
    refresh() { refreshRequested = true; if (!writing && !reading && queue.length === 0) { refreshRequested = false; void read() } },
    dispose() { disposed = true; queue = [] },
  }
}

/** Create the integrated preferences UI using the released React and primitive controls.
 * @param require Browser module table resolver.
 * @returns Localized text and the component composed into settings.general.item.
 */
export default function createSidebarSettingsClient(require) {
  const React = require('react')
  const { createElement: h, useEffect, useRef, useState } = React
  const { Input } = require('@deepseek-ai/dsh-client-ui-primitives')
  const dictionaries = {
    zh: {
      workbenchTitle: '工作台', workbenchIntro: '文件、变更和任务与聊天共用一个工作区。',
      workbenchLoading: '正在加载工作台设置…', workbenchSaving: '正在保存…', workbenchReload: '重新加载',
      workbenchLoadFailed: '无法读取工作台设置。', workbenchSaveFailed: '保存失败。',
      workbenchConflict: '设置已在其他窗口中修改，已读取最新值。请重新选择要修改的选项。',
      workbenchOptions: '{name}选项', workbenchContent: '工作台内容', workbenchViewers: '文件预览', workbenchAnyFile: '其他文件',
      workbenchAgentOpen: '允许 Agent 控制侧栏', workbenchAgentOpenDesc: 'Agent 可在当前会话中打开文件、文件夹、网页和工具，切换或关闭标签，并显示或收起面板。',
      workbenchPlacement: '窗口位置适配', workbenchPlacementDesc: '调整工作台与窗口标题栏的相对位置。',
      workbenchAuto: '自动', workbenchWeb: '标准网页', workbenchCustom: '自定义',
      workbenchShift: '标题栏预留高度', workbenchShiftDesc: '为自定义标题栏预留 0–120 像素。', workbenchCss: '自定义 CSS',
      workbenchCssDesc: '只在自定义位置适配模式下应用。', workbenchAdvanced: '高级行为',
      workbenchNarrow: '窄窗口不自动展开任务', workbenchNarrowDesc: '新子代理和后台任务仍保留在任务列表。',
      workbenchNarrowTree: '窄窗口默认使用任务树', workbenchNarrowTreeDesc: '可以在任务页临时切换视图。',
      workbenchFiles: '文件', workbenchFilesDesc: '浏览工作区、编辑文件，并在应用中打开。',
      workbenchChanges: '变更', workbenchChangesDesc: '查看文件差异、Git 状态、提交和工作树。',
      workbenchTasks: '任务', workbenchTasksDesc: '查看子代理、后台任务和工作流。',
      workbenchSidechat: '侧栏对话', workbenchSidechatDesc: '在工作台内打开独立的辅助对话。',
      workbenchDiff: '差异预览', workbenchDiffDesc: '显示文件变更的逐行差异。',
      workbenchMarkdown: 'Markdown', workbenchHtml: 'HTML', workbenchCode: '代码与文本',
      workbenchEditorExplorer: '文件浏览方式', workbenchEditorExplorerDesc: '选择文件树与编辑器如何排列。',
      workbenchExplorerMerged: '编辑器内的文件树', workbenchExplorerSplit: '独立的文件树',
      workbenchAutoSubagent: '新子代理自动打开任务', workbenchAutoSubagentDesc: '会话创建子代理时打开工作台中的任务页。',
      workbenchAutoJobs: '新后台任务自动打开任务', workbenchAutoJobsDesc: '会话启动后台任务时打开工作台中的任务页。',
      workbenchTasksView: '默认任务视图', workbenchTasksViewDesc: '打开任务页时使用的视图。', workbenchGraph: '工作流图', workbenchTree: '任务树',
      workbenchHtmlSandbox: '关闭 HTML 沙箱', workbenchHtmlSandboxDesc: '关闭后页面与 DSH 同源，可读取会话数据并调用内部接口。仅用于可信文件。',
      workbenchHtmlUnsafe: 'HTML 预览默认关闭沙箱', workbenchHtmlUnsafeDesc: '每次打开 HTML 文件时使用非沙箱预览。仅用于可信文件。',
      workbenchOpenTargets: '始终显示工作台的打开方式', workbenchOpenTargetsDesc: '保留文件管理器、编辑器和 SSH 目标，即使系统已找到关联应用。',
      workbenchSsh: 'SSH 主机', workbenchSshDesc: '留空使用本机；填写 SSH 别名或 user@host 后，VS Code 系编辑器使用远程协议。',
      workbenchEditors: '自定义编辑器', workbenchEditorsDesc: '用包含 {path} 的 URL 模板打开工作区文件。', workbenchAddEditor: '添加编辑器',
      workbenchEditorName: '编辑器名称', workbenchEditorUrl: '打开 URL 模板', workbenchEditorFamily: '使用 VS Code 协议',
      workbenchEditorRemove: '移除编辑器', workbenchEditorInvalid: '名称不能为空，URL 模板需以 scheme:// 开头并包含 {path}。未完成的编辑器不会显示在打开菜单。',
      workbenchCustomFailed: '扩展设置暂不可用。', workbenchPx: 'px',
    },
    en: {
      workbenchTitle: 'Workbench', workbenchIntro: 'Files, changes and tasks share the conversation workspace.',
      workbenchLoading: 'Loading workbench settings…', workbenchSaving: 'Saving…', workbenchReload: 'Reload',
      workbenchLoadFailed: 'Could not load workbench settings.', workbenchSaveFailed: 'Could not save.',
      workbenchConflict: 'Settings changed in another window. The latest values have been loaded. Choose the option again to change it.',
      workbenchOptions: '{name} options', workbenchContent: 'Workbench content', workbenchViewers: 'File previews', workbenchAnyFile: 'Other files',
      workbenchAgentOpen: 'Allow agent sidebar control', workbenchAgentOpenDesc: 'Allow the agent to open files, folders, pages and tools, switch or close tabs, and show or hide panels in its current chat.',
      workbenchPlacement: 'Window placement', workbenchPlacementDesc: 'Adjust the workbench relative to the window title bar.',
      workbenchAuto: 'Automatic', workbenchWeb: 'Standard web', workbenchCustom: 'Custom',
      workbenchShift: 'Reserved title bar height', workbenchShiftDesc: 'Reserve 0–120 pixels for a custom title bar.', workbenchCss: 'Custom CSS',
      workbenchCssDesc: 'Applied only with custom window placement.', workbenchAdvanced: 'Advanced behavior',
      workbenchNarrow: 'Keep tasks closed in narrow windows', workbenchNarrowDesc: 'New subagents and background jobs remain in the task list.',
      workbenchNarrowTree: 'Use the task tree in narrow windows', workbenchNarrowTreeDesc: 'You can temporarily change the view on the Tasks page.',
      workbenchFiles: 'Files', workbenchFilesDesc: 'Browse and edit workspace files, and open them in applications.',
      workbenchChanges: 'Changes', workbenchChangesDesc: 'View diffs, Git status, commits and worktrees.',
      workbenchTasks: 'Tasks', workbenchTasksDesc: 'View subagents, background jobs and workflows.',
      workbenchSidechat: 'Side chat', workbenchSidechatDesc: 'Open an independent helper conversation in the workbench.',
      workbenchDiff: 'Diff preview', workbenchDiffDesc: 'Show line-by-line file changes.',
      workbenchMarkdown: 'Markdown', workbenchHtml: 'HTML', workbenchCode: 'Code and text',
      workbenchEditorExplorer: 'File browser layout', workbenchEditorExplorerDesc: 'Choose how the file tree and editor are arranged.',
      workbenchExplorerMerged: 'File tree inside the editor', workbenchExplorerSplit: 'Separate file tree',
      workbenchAutoSubagent: 'Open Tasks for new subagents', workbenchAutoSubagentDesc: 'Open the workbench Tasks page when a conversation creates a subagent.',
      workbenchAutoJobs: 'Open Tasks for new background jobs', workbenchAutoJobsDesc: 'Open the workbench Tasks page when a background job starts.',
      workbenchTasksView: 'Default task view', workbenchTasksViewDesc: 'The view used when you open Tasks.', workbenchGraph: 'Workflow graph', workbenchTree: 'Task tree',
      workbenchHtmlSandbox: 'Disable the HTML sandbox', workbenchHtmlSandboxDesc: 'Pages can access conversation data and internal APIs with the DSH origin. Use only for trusted files.',
      workbenchHtmlUnsafe: 'Disable sandboxing by default for HTML previews', workbenchHtmlUnsafeDesc: 'Open every HTML file without sandboxing. Use only for trusted files.',
      workbenchOpenTargets: 'Always show workbench Open with targets', workbenchOpenTargetsDesc: 'Keep file manager, editor and SSH targets available alongside associated applications.',
      workbenchSsh: 'SSH host', workbenchSshDesc: 'Leave empty for local files. An SSH alias or user@host uses the remote protocol in VS Code family editors.',
      workbenchEditors: 'Custom editors', workbenchEditorsDesc: 'Open workspace files with a URL template containing {path}.', workbenchAddEditor: 'Add editor',
      workbenchEditorName: 'Editor name', workbenchEditorUrl: 'Open URL template', workbenchEditorFamily: 'Use the VS Code protocol',
      workbenchEditorRemove: 'Remove editor', workbenchEditorInvalid: 'Enter a name and a scheme:// URL template containing {path}. Incomplete editors are hidden from the Open with menu.',
      workbenchCustomFailed: 'Extension settings are unavailable.', workbenchPx: 'px',
    },
  }
  const textOf = value => value === undefined ? '' : typeof value === 'function' ? value() : value
  const builtinNames = { editor: 'workbenchFiles', git: 'workbenchChanges', subagent: 'workbenchTasks', sidechat: 'workbenchSidechat', diff: 'workbenchDiff', markdown: 'workbenchMarkdown', html: 'workbenchHtml', code: 'workbenchCode' }
  const builtinDescriptions = { editor: 'workbenchFilesDesc', git: 'workbenchChangesDesc', subagent: 'workbenchTasksDesc', sidechat: 'workbenchSidechatDesc', diff: 'workbenchDiffDesc' }
  const builtinToggleCopy = {
    editorExplorer: ['workbenchEditorExplorer', 'workbenchEditorExplorerDesc'], autoOpenSubagent: ['workbenchAutoSubagent', 'workbenchAutoSubagentDesc'],
    autoOpenJobs: ['workbenchAutoJobs', 'workbenchAutoJobsDesc'], tasksViewMode: ['workbenchTasksView', 'workbenchTasksViewDesc'],
    htmlViewerNoSandbox: ['workbenchHtmlSandbox', 'workbenchHtmlSandboxDesc'], htmlViewerDefaultUnsafe: ['workbenchHtmlUnsafe', 'workbenchHtmlUnsafeDesc'],
    openWithPluginTargets: ['workbenchOpenTargets', 'workbenchOpenTargetsDesc'],
  }
  function Row({ title, description, children, className = '' }) {
    return h('div', { className: `dsh-app-workbench-row ${className}` },
      h('div', { className: 'dsh-app-workbench-copy' }, h('span', { className: 'dsh-app-workbench-label' }, title), description && h('span', { className: 'dsh-app-workbench-description' }, description)),
      h('div', { className: 'dsh-app-workbench-control' }, children))
  }
  function Toggle({ label, checked, onChange, disabled }) {
    return h('label', { className: 'dsh-app-workbench-switch' },
      h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked, disabled, onChange: event => onChange(event.currentTarget.checked) }),
      h('span', { 'aria-hidden': true }))
  }
  function DraftInput({ value, onCommit, label, type = 'text', min, max, multiline = false, disabled, placeholder }) {
    const [draft, setDraft] = useState(String(value ?? ''))
    useEffect(() => setDraft(String(value ?? '')), [value])
    const commit = () => {
      if (draft === String(value ?? '')) return
      if (type === 'number') {
        const parsed = Number(draft)
        if (draft.trim() === '' || !Number.isFinite(parsed)) { setDraft(String(value ?? '')); return }
        const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(parsed)))
        onCommit(next)
        setDraft(String(next))
      } else onCommit(draft)
    }
    const props = { className: multiline ? 'dsh-app-workbench-textarea' : 'dsh-app-workbench-input', 'aria-label': label, value: draft, disabled, placeholder, spellCheck: false,
      onChange: event => setDraft(event.currentTarget.value), onBlur: commit,
      onKeyDown: event => { if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.blur() } } }
    return multiline ? h('textarea', { ...props, rows: 5 }) : h(Input, { ...props, type, min, max, step: type === 'number' ? 1 : undefined })
  }
  function Picker({ label, value, options, multi, onChange, disabled }) {
    // Option indices keep boolean and numeric preference values intact across the DOM string boundary.
    const selected = multi ? options.map((option, index) => Array.isArray(value) && value.includes(option.value) ? String(index) : null).filter(index => index !== null) : String(options.findIndex(option => option.value === value))
    return h('select', { className: 'dsh-app-workbench-select', 'aria-label': label, multiple: multi, value: selected, disabled,
      onChange: event => onChange(multi ? [...event.currentTarget.selectedOptions].map(option => options[Number(option.value)].value) : options[Number(event.currentTarget.value)].value) },
    ...options.map((option, index) => h('option', { key: index, value: String(index) }, textOf(option.title))))
  }
  class ExtensionBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null } }
    static getDerivedStateFromError(error) { return { error } }
    render() { return this.state.error ? h('p', { role: 'alert', className: 'dsh-app-workbench-error' }, this.props.message) : this.props.children }
  }
  function ExtensionPanel({ render, panelProps }) { return render(panelProps) }
  function Field({ descriptor, value, onChange, t, builtin }) {
    const keys = builtin ? builtinToggleCopy[descriptor.key] : undefined
    const title = keys ? t(keys[0]) : textOf(descriptor.title)
    const description = keys ? t(keys[1]) : textOf(descriptor.desc)
    let options = descriptor.options ?? []
    if (builtin && descriptor.key === 'editorExplorer') options = [{ value: true, title: t('workbenchExplorerMerged') }, { value: false, title: t('workbenchExplorerSplit') }]
    if (builtin && descriptor.key === 'tasksViewMode') options = [{ value: 'graph', title: t('workbenchGraph') }, { value: 'tree', title: t('workbenchTree') }]
    const control = descriptor.type === 'select' ? h(Picker, { label: title, value, options, multi: descriptor.multi === true, onChange })
      : (descriptor.type ?? 'switch') === 'switch' ? h(Toggle, { label: title, checked: value === true, onChange })
        : h(React.Fragment, null, h(DraftInput, { label: title, value, type: descriptor.type, min: descriptor.min, max: descriptor.max, placeholder: textOf(descriptor.placeholder), onCommit: onChange }), descriptor.unit && h('span', { className: 'dsh-app-workbench-unit' }, descriptor.unit))
    return h(Row, { title, description }, control)
  }
  function OpenWithSettings({ prefs, writePlugin, t, parseOpenWithConfig }) {
    const config = parseOpenWithConfig(prefs.pluginSettings.editor?.openWith)
    const changeConfig = reducer => writePlugin('editor', 'openWith', current => reducer(parseOpenWithConfig(current)))
    const edit = (id, patch) => changeConfig(current => ({ ...current, customEditors: current.customEditors.map(editor => editor.id === id ? { ...editor, ...patch } : editor) }))
    const editors = config.customEditors ?? []
    return h('div', { className: 'dsh-app-workbench-open-with' },
      h(Row, { title: t('workbenchSsh'), description: t('workbenchSshDesc') }, h(DraftInput, { label: t('workbenchSsh'), value: config.sshHost, placeholder: 'user@host', onCommit: sshHost => changeConfig(current => ({ ...current, sshHost })) })),
      h(Row, { title: t('workbenchEditors'), description: t('workbenchEditorsDesc') }, h('button', { type: 'button', className: 'dsh-app-workbench-button', onClick: () => {
        const id = globalThis.crypto.randomUUID()
        changeConfig(current => ({ ...current, customEditors: [...current.customEditors, { id, name: '', urlTemplate: '', isVscodeFamily: false }] }))
      } }, t('workbenchAddEditor'))),
      ...editors.map(editor => h('div', { key: editor.id, className: 'dsh-app-workbench-editor', 'data-workbench-editor': editor.id },
        h('div', { className: 'dsh-app-workbench-editor-inputs' },
          h(DraftInput, { label: t('workbenchEditorName'), value: editor.name, placeholder: t('workbenchEditorName'), onCommit: name => edit(editor.id, { name }) }),
          h(DraftInput, { label: t('workbenchEditorUrl'), value: editor.urlTemplate, placeholder: 'editor://file/{path}', onCommit: urlTemplate => edit(editor.id, { urlTemplate }) })),
        h(Row, { title: t('workbenchEditorFamily') }, h(Toggle, { label: `${t('workbenchEditorFamily')} ${editor.name}`, checked: editor.isVscodeFamily === true, onChange: isVscodeFamily => edit(editor.id, { isVscodeFamily }) }),
          h('button', { type: 'button', className: 'dsh-app-workbench-button', 'aria-label': `${t('workbenchEditorRemove')} ${editor.name}`, onClick: () => changeConfig(current => ({ ...current, customEditors: current.customEditors.filter(item => item.id !== editor.id), pinned: current.pinned.filter(id => id !== `custom:${editor.id}`) })) }, t('workbenchEditorRemove'))))),
      editors.some(editor => !editor.name.trim() || !editor.urlTemplate.includes('{path}') || !/^[a-z][a-z0-9+.-]*:\/\//i.test(editor.urlTemplate.trim())) && h('p', { className: 'dsh-app-workbench-description', role: 'note' }, t('workbenchEditorInvalid')))
  }

  /** Render revision-guarded workbench preferences inside General settings.
   * @param props Localized formatter and current engine resources; subscriptions return disposers.
   * @returns One transparent section with native form semantics and expandable extension rows.
   */
  function SidebarSettings({ t, store, service, api, parsePrefs, parseOpenWithConfig, shellPresets = [], subscribePreferences }) {
    const [state, setState] = useState(() => ({ prefs: store.getPrefs(), loaded: false, loading: true, saving: false, error: null }))
    const [registryRevision, setRegistryRevision] = useState(0)
    const controller = useRef(null)
    useEffect(() => {
      const current = createSidebarPreferencesController({ api, store, parsePrefs, onState: setState })
      controller.current = current
      void current.load()
      const stopSettings = subscribePreferences?.(() => current.refresh())
      return () => { current.dispose(); controller.current = null; stopSettings?.() }
    }, [api, store, parsePrefs, subscribePreferences])
    useEffect(() => service.subscribe(() => setRegistryRevision(value => value + 1)), [service])
    void registryRevision
    const tabs = [...service.getTabs()].sort((a, b) => Number(a.hidden === true) - Number(b.hidden === true) || (a.order ?? 100) - (b.order ?? 100))
    const viewers = [...service.getFileViewers()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    const presets = typeof shellPresets === 'function' ? shellPresets() : shellPresets
    const prefs = state.prefs
    const write = patch => controller.current?.write(patch)
    const writePlugin = (id, key, value) => write(current => ({ pluginSettings: { ...current.pluginSettings, [id]: { ...current.pluginSettings[id], [key]: typeof value === 'function' ? value(current.pluginSettings[id]?.[key]) : value } } }))
    const schemeOptions = [{ value: 'auto', title: t('workbenchAuto') }, { value: 'web', title: t('workbenchWeb') }, ...presets.map(preset => ({ value: `preset:${preset.id}`, title: textOf(preset.title) })), { value: 'custom', title: t('workbenchCustom') }]
    const schemeValue = prefs.titleBarScheme === 'preset' ? `preset:${prefs.titleBarPresetId}` : prefs.titleBarScheme
    const renderFeature = (feature, map, viewer = false) => {
      const builtin = feature.id in builtinNames
      const name = builtin ? t(builtinNames[feature.id]) : textOf(feature.title) || feature.id
      const description = builtinDescriptions[feature.id] ? t(builtinDescriptions[feature.id]) : textOf(feature.description) || (viewer ? feature.exts.length ? feature.exts.join(' · ') : t('workbenchAnyFile') : '')
      const settings = feature.settings
      const configured = settings && ((settings.toggles?.length ?? 0) > 0 || (settings.pluginToggles?.length ?? 0) > 0 || settings.render)
      const enabled = prefs[map][feature.id] !== false
      return h('div', { key: feature.id, className: 'dsh-app-workbench-feature', 'data-workbench-feature': feature.id },
        h(Row, { title: name, description }, h(Toggle, { label: name, checked: enabled, onChange: next => write(current => ({ [map]: { ...current[map], [feature.id]: next } })) })),
        configured && enabled && h('details', { className: 'dsh-app-workbench-details' },
          h('summary', null, t('workbenchOptions', { name })),
          h('div', { className: 'dsh-app-workbench-detail-body' },
            ...(settings.toggles ?? []).map(descriptor => h(Field, { key: `host:${descriptor.key}`, descriptor, value: prefs[descriptor.key], t, builtin, onChange: next => write({ [descriptor.key]: next }) })),
            ...(settings.pluginToggles ?? []).map(descriptor => h(Field, { key: `plugin:${descriptor.key}`, descriptor, value: prefs.pluginSettings[feature.id]?.[descriptor.key], t, builtin, onChange: next => writePlugin(feature.id, descriptor.key, next) })),
            feature.id === 'editor' ? h(OpenWithSettings, { prefs, writePlugin, t, parseOpenWithConfig }) : settings.render && h(ExtensionBoundary, { message: t('workbenchCustomFailed') }, h(ExtensionPanel, { render: settings.render, panelProps: { store, service, prefs, pluginSettings: prefs.pluginSettings[feature.id] ?? {}, updatePluginSetting: (key, value) => writePlugin(feature.id, key, value), close: () => { for (const node of document.querySelectorAll('.dsh-app-workbench-details[open]')) node.open = false } } })))))
    }
    const errorText = state.error?.code === 'settings-conflict' ? t('workbenchConflict') : `${t(state.loaded ? 'workbenchSaveFailed' : 'workbenchLoadFailed')} ${state.error?.message ?? String(state.error ?? '')}`
    return h('section', { className: 'dsh-app-workbench-settings', 'aria-label': t('workbenchTitle'), 'aria-busy': state.loading || state.saving },
      h('div', { className: 'dsh-app-workbench-heading' }, h('h2', null, t('workbenchTitle')), h('p', null, t('workbenchIntro'))),
      state.loading && !state.loaded && h('p', { role: 'status', className: 'dsh-app-workbench-description' }, t('workbenchLoading')),
      state.error && h('div', { role: 'alert', className: 'dsh-app-workbench-error' }, h('span', null, errorText), h('button', { type: 'button', className: 'dsh-app-workbench-button', onClick: () => controller.current?.load() }, t('workbenchReload'))),
      h('fieldset', { className: 'dsh-app-workbench-fields', disabled: !state.loaded || state.loading },
        h(Row, { title: t('workbenchAgentOpen'), description: t('workbenchAgentOpenDesc') }, h(Toggle, { label: t('workbenchAgentOpen'), checked: prefs.agentOpenTools, onChange: agentOpenTools => write({ agentOpenTools }) })),
        h('h3', { className: 'dsh-app-workbench-group-title' }, t('workbenchContent')), ...tabs.map(feature => renderFeature(feature, 'tabsEnabled')),
        h('h3', { className: 'dsh-app-workbench-group-title' }, t('workbenchViewers')), ...viewers.map(feature => renderFeature(feature, 'viewersEnabled', true)),
        h('details', { className: 'dsh-app-workbench-details dsh-app-workbench-advanced' }, h('summary', null, t('workbenchAdvanced')), h('div', { className: 'dsh-app-workbench-detail-body' },
          h(Row, { title: t('workbenchPlacement'), description: t('workbenchPlacementDesc') }, h(Picker, { label: t('workbenchPlacement'), value: schemeValue, options: schemeOptions, onChange: value => write(value.startsWith('preset:') ? { titleBarScheme: 'preset', titleBarPresetId: value.slice(7), titleBarCompat: true } : { titleBarScheme: value, titleBarCompat: value === 'custom' }) })),
          prefs.titleBarScheme === 'custom' && h(React.Fragment, null,
            h(Row, { title: t('workbenchShift'), description: t('workbenchShiftDesc') }, h(DraftInput, { label: t('workbenchShift'), value: prefs.titleBarStripPx, type: 'number', min: 0, max: 120, onCommit: titleBarStripPx => write({ titleBarStripPx }) }), h('span', { className: 'dsh-app-workbench-unit' }, t('workbenchPx'))),
            h(Row, { title: t('workbenchCss'), description: t('workbenchCssDesc'), className: 'dsh-app-workbench-row-multiline' }, h(DraftInput, { label: t('workbenchCss'), value: prefs.customCss, multiline: true, onCommit: customCss => write({ customCss }) }))),
          h(Row, { title: t('workbenchNarrow'), description: t('workbenchNarrowDesc') }, h(Toggle, { label: t('workbenchNarrow'), checked: prefs.mobileNoAutoOpen, onChange: mobileNoAutoOpen => write({ mobileNoAutoOpen }) })),
          h(Row, { title: t('workbenchNarrowTree'), description: t('workbenchNarrowTreeDesc') }, h(Toggle, { label: t('workbenchNarrowTree'), checked: prefs.mobileDefaultTree, onChange: mobileDefaultTree => write({ mobileDefaultTree }) }))))),
      h('span', { className: 'dsh-app-workbench-save-status', role: 'status', 'aria-live': 'polite' }, state.saving ? t('workbenchSaving') : ''))
  }
  return { NS: 'dshAppSidebarSettings', SidebarSettings, dictionaries, styles: '' }
}
