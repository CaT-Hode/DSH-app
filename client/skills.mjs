/**
 * Own the single Skills page using on-demand Host data and explicit file operations.
 * @param require - browser module loader supplying React.
 * @returns locale dictionaries, scoped styles and the Skills component.
 */
export default function createSkillsClient(require) {
  const { createElement: h, useEffect, useMemo, useRef, useState } = require('react')
  const dictionaries = {
    zh: {
      skillSearch: '搜索技能', skillLibrary: '技能库', skillAllLibraries: '全部技能库', skillWorkspace: '工作区', skillDefaultWorkspace: '当前工作区',
      skillCreate: '新建技能', skillImport: '安装与导入', skillLibraries: '技能库设置', skillRefresh: '刷新', skillLoading: '正在读取技能…',
      skillNoResults: '没有匹配的技能。', skillSelect: '选择技能以查看详情。', skillName: '名称', skillDescription: '描述', skillContent: '正文',
      skillFile: 'SKILL.md 内容', skillPath: '路径', skillEnabled: '已启用', skillDisabled: '已停用', skillEnable: '启用', skillDisable: '停用',
      skillEdit: '编辑', skillSave: '保存', skillCancel: '取消', skillDelete: '移入回收站', skillDeleteConfirm: '确认移入回收站',
      skillSaved: '已保存。', skillImported: '导入完成。', skillChanged: '已更新。', skillBusy: '正在处理…', skillOperationFailed: '操作失败',
      skillInvalidResponse: '技能服务返回了无效数据。', skillReadonly: '此技能仅供查看。', skillCreateUnavailable: '没有可写的技能库。请先添加一个技能库。',
      skillSource: '技能来源', skillSourcePlaceholder: '本机技能目录或 https://github.com/作者/仓库', skillInstall: '导入或安装', skillUpload: '上传技能文件或 ZIP',
      skillAddLibrary: '添加技能库', skillLibraryPath: '技能库目录', skillPickDirectory: '选择文件夹', skillLibraryMissing: '目录不存在',
      skillLibraryReadonly: '只读', skillLibraryWritable: '可编辑', skillImportedCount: '已导入 {count} 个技能', skillLimitExceeded: '上传大小超过技能服务的上限。',
      skillReturn: '返回详情', skillCount: '{count} 个技能', skillWarnings: '部分来源暂不可用', skillEditHelp: '修改内容，保留已有名称和元数据。',
      skillTrash: '回收站', skillRestore: '恢复', skillTrashEmpty: '回收站为空。', skillUploadFolder: '上传技能文件夹',
      skillPerPage: '每页', skillPrevious: '上一页', skillNext: '下一页', skillPage: '第 {page} / {pages} 页',
      skillImportSkipped: '跳过 {count} 个已有技能', skillImportFailed: '{count} 个技能导入失败',
      skillTitle: '技能', skillCreateShort: '创建', skillImportShort: '导入', skillMore: '更多技能操作',
      skillLibraryDisabledHint: '此技能库已停用，请先在技能库设置中启用。',
      skillModelEnable: '启用模型调用', skillModelDisable: '停用模型调用', skillModelOnly: '仅模型', skillUserOnly: '仅指令',
      skillBothChannels: '模型与指令', skillModelChannel: '模型调用', skillUserChannel: '手动指令',
    },
    en: {
      skillSearch: 'Search skills', skillLibrary: 'Skill library', skillAllLibraries: 'All libraries', skillWorkspace: 'Workspace', skillDefaultWorkspace: 'Current workspace',
      skillCreate: 'New skill', skillImport: 'Install and import', skillLibraries: 'Library settings', skillRefresh: 'Refresh', skillLoading: 'Loading skills…',
      skillNoResults: 'No skills match.', skillSelect: 'Select a skill to view its details.', skillName: 'Name', skillDescription: 'Description', skillContent: 'Body',
      skillFile: 'SKILL.md content', skillPath: 'Path', skillEnabled: 'Enabled', skillDisabled: 'Disabled', skillEnable: 'Enable', skillDisable: 'Disable',
      skillEdit: 'Edit', skillSave: 'Save', skillCancel: 'Cancel', skillDelete: 'Move to trash', skillDeleteConfirm: 'Confirm move to trash',
      skillSaved: 'Saved.', skillImported: 'Import completed.', skillChanged: 'Updated.', skillBusy: 'Working…', skillOperationFailed: 'Operation failed',
      skillInvalidResponse: 'The skill service returned invalid data.', skillReadonly: 'This skill can only be viewed.', skillCreateUnavailable: 'No writable skill library. Add a library first.',
      skillSource: 'Skill source', skillSourcePlaceholder: 'Local skill directory or https://github.com/owner/repository', skillInstall: 'Import or install', skillUpload: 'Upload skill files or ZIP',
      skillAddLibrary: 'Add library', skillLibraryPath: 'Skill library directory', skillPickDirectory: 'Choose folder', skillLibraryMissing: 'Directory is missing',
      skillLibraryReadonly: 'Read only', skillLibraryWritable: 'Editable', skillImportedCount: 'Imported {count} skills', skillLimitExceeded: 'The upload exceeds the skill service limit.',
      skillReturn: 'Back to details', skillCount: '{count} skills', skillWarnings: 'Some sources are unavailable', skillEditHelp: 'Preserve the existing name and metadata.',
      skillTrash: 'Trash', skillRestore: 'Restore', skillTrashEmpty: 'Trash is empty.', skillUploadFolder: 'Upload a skill folder',
      skillPerPage: 'Per page', skillPrevious: 'Previous', skillNext: 'Next', skillPage: 'Page {page} of {pages}',
      skillImportSkipped: 'Skipped {count} existing skills', skillImportFailed: '{count} skills failed to import',
      skillTitle: 'Skills', skillCreateShort: 'Create', skillImportShort: 'Import', skillMore: 'More skill actions',
      skillLibraryDisabledHint: 'This library is disabled. Enable it in Library settings first.',
      skillModelEnable: 'Enable model invocation', skillModelDisable: 'Disable model invocation', skillModelOnly: 'Model only', skillUserOnly: 'Command only',
      skillBothChannels: 'Model and command', skillModelChannel: 'Model invocation', skillUserChannel: 'Manual command',
    },
  }
  const styles = ''
  const modelEnabled = item => item.modelInvocable ?? item.enabled
  const userEnabled = item => item.userInvocable ?? item.enabled
  const channelLabel = item => modelEnabled(item) ? userEnabled(item) ? 'skillBothChannels' : 'skillModelOnly' : userEnabled(item) ? 'skillUserOnly' : 'skillDisabled'
  function icon(kind) {
    const paths = {
      skill: ['M5 3h6l3 3v9H5z', 'M11 3v3h3', 'M7.5 9h4M7.5 12h3'],
      plus: ['M8 3v10M3 8h10'], import: ['M8 2v8M5 7l3 3 3-3', 'M3 11v3h10v-3'],
      more: ['M3 8h.01M8 8h.01M13 8h.01'], search: ['M10.5 10.5l3.5 3.5', 'M11 6.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0'],
      refresh: ['M13 5a5.5 5.5 0 1 0 .2 5', 'M13 2v3h-3'], library: ['M2 3h3v11H2zM6.5 3h3v11h-3zM11 3l3 1-2 10-3-1z'],
      trash: ['M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10', 'M7 7v4M9 7v4'], edit: ['M3 11l8-8 2 2-8 8H3z'],
      check: ['M3 8l3 3 7-7'], left: ['M10 3L5 8l5 5'], right: ['M6 3l5 5-5 5'],
    }
    return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      ...paths[kind].map((d, index) => h('path', { key: index, d })))
  }

  function SkillsPage({ t, workspaces = [], pickDirectory }) {
    const [snapshot, setSnapshot] = useState(null)
    const [query, setQuery] = useState('')
    const [libraryId, setLibraryId] = useState('')
    const [cwd, setCwd] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(48)
    const [selected, setSelected] = useState(null)
    const [detail, setDetail] = useState(null)
    const [mode, setMode] = useState('detail')
    const [draft, setDraft] = useState({ name: '', description: '', content: '', libraryId: '' })
    const [source, setSource] = useState('')
    const [libraryPath, setLibraryPath] = useState('')
    const [loading, setLoading] = useState(true)
    const [detailLoading, setDetailLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(null)
    const [notice, setNotice] = useState(null)
    const [deleteTarget, setDeleteTarget] = useState(null)
    const requests = useRef(new Set())
    const mounted = useRef(false)
    const detailRequest = useRef(null)
    const listRevision = useRef(0)
    const detailRevision = useRef(0)
    const format = (key, values) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key))
    async function request(url, body, suppliedController) {
      const controller = suppliedController || new AbortController()
      requests.current.add(controller)
      try {
        const response = await fetch(url, {
          method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
        const value = await response.json()
        if (!response.ok || value?.ok === false) throw new Error(typeof value?.error === 'string' ? value.error : value?.error?.message || t('skillOperationFailed'))
        if (!value || typeof value !== 'object') throw new Error(t('skillInvalidResponse'))
        return value
      } finally { requests.current.delete(controller) }
    }
    const stateUrl = () => `/dsh-app/skills.json${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''}`
    async function load() {
      const revision = ++listRevision.current
      if (mounted.current) { setLoading(true); setError(null) }
      try {
        const next = await request(stateUrl())
        if (!Array.isArray(next.skills) || !Array.isArray(next.libraries)) throw new Error(t('skillInvalidResponse'))
        if (mounted.current && revision === listRevision.current) setSnapshot(next)
        return next
      } catch (reason) {
        if (mounted.current && revision === listRevision.current && reason.name !== 'AbortError') setError(reason.message)
      } finally { if (mounted.current && revision === listRevision.current) setLoading(false) }
    }
    async function readDetail(uri) {
      detailRequest.current?.abort()
      const controller = new AbortController()
      detailRequest.current = controller
      const revision = ++detailRevision.current
      if (mounted.current) { setDetailLoading(true); setError(null); setDetail(null) }
      try {
        const next = await request(`/dsh-app/skills/detail.json?uri=${encodeURIComponent(uri)}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ''}`, undefined, controller)
        if (next.uri !== uri || typeof next.content !== 'string') throw new Error(t('skillInvalidResponse'))
        if (mounted.current && revision === detailRevision.current) setDetail(next)
      } catch (reason) {
        if (mounted.current && revision === detailRevision.current && reason.name !== 'AbortError') setError(reason.message)
      } finally { if (mounted.current && revision === detailRevision.current) setDetailLoading(false) }
    }
    useEffect(() => {
      mounted.current = true
      return () => { mounted.current = false; for (const controller of requests.current) controller.abort(); requests.current.clear() }
    }, [])
    useEffect(() => { setSelected(null); setDetail(null); setMode('detail'); void load() }, [cwd])
    useEffect(() => { if (selected) void readDetail(selected); else { detailRequest.current?.abort(); setDetail(null) } }, [selected, cwd])
    const libraries = snapshot?.libraries ?? []
    const writable = libraries.filter(item => item.writable === true)
    const libraryById = useMemo(() => new Map(libraries.map(item => [item.id, item])), [snapshot])
    const skills = useMemo(() => {
      const needle = query.trim().toLocaleLowerCase()
      return (snapshot?.skills ?? []).filter(item => (!libraryId || item.libraryId === libraryId) && (!needle || `${item.name} ${item.description ?? ''}`.toLocaleLowerCase().includes(needle)))
        .sort((left, right) => Number(right.name.toLocaleLowerCase().startsWith(needle)) - Number(left.name.toLocaleLowerCase().startsWith(needle)) || left.name.localeCompare(right.name))
    }, [snapshot, libraryId, query])
    const pages = Math.max(1, Math.ceil(skills.length / pageSize))
    const currentPage = Math.min(page, pages)
    const visibleSkills = skills.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    async function action(body, message = 'skillChanged') {
      if (busy) return
      setBusy(true); setError(null); setNotice(null)
      try {
        const result = await request('/dsh-app/skills/action.json', { ...body, ...(cwd ? { cwd } : {}) })
        if (!mounted.current) return
        const next = await load()
        if (!mounted.current) return
        const skipped = result.result?.skipped ?? []
        const failed = result.result?.failed ?? []
        setNotice((result.count === undefined ? t(message) : format('skillImportedCount', { count: result.count }))
          + (skipped.length ? ` · ${format('skillImportSkipped', { count: skipped.length })}` : ''))
        setDeleteTarget(null)
        const uri = result.uri ?? result.result?.uri ?? selected
        if (uri && next?.skills.some(item => item.uri === uri)) { setSelected(uri); await readDetail(uri) }
        else if (body.action === 'delete') { setSelected(null); setDetail(null) }
        if (body.action === 'create' || body.action === 'edit') setMode('detail')
        if (failed.length) setError(format('skillImportFailed', { count: failed.length }) + ': ' + failed.slice(0, 3).map(item => `${item.name || item.path || ''} ${item.error || ''}`).join('; '))
        return result
      } catch (reason) { if (mounted.current && reason.name !== 'AbortError') setError(reason.message) }
      finally { if (mounted.current) setBusy(false) }
    }
    async function upload(files) {
      if (busy || !files.length) return
      try {
        const limit = snapshot?.limits?.maxUploadBytes
        if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error(t('skillInvalidResponse'))
        if (files.reduce((total, file) => total + file.size, 0) > limit) throw new Error(t('skillLimitExceeded'))
        const read = async file => {
          const bytes = new Uint8Array(await file.arrayBuffer())
          let binary = ''
          for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
          return btoa(binary)
        }
        const body = { action: 'import', libraryId: draft.libraryId || writable[0]?.id, conflict: 'skip' }
        if (files.length === 1 && /\.zip$/i.test(files[0].name)) body.zip = await read(files[0])
        else body.files = await Promise.all(files.map(async file => ({ path: file.webkitRelativePath || file.name, base64: await read(file) })))
        if (mounted.current) await action(body, 'skillImported')
      } catch (reason) { if (mounted.current) setError(reason.message) }
    }
    const input = (key, value, onChange, props = {}) => h('label', {}, t(key), h('input', { value, onChange: event => onChange(event.target.value), disabled: busy, ...props }))
    const libraryPicker = () => h('label', {}, t('skillLibrary'), h('select', { value: draft.libraryId || writable[0]?.id || '', disabled: busy, onChange: event => setDraft({ ...draft, libraryId: event.target.value }) }, writable.map(item => h('option', { key: item.id, value: item.id }, item.label || item.path))))
    const openCreate = () => { setDraft({ name: '', description: '', content: '', libraryId: writable[0]?.id || '' }); setMode('create'); setDeleteTarget(null); setNotice(null) }
    const openEdit = () => { setDraft({ name: detail.name, description: detail.description || '', content: detail.content, libraryId: detail.libraryId || '' }); setMode('edit'); setDeleteTarget(null) }
    const selectSkill = uri => { setSelected(uri); setMode('detail'); setDeleteTarget(null); setNotice(null) }
    const openUtility = (event, page) => { event.currentTarget.closest('details').open = false; setMode(page); setDeleteTarget(null) }
    const formHeading = (key, back = false) => h('header', { className: 'dsh-app-skills-form-heading' }, h('h2', {}, t(key)), back ? h('button', { type: 'button', className: 'dsh-app-skills-icon-button', 'aria-label': t('skillReturn'), title: t('skillReturn'), onClick: () => setMode('detail') }, icon('left')) : null)
    const libraryDisabled = detail && libraryById.get(detail.libraryId)?.enabled === false
    let panel
    if (mode === 'create' || mode === 'edit') {
      panel = h('form', { className: 'dsh-app-skills-form', onSubmit: event => {
        event.preventDefault()
        void action(mode === 'create' ? { action: 'create', ...draft, libraryId: draft.libraryId || writable[0]?.id }
          : { action: 'edit', uri: selected, content: draft.content, revision: detail?.revision }, 'skillSaved')
      } }, formHeading(mode === 'create' ? 'skillCreate' : 'skillEdit'),
        mode === 'create' ? h('div', { className: 'dsh-app-skills-form' }, libraryPicker(), input('skillName', draft.name, name => setDraft({ ...draft, name }), { required: true, pattern: '[a-z0-9]+(?:-[a-z0-9]+)*' }), input('skillDescription', draft.description, description => setDraft({ ...draft, description }), { required: true })) : h('p', {}, t('skillEditHelp')),
        h('label', {}, t(mode === 'create' ? 'skillContent' : 'skillFile'), h('textarea', { value: draft.content, required: true, disabled: busy, onChange: event => setDraft({ ...draft, content: event.target.value }), 'aria-label': t(mode === 'create' ? 'skillContent' : 'skillFile') })),
        !writable.length && mode === 'create' ? h('p', {}, t('skillCreateUnavailable')) : null,
        h('div', { className: 'dsh-app-skills-actions' }, h('button', { type: 'submit', disabled: busy || (mode === 'create' && !writable.length) }, t(busy ? 'skillBusy' : 'skillSave')), h('button', { type: 'button', disabled: busy, onClick: () => setMode('detail') }, t('skillCancel'))))
    } else if (mode === 'libraries') {
      panel = h('div', {}, formHeading('skillLibraries', true),
        ...libraries.map(item => h('section', { key: item.id, className: 'dsh-app-skills-library', 'data-dsh-app-skill-library': item.id },
          h('div', { className: 'dsh-app-skills-library-head' }, icon('library'), h('strong', {}, item.label || item.path),
            item.toggleable ? h('button', { type: 'button', disabled: busy, onClick: () => action({ action: 'set-library', libraryId: item.id, enabled: !item.enabled }) }, t(item.enabled ? 'skillDisable' : 'skillEnable')) : h('small', {}, t(item.enabled ? 'skillEnabled' : 'skillDisabled'))),
          item.path ? h('p', { className: 'dsh-app-skills-metadata' }, item.path) : null, h('small', {}, `${t(item.writable ? 'skillLibraryWritable' : 'skillLibraryReadonly')}${item.exists === false ? ` · ${t('skillLibraryMissing')}` : ''}`))),
        h('form', { className: 'dsh-app-skills-form', onSubmit: event => { event.preventDefault(); if (libraryPath.trim()) void action({ action: 'set-library', path: libraryPath.trim(), enabled: true }) } },
          h('h3', {}, t('skillAddLibrary')), input('skillLibraryPath', libraryPath, setLibraryPath, { required: true }),
          h('div', { className: 'dsh-app-skills-actions' }, pickDirectory ? h('button', { type: 'button', disabled: busy, onClick: async () => {
            try { const path = await pickDirectory(); if (mounted.current && path) setLibraryPath(path) }
            catch (reason) { if (mounted.current) setError(reason.message) }
          } }, t('skillPickDirectory')) : null,
          h('button', { type: 'submit', disabled: busy || !libraryPath.trim() }, t('skillAddLibrary')))))
    } else if (mode === 'import') {
      panel = h('form', { className: 'dsh-app-skills-form', onSubmit: event => {
        event.preventDefault()
        if (source.trim()) void action({ action: /^(?:https:\/\/|github:|git\+https:\/\/)/.test(source.trim()) ? 'install' : 'import', source: source.trim(), libraryId: draft.libraryId || writable[0]?.id, conflict: 'skip' }, 'skillImported')
      } }, formHeading('skillImport'), libraryPicker(), input('skillSource', source, setSource, { required: true, placeholder: t('skillSourcePlaceholder') }),
        h('div', { className: 'dsh-app-skills-actions' }, h('button', { type: 'submit', disabled: busy || !source.trim() || !writable.length }, t(busy ? 'skillBusy' : 'skillInstall')), h('button', { type: 'button', disabled: busy, onClick: () => setMode('detail') }, t('skillCancel'))),
        h('label', {}, t('skillUpload'), h('input', { type: 'file', multiple: true, disabled: busy || !writable.length, 'aria-label': t('skillUpload'), onChange: event => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files) } })),
        h('label', {}, t('skillUploadFolder'), h('input', { type: 'file', multiple: true, webkitdirectory: '', disabled: busy || !writable.length, 'aria-label': t('skillUploadFolder'), onChange: event => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files) } })))
    } else if (mode === 'trash') {
      panel = h('div', {}, formHeading('skillTrash', true), !(snapshot?.trash?.length) ? h('p', {}, t('skillTrashEmpty')) : null,
        ...(snapshot?.trash ?? []).map(item => h('section', { key: item.id, className: 'dsh-app-skills-library' },
          h('div', { className: 'dsh-app-skills-library-head' }, icon('skill'), h('strong', {}, item.name), h('button', { type: 'button', disabled: busy, onClick: () => action({ action: 'restore', id: item.id }) }, t('skillRestore'))),
          h('small', {}, libraryById.get(item.libraryId)?.label || ''))))
    } else if (detailLoading) panel = h('div', { className: 'dsh-app-skills-detail-empty', role: 'status' }, icon('skill'), h('p', {}, t('skillLoading')))
    else if (detail) panel = h('article', { 'data-dsh-app-skill-detail': detail.uri },
      h('header', { className: 'dsh-app-skills-detail-heading' }, icon('skill'), h('div', {}, h('h2', {}, detail.name), h('small', {}, libraryById.get(detail.libraryId)?.label || t(detail.enabled ? 'skillEnabled' : 'skillDisabled')))),
      h('p', {}, detail.description), detail.path ? h('p', { className: 'dsh-app-skills-metadata' }, detail.path) : null,
      h('p', { className: 'dsh-app-skills-metadata', 'data-dsh-app-skill-channels': '' }, `${t('skillModelChannel')}: ${t(modelEnabled(detail) ? 'skillEnabled' : 'skillDisabled')} · ${t('skillUserChannel')}: ${t(userEnabled(detail) ? 'skillEnabled' : 'skillDisabled')}`),
      h('div', { className: 'dsh-app-skills-actions' }, detail.canToggle ? h('button', { type: 'button', disabled: busy || libraryDisabled, onClick: () => action({ action: 'set-enabled', uri: detail.uri, enabled: !modelEnabled(detail) }) }, icon('check'), t(modelEnabled(detail) ? 'skillModelDisable' : 'skillModelEnable')) : h('small', {}, t(channelLabel(detail))),
        detail.canEdit ? h('button', { type: 'button', disabled: busy, onClick: openEdit }, icon('edit'), t('skillEdit')) : null,
        detail.canDelete ? h('button', { type: 'button', disabled: busy, onClick: () => deleteTarget === detail.uri ? void action({ action: 'delete', uri: detail.uri }) : setDeleteTarget(detail.uri) }, icon('trash'), t(deleteTarget === detail.uri ? 'skillDeleteConfirm' : 'skillDelete')) : null),
      libraryDisabled ? h('p', { className: 'dsh-app-skills-metadata' }, t('skillLibraryDisabledHint')) : null,
      !detail.canEdit ? h('small', { className: 'dsh-app-skills-metadata' }, t('skillReadonly')) : null, h('pre', {}, detail.content))
    else panel = h('div', { className: 'dsh-app-skills-detail-empty' }, icon('skill'), h('p', {}, t('skillSelect')))
    return h('section', { className: 'dsh-app-skills', 'data-dsh-app-skills': '' },
      h('header', { className: 'dsh-app-skills-page-head' },
        h('div', { className: 'dsh-app-skills-heading' }, h('h2', {}, t('skillTitle')), h('small', {}, format('skillCount', { count: skills.length }))),
        h('div', { className: 'dsh-app-skills-page-actions' },
          h('button', { type: 'button', disabled: busy, title: t('skillCreate'), onClick: openCreate }, icon('plus'), t('skillCreateShort')),
          h('button', { type: 'button', disabled: busy, title: t('skillImport'), onClick: () => { setMode('import'); setDraft({ ...draft, libraryId: writable[0]?.id || '' }) } }, icon('import'), t('skillImportShort')),
          h('details', { className: 'dsh-app-skills-menu' }, h('summary', { 'aria-label': t('skillMore'), title: t('skillMore') }, icon('more')),
            h('div', {}, h('button', { type: 'button', disabled: busy, onClick: event => openUtility(event, 'libraries') }, icon('library'), t('skillLibraries')),
              h('button', { type: 'button', disabled: busy, onClick: event => openUtility(event, 'trash') }, icon('trash'), t('skillTrash')))))),
      h('div', { className: 'dsh-app-skills-filters' },
        h('div', { className: 'dsh-app-skills-search' }, icon('search'),
          h('input', { type: 'search', value: query, placeholder: t('skillSearch'), 'aria-label': t('skillSearch'), onChange: event => { setQuery(event.target.value); setPage(1) }, onKeyDown: event => { if (event.key === 'Escape') { setQuery(''); setPage(1) } } })),
        h('select', { value: libraryId, 'aria-label': t('skillLibrary'), onChange: event => { setLibraryId(event.target.value); setPage(1) } }, h('option', { value: '' }, t('skillAllLibraries')), ...libraries.map(item => h('option', { key: item.id, value: item.id }, item.label || item.path))),
        workspaces.length ? h('select', { value: cwd, 'aria-label': t('skillWorkspace'), disabled: busy, onChange: event => setCwd(event.target.value) }, h('option', { value: '' }, t('skillDefaultWorkspace')), ...workspaces.map(path => h('option', { key: path, value: path }, path))) : null,
        h('button', { type: 'button', className: 'dsh-app-skills-icon-button', disabled: loading || busy, onClick: load, 'aria-label': t('skillRefresh'), title: t('skillRefresh') }, icon('refresh'))),
      error ? h('p', { className: 'dsh-app-skills-notice dsh-app-skills-error', role: 'alert' }, error) : null,
      notice ? h('p', { className: 'dsh-app-skills-notice', role: 'status' }, notice) : null,
      snapshot?.warnings?.length ? h('details', { className: 'dsh-app-skills-warning-fold' }, h('summary', {}, t('skillWarnings')),
        h('p', {}, snapshot.warnings.map(item => typeof item === 'string' ? item : item.message || item.error || '').filter(Boolean).join('; '))) : null,
      loading ? h('p', { className: 'dsh-app-skills-notice', role: 'status' }, t('skillLoading')) : null,
      h('div', { className: 'dsh-app-skills-content' }, h('aside', { className: 'dsh-app-skills-list', 'aria-label': t('skillsTab') },
        h('div', { className: 'dsh-app-skills-list-head' }, libraryById.get(libraryId)?.label || t('skillAllLibraries')),
        h('div', { className: 'dsh-app-skills-list-scroll' },
          !loading && !skills.length ? h('p', { className: 'dsh-app-skills-empty' }, t('skillNoResults')) : null,
          ...visibleSkills.map(item => h('button', { key: item.uri, type: 'button', className: 'dsh-app-skills-row', disabled: busy, 'aria-selected': selected === item.uri, 'data-dsh-app-skill': item.uri, onClick: () => selectSkill(item.uri) },
            h('span', { className: 'dsh-app-skills-row-icon' }, icon('skill')),
            h('span', { className: 'dsh-app-skills-row-copy' }, h('strong', {}, item.name), h('small', { 'data-description': '' }, item.description),
              h('small', { className: 'dsh-app-skills-row-meta' }, (libraryById.get(item.libraryId)?.label || item.source || '') + (modelEnabled(item) && userEnabled(item) ? '' : ` · ${t(channelLabel(item))}`)))))),
        h('footer', { className: 'dsh-app-skills-pager' },
          h('select', { value: pageSize, 'aria-label': t('skillPerPage'), onChange: event => { setPageSize(Number(event.target.value)); setPage(1) } }, ...[24, 48, 96].map(size => h('option', { key: size, value: size }, size))),
          h('span', {}, format('skillPage', { page: currentPage, pages })),
          h('button', { type: 'button', 'aria-label': t('skillPrevious'), title: t('skillPrevious'), disabled: currentPage <= 1, onClick: () => setPage(currentPage - 1) }, icon('left')),
          h('button', { type: 'button', 'aria-label': t('skillNext'), title: t('skillNext'), disabled: currentPage >= pages, onClick: () => setPage(currentPage + 1) }, icon('right')))),
        h('div', { className: 'dsh-app-skills-detail' }, panel)))
  }
  return { SkillsPage, dictionaries, styles }
}
