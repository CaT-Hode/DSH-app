/** Exercise the owned Skills UI without writing skills or changing a profile. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import createSkillsClient from '../client/skills.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(value) })

async function harness(fetcher) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'HTMLElement', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.fetch = fetcher
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { Simulate } = require('react-dom/test-utils')
  const client = createSkillsClient(require)
  const t = key => key === 'skillsTab' ? '技能' : client.dictionaries.zh[key]
  const root = createRoot(document.getElementById('root'))
  let unmounted = false
  const flush = action => React.act(async () => { action?.(); await Promise.resolve(); await Promise.resolve() })
  await flush(() => root.render(React.createElement(client.SkillsPage, { t, workspaces: ['D:/project'], pickDirectory: async () => 'D:/added-library' })))
  return {
    flush, Simulate,
    button: label => [...document.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label || button.title === label),
    openMenu: async () => flush(() => document.querySelector('.dsh-app-skills-menu summary').click()),
    change: async (input, value) => flush(() => Simulate.change(input, { target: { value } })),
    async unmount() { if (!unmounted) { await flush(() => root.unmount()); unmounted = true } },
    async close() {
      if (!unmounted) { await flush(() => root.unmount()); unmounted = true }
      dom.window.close()
      for (const key of keys) {
        const descriptor = originals.get(key)
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

const stateOf = () => ({
  libraries: [{ id: 'user', label: 'User', path: 'D:/skills', enabled: true, writable: true, toggleable: true, exists: true }],
  skills: [
    { uri: 'skill:example', name: 'example', description: 'First skill', libraryId: 'user', path: 'D:/skills/example/SKILL.md', enabled: true, canEdit: true, canDelete: true, canToggle: true, revision: 'revision-1' },
    { uri: 'skill:readonly', name: 'readonly', description: 'Read only skill', libraryId: 'runtime', enabled: true, canEdit: false, canDelete: false, canToggle: false },
  ], trash: [], warnings: [], limits: { maxContentBytes: 65536, maxUploadBytes: 1024 },
})

test('skills search, editable detail, versioned save, recoverable delete and restore share the owned API', async () => {
  const state = stateOf()
  const calls = []
  const raw = '---\nname: example\ndescription: First skill\ncustom: keep\n---\nBody'
  const detail = { ...state.skills[0], content: raw }
  const ui = await harness(async (url, options) => {
    calls.push({ url, method: options.method, credentials: options.credentials, body: options.body ? JSON.parse(options.body) : null })
    if (url.startsWith('/dsh-app/skills.json')) return response(state)
    if (url.startsWith('/dsh-app/skills/detail.json')) return response(detail)
    const body = JSON.parse(options.body)
    if (body.action === 'edit') { assert.equal(body.revision, 'revision-1'); detail.content = body.content; detail.revision = 'revision-2' }
    if (body.action === 'set-enabled') { detail.enabled = body.enabled; state.skills[0].enabled = body.enabled }
    if (body.action === 'delete') { state.skills = state.skills.filter(item => item.uri !== body.uri); state.trash.push({ id: 'trash-1', name: 'example', libraryId: 'user', deletedAt: 1 }) }
    if (body.action === 'restore') { state.skills.push({ ...detail }); state.trash = [] }
    return response({ ok: true })
  })
  try {
    assert.equal(document.querySelectorAll('[data-dsh-app-skill]').length, 2)
    const search = document.querySelector('[aria-label="搜索技能"]')
    await ui.change(search, 'example')
    assert.equal(document.querySelectorAll('[data-dsh-app-skill]').length, 1)
    await ui.flush(() => document.querySelector('[data-dsh-app-skill="skill:example"]').click())
    assert.equal(document.querySelector('[data-dsh-app-skill-detail]').textContent.includes('custom: keep'), true)
    await ui.flush(() => ui.button('停用模型调用').click())
    assert.deepEqual(calls.filter(call => call.body?.action === 'set-enabled').at(-1).body, { action: 'set-enabled', uri: 'skill:example', enabled: false })
    await ui.flush(() => ui.button('编辑').click())
    await ui.change(document.querySelector('textarea'), `${raw}\nEdited`)
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-skills-form')))
    assert.deepEqual(calls.filter(call => call.body?.action === 'edit').at(-1).body, { action: 'edit', uri: 'skill:example', content: `${raw}\nEdited`, revision: 'revision-1' })
    await ui.flush(() => ui.button('移入回收站').click())
    assert.equal(calls.some(call => call.body?.action === 'delete'), false, 'deletion requires the inline confirmation')
    await ui.flush(() => ui.button('确认移入回收站').click())
    assert.ok(document.body.textContent.includes('选择技能以查看详情。'))
    await ui.openMenu()
    await ui.flush(() => ui.button('回收站').click())
    await ui.flush(() => ui.button('恢复').click())
    assert.equal(state.trash.length, 0)
    assert.ok(calls.some(call => call.body?.action === 'restore' && call.body.id === 'trash-1'))
    assert.ok(calls.every(call => call.credentials === 'same-origin'))
    assert.ok(calls.every(call => call.url.startsWith('/dsh-app/skills')))
  } finally { await ui.close() }
})

test('skills create, library changes, local and GitHub import, upload and workspace routing retain explicit fields', async () => {
  const state = stateOf()
  const bodies = []
  const urls = []
  const ui = await harness(async (url, options) => {
    urls.push(url)
    if (url.startsWith('/dsh-app/skills.json')) return response(state)
    if (url.startsWith('/dsh-app/skills/detail.json')) return response({ ...state.skills[0], content: 'Skill body' })
    bodies.push(JSON.parse(options.body))
    if (bodies.at(-1).source === 'D:/invalid-import') return response({ ok: true, count: 0, result: { skipped: ['existing'], failed: [{ name: 'invalid', error: 'Missing description' }] } })
    return response({ ok: true })
  })
  try {
    await ui.flush(() => ui.button('新建技能').click())
    const inputs = [...document.querySelectorAll('.dsh-app-skills-form input')]
    await ui.change(inputs[0], 'new-skill')
    await ui.change(inputs[1], 'Description')
    await ui.change(document.querySelector('textarea'), 'New skill body')
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-skills-form')))
    assert.deepEqual(bodies.at(-1), { action: 'create', libraryId: 'user', name: 'new-skill', description: 'Description', content: 'New skill body' })
    await ui.openMenu()
    await ui.flush(() => ui.button('技能库设置').click())
    await ui.flush(() => document.querySelector('[data-dsh-app-skill-library="user"] button').click())
    assert.deepEqual(bodies.at(-1), { action: 'set-library', libraryId: 'user', enabled: false })
    await ui.flush(() => ui.button('选择文件夹').click())
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-skills-form')))
    assert.deepEqual(bodies.at(-1), { action: 'set-library', path: 'D:/added-library', enabled: true })
    await ui.flush(() => ui.button('安装与导入').click())
    let source = document.querySelector('.dsh-app-skills-form input:not([type="file"])')
    await ui.change(source, 'D:/source-skills')
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-skills-form')))
    assert.deepEqual(bodies.at(-1), { action: 'import', libraryId: 'user', source: 'D:/source-skills', conflict: 'skip' })
    await ui.change(source, 'https://github.com/owner/repository')
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-skills-form')))
    assert.deepEqual(bodies.at(-1), { action: 'install', libraryId: 'user', source: 'https://github.com/owner/repository', conflict: 'skip' })
    const bytes = new TextEncoder().encode('Uploaded')
    const upload = document.querySelector('[aria-label="上传技能文件或 ZIP"]')
    await ui.flush(() => ui.Simulate.change(upload, { target: { files: [{ name: 'SKILL.md', size: bytes.length, arrayBuffer: async () => bytes.buffer }] } }))
    assert.deepEqual(bodies.at(-1), { action: 'import', libraryId: 'user', conflict: 'skip', files: [{ path: 'SKILL.md', base64: Buffer.from(bytes).toString('base64') }] })
    const before = bodies.length
    await ui.flush(() => ui.Simulate.change(upload, { target: { files: [{ name: 'oversized.zip', size: 1025 }] } }))
    assert.equal(bodies.length, before, 'uploads exceeding the advertised host limit are refused before reading')
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('上传大小超过'))
    await ui.change(source, 'D:/invalid-import')
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-skills-form')))
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('1 个技能导入失败'))
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('Missing description'))
    assert.ok(document.body.textContent.includes('跳过 1 个已有技能'))
    await ui.change(document.querySelector('[aria-label="工作区"]'), 'D:/project')
    assert.ok(urls.includes('/dsh-app/skills.json?cwd=D%3A%2Fproject'))
  } finally { await ui.close() }
})

test('readonly details expose no file actions and switching details cancels stale requests', async () => {
  const state = stateOf()
  const signals = []
  const ui = await harness((url, options) => {
    if (url.startsWith('/dsh-app/skills.json')) return Promise.resolve(response(state))
    if (url.includes('skill%3Areadonly')) return Promise.resolve(response({ ...state.skills[1], content: '<img src=x onerror=alert(1)>' }))
    return new Promise((resolve, reject) => {
      signals.push(options.signal)
      options.signal.addEventListener('abort', () => reject(new DOMException('Selection changed', 'AbortError')), { once: true })
    })
  })
  try {
    await ui.flush(() => document.querySelector('[data-dsh-app-skill="skill:example"]').click())
    await ui.flush(() => document.querySelector('[data-dsh-app-skill="skill:readonly"]').click())
    assert.ok(signals[0].aborted)
    assert.equal(document.querySelector('[data-dsh-app-skill-detail] img'), null, 'skill content remains text')
    assert.ok(document.body.textContent.includes('<img src=x onerror=alert(1)>'))
    assert.equal(ui.button('编辑'), undefined)
    assert.equal(ui.button('移入回收站'), undefined)
    assert.ok(document.body.textContent.includes('此技能仅供查看。'))
    await ui.flush(() => document.querySelector('[data-dsh-app-skill="skill:example"]').click())
    await ui.unmount()
    assert.ok(signals.every(signal => signal.aborted))
  } finally { await ui.close() }
})

test('large libraries render one selected page and searching returns to its first page', async () => {
  const state = stateOf()
  state.skills = Array.from({ length: 101 }, (_, index) => ({ uri: `skill:${index}`, name: `skill-${String(index).padStart(3, '0')}`, description: 'Sample', libraryId: 'user', enabled: true }))
  const ui = await harness(async () => response(state))
  try {
    assert.equal(document.querySelectorAll('[data-dsh-app-skill]').length, 48)
    await ui.flush(() => ui.button('下一页').click())
    assert.equal(document.querySelectorAll('[data-dsh-app-skill]').length, 48)
    assert.equal(document.querySelector('[data-dsh-app-skill]').dataset.dshAppSkill, 'skill:48')
    await ui.change(document.querySelector('footer select'), '24')
    assert.equal(document.querySelectorAll('[data-dsh-app-skill]').length, 24)
    await ui.change(document.querySelector('[aria-label="搜索技能"]'), 'skill-100')
    assert.equal(document.querySelectorAll('[data-dsh-app-skill]').length, 1)
    assert.equal(document.querySelector('[data-dsh-app-skill]').dataset.dshAppSkill, 'skill:100')
    assert.ok(ui.button('下一页').disabled)
  } finally { await ui.close() }
})

test('compact skills header keeps utilities in its menu and a disabled library explains invocation controls', async () => {
  const state = stateOf()
  state.libraries[0].enabled = false
  state.skills[0].enabled = false
  const calls = []
  const ui = await harness(async (url, options) => {
    if (url.startsWith('/dsh-app/skills.json')) return response(state)
    if (url.startsWith('/dsh-app/skills/detail.json')) return response({ ...state.skills[0], content: 'Body' })
    calls.push(JSON.parse(options.body))
    if (calls.at(-1).action === 'set-library') state.libraries[0].enabled = calls.at(-1).enabled
    return response({ ok: true })
  })
  try {
    const header = document.querySelector('.dsh-app-skills-page-head')
    assert.equal(header.querySelector('h2').textContent, '技能')
    assert.deepEqual([...header.querySelectorAll('.dsh-app-skills-page-actions > button')].map(button => button.textContent), ['创建', '导入'])
    const menu = header.querySelector('details')
    assert.equal(menu.open, false)
    assert.deepEqual([...menu.querySelectorAll('button')].map(button => button.textContent), ['技能库设置', '回收站'])
    assert.ok([...document.querySelectorAll('svg')].every(svg => svg.getAttribute('stroke') === 'currentColor'))
    await ui.flush(() => document.querySelector('[data-dsh-app-skill="skill:example"]').click())
    assert.ok(ui.button('启用模型调用').disabled, 'a disabled library cannot report an ineffective skill enable as success')
    assert.ok(document.body.textContent.includes('此技能库已停用，请先在技能库设置中启用。'))
    await ui.openMenu()
    assert.equal(menu.open, true)
    await ui.flush(() => ui.button('技能库设置').click())
    assert.equal(menu.open, false, 'choosing a utility dismisses the menu')
    await ui.flush(() => document.querySelector('[data-dsh-app-skill-library="user"] button').click())
    assert.deepEqual(calls.at(-1), { action: 'set-library', libraryId: 'user', enabled: true })
    await ui.flush(() => ui.button('返回详情').click())
    assert.equal(ui.button('启用模型调用').disabled, false)
    assert.ok(document.querySelector('.dsh-app-skills-list footer'), 'pagination stays with the list')
  } finally { await ui.close() }
})

test('skill model and command channels remain distinct and only the model channel is toggled', async () => {
  const state = stateOf()
  Object.assign(state.skills[0], { enabled: true, modelInvocable: true, userInvocable: false, managerEnabled: true })
  Object.assign(state.skills[1], { enabled: false, modelInvocable: false, userInvocable: true })
  const detail = { ...state.skills[0], content: 'Body' }
  const bodies = []
  const ui = await harness(async (url, options) => {
    if (url.startsWith('/dsh-app/skills.json')) return response(state)
    if (url.startsWith('/dsh-app/skills/detail.json')) return response(detail)
    const body = JSON.parse(options.body)
    bodies.push(body)
    if (body.action === 'set-enabled') {
      detail.enabled = detail.modelInvocable = body.enabled
      state.skills[0].enabled = state.skills[0].modelInvocable = body.enabled
    }
    return response({ ok: true })
  })
  try {
    assert.match(document.querySelector('[data-dsh-app-skill="skill:example"]').textContent, /仅模型/)
    assert.match(document.querySelector('[data-dsh-app-skill="skill:readonly"]').textContent, /仅指令/)
    await ui.flush(() => document.querySelector('[data-dsh-app-skill="skill:example"]').click())
    assert.equal(document.querySelector('[data-dsh-app-skill-channels]').textContent, '模型调用: 已启用 · 手动指令: 已停用')
    await ui.flush(() => ui.button('停用模型调用').click())
    assert.deepEqual(bodies.at(-1), { action: 'set-enabled', uri: 'skill:example', enabled: false })
    assert.equal(detail.userInvocable, false)
    assert.equal(document.querySelector('[data-dsh-app-skill-channels]').textContent, '模型调用: 已停用 · 手动指令: 已停用')
  } finally { await ui.close() }
})
