/** Verify owned MCP screens and wire operations without contacting an MCP server. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import createMcpClient from '../client/mcp.mjs'
import { buildManualRecord } from '../lib/mcp/upstream/lib/connectors/manual-connector.js'
import { normalizeGovernanceMutation } from '../lib/mcp/upstream/lib/governance.js'
import { normalizeScopeTarget } from '../lib/mcp/upstream/lib/connection-scopes.js'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const response = value => ({ ok: true, json: async () => structuredClone(value) })
const okay = (detail = {}, message = 'Done') => ({ ok: true, detail, message })
function stateOf() {
  return {
    catalog: [
      { id: 'oauth', name: 'Research', category: 'Research', authMode: 'oauth2-pkce', description: '<img src=x onerror=alert(1)>', connected: ['oauth-one'], servers: [{ serverKey: 'one', serverName: 'research', transport: 'streamable-http', url: 'https://example.test/mcp' }], promptVariables: [{ name: 'topic', label: '主题', required: true }], prompts: [{ title: 'Research topic', text: 'Research {{topic}}' }] },
      { id: 'key', name: 'Key service', category: 'Data', authMode: 'api-key', servers: [], credentialFields: [{ key: 'secret', label: 'Secret', secret: true, required: true }] },
    ],
    connections: [{ key: 'manual-one', name: 'Local tools', serverName: 'local', connectorId: 'custom', transport: 'stdio', endpoint: 'stdio · node', enabled: true, canRename: true, canEditConfiguration: true, connectionState: 'healthy', scope: { label: 'Global' }, connectionPolicy: 'inherit', serverPolicy: { configuredEffect: 'inherit' } }],
    scope: { revision: 3, workspaces: [{ id: 'workspace-1', title: 'Project' }], history: [{ revision: 2, bindingCount: 1 }] },
    governance: { revision: 4, capabilities: { executionGuard: true }, rules: [], history: [{ revision: 3, ruleCount: 1 }] },
    explorer: { total: 1, items: [{ connectionKey: 'manual-one', connectorId: 'custom', serverName: 'local', name: 'read_file', title: 'Read file', description: 'Read a file', stale: false }], connections: [{ connectionKey: 'manual-one', connectionName: 'Local tools', serverName: 'local', status: 'success', toolCount: 1 }] },
    snapshots: [{ id: 'snapshot-1', createdAt: 1, reason: 'manual:known', existingCount: 1, restorable: true }],
  }
}
async function harness(custom, onPrompt) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const keys = ['window', 'document', 'HTMLElement', 'fetch', 'EventSource', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const state = stateOf(); const calls = []; const events = []
  globalThis.EventSource = class { constructor(url) { this.url = url; this.listeners = {}; events.push(this) } addEventListener(name, callback) { this.listeners[name] = callback } close() { this.closed = true } }
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ ...body, url, signal: options.signal, credentials: options.credentials })
    const override = custom?.(body, state, options)
    if (override !== undefined) return override
    const { method, params } = body
    if (method === 'catalog') return response(okay({ items: state.catalog }))
    if (method === 'status') return response(okay({ items: state.connections }))
    if (method === 'scopeContext') return response(okay(state.scope))
    if (method === 'governance') return response(okay(state.governance))
    if (method === 'toolExplorer') return response(okay(state.explorer))
    if (method === 'listSnapshots') return response(okay({ items: state.snapshots }))
    if (method === 'toolExplorerDetail') return response(okay({ tool: { ...state.explorer.items[0], inputSchema: { type: 'object', properties: { path: { type: 'string' } } } } }))
    if (method === 'editableConnectionConfig') return response(okay({ json: '{"connections":[{"env":{"TOKEN":"<KEEP_EXISTING>"}}]}' }))
    if (method === 'renameConnection') state.connections[0].name = params.name
    if (method === 'setEnabled') state.connections[0].enabled = params.enabled
    if (method === 'disconnect') state.connections = []
    if (method === 'previewPolicy') return response(okay({ baseRevision: 4, changed: true, impact: { newlyDenied: 1 } }))
    if (method === 'applyPolicy') { state.governance.revision++; state.connections[0].connectionPolicy = params.effect }
    if (method === 'previewConnectionScope') return response(okay({ baseRevision: 3, canApply: true, impact: { serverCount: 1, toolCount: 1 } }))
    if (method === 'previewConnectionScopeRollback') return response(okay({ baseRevision: 3, rollbackRevision: params.rollbackRevision, changed: true }))
    if (method === 'previewSnapshot') return response(okay({ restorable: true, restoreKeys: ['manual-one'], removeKeys: [] }))
    if (method === 'exportConfig') return response(okay({ json: '{"connections":[]}', redacted: true }))
    if (method === 'migrationPreview') return response(okay({ items: [{ id: 'legacy-one', connectorName: 'Legacy', migratable: true, alreadyMigrated: false }], pendingCount: 1 }))
    return response(okay({ checked: true }))
  }
  const React = require('react'); const { createRoot } = require('react-dom/client'); const { Simulate } = require('react-dom/test-utils')
  const client = createMcpClient(require); const root = createRoot(document.getElementById('root'))
  const flush = action => React.act(async () => { action?.(); await Promise.resolve(); await Promise.resolve() })
  const wait = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 210)); await Promise.resolve() })
  await flush(() => root.render(React.createElement(client.McpPage, { t: key => client.dictionaries.zh[key], onPrompt })))
  return { state, calls, events, Simulate, flush, wait,
    button: label => [...document.querySelectorAll('button')].find(element => element.textContent === label || element.getAttribute('aria-label') === label),
    change: (element, value) => flush(() => Simulate.change(element, { target: { value } })),
    row: key => document.querySelector(`[data-dsh-app-mcp-row="${key}"]`),
    submit: () => flush(() => Simulate.submit(document.querySelector('[data-dsh-app-mcp-form]'))),
    async close() { await flush(() => root.unmount()); dom.window.close(); for (const key of keys) { const descriptor = originals.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } },
  }
}

test('MCP catalog search, category, OAuth, credentials and prompt templates use the owned service', async () => {
  const prompts = []; const ui = await harness(undefined, (...args) => prompts.push(args))
  try {
    assert.equal(document.querySelector('iframe'), null)
    await ui.flush(() => ui.button('目录').click())
    await ui.change(document.querySelector('[aria-label="全部分类"]'), 'Research')
    assert.equal(document.querySelectorAll('[data-dsh-app-mcp-row]').length, 1)
    await ui.flush(() => ui.row('oauth').click())
    assert.equal(document.querySelector('[data-dsh-app-mcp-catalog-detail] img'), null, 'catalog text is rendered as text')
    await ui.flush(() => ui.button('授权并连接').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'connect').params, { connectorId: 'oauth' }, 'reauthorization preserves all existing project bindings')
    await ui.flush(() => ui.button('Research topic').click())
    await ui.change(document.querySelector('.dsh-app-mcp-form input'), 'GPU')
    await ui.flush(() => ui.Simulate.submit(document.querySelector('.dsh-app-mcp-form')))
    assert.deepEqual(prompts, [['Research GPU', undefined]])
    await ui.change(document.querySelector('[aria-label="全部分类"]'), '')
    await ui.flush(() => ui.row('key').click())
    await ui.flush(() => ui.button('配置并连接').click())
    await ui.change(document.querySelector('input[name="secret"]'), 'local-secret')
    await ui.submit()
    assert.deepEqual(ui.calls.find(call => call.method === 'configure').params, { connectorId: 'key', credentialValues: { secret: 'local-secret' }, scope: 'global' })
    assert.equal(document.querySelector('input[name="secret"]'), null, 'credentials leave the UI after commit')
    assert.ok(ui.calls.every(call => call.url === '/dsh-app/mcp/api' && call.credentials === 'same-origin'))
  } finally { await ui.close() }
})

test('catalog artwork survives in catalog, connected rows and details with failed-image fallback', async () => {
  const ui = await harness((_, state) => {
    state.catalog[0].icon = '/mcp-connector/ui/assets/qcc-logo.svg'
    state.catalog[1].icon = '📈'
    state.connections[0].connectorId = 'oauth'
  })
  try {
    assert.equal(ui.row('manual-one').querySelector('img').getAttribute('src'), '/dsh-app/mcp/assets/qcc-logo.svg')
    await ui.flush(() => ui.button('目录').click())
    assert.equal(ui.row('oauth').querySelector('img').getAttribute('src'), '/dsh-app/mcp/assets/qcc-logo.svg')
    assert.ok(ui.row('key').querySelector('.dsh-app-mcp-logo').textContent.includes('📈'))
    await ui.flush(() => ui.row('oauth').click())
    const detailImage = document.querySelector('[data-dsh-app-mcp-catalog-detail] .dsh-app-mcp-logo img')
    assert.ok(detailImage)
    assert.equal(detailImage.getAttribute('referrerpolicy'), 'no-referrer')
    await ui.flush(() => ui.Simulate.error(detailImage))
    assert.equal(document.querySelector('[data-dsh-app-mcp-catalog-detail] .dsh-app-mcp-logo img'), null)
    assert.ok(document.querySelector('[data-dsh-app-mcp-catalog-detail] .dsh-app-mcp-logo svg'))
  } finally { await ui.close() }
})

test('custom stdio, URL and JSON imports retain distinct input fields and reject invalid JSON', async () => {
  const ui = await harness()
  try {
    await ui.flush(() => ui.button('添加连接').click())
    await ui.change(document.querySelector('[name="name"]'), 'Custom')
    await ui.change(document.querySelector('[name="transport"]'), 'stdio')
    await ui.change(document.querySelector('[name="command"]'), 'node')
    await ui.change(document.querySelector('[name="args"]'), '["server.js"]')
    await ui.change(document.querySelector('[name="envJson"]'), '{"TOKEN":"new-secret"}')
    await ui.submit()
    assert.deepEqual(ui.calls.find(call => call.method === 'configure').params, { name: 'Custom', serverName: 'Custom', transport: 'stdio', scope: 'global', command: 'node', args: ['server.js'], envJson: '{"TOKEN":"new-secret"}', cwd: '', authMode: 'none' })
    assert.deepEqual(buildManualRecord(ui.calls.find(call => call.method === 'configure').params).env, { TOKEN: 'new-secret' }, 'the shipped Host accepts the browser stdio fields')
    await ui.flush(() => ui.button('从 URL 安装').click())
    await ui.change(document.querySelector('[name="source"]'), 'https://example.test/catalog.json')
    await ui.submit()
    assert.deepEqual(ui.calls.find(call => call.method === 'installFromUrl').params, { url: 'https://example.test/catalog.json', scope: 'global' })
    await ui.flush(() => ui.button('JSON 导入').click())
    await ui.change(document.querySelector('textarea'), '{broken')
    await ui.submit()
    assert.equal(ui.calls.some(call => call.method === 'importJson'), false)
    assert.match(document.querySelector('[role="alert"]').textContent, /有效的 JSON/)
    await ui.change(document.querySelector('textarea'), '{"mcpServers":{"local":{"command":"node"}}}')
    await ui.submit()
    assert.equal(ui.calls.find(call => call.method === 'importJson').params.json.includes('mcpServers'), true)
  } finally { await ui.close() }
})

test('connection enable, rename, safe edit, reconnect and disconnect remain deliberate', async () => {
  const ui = await harness()
  try {
    await ui.flush(() => ui.row('manual-one').click())
    await ui.flush(() => ui.button('停用').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'setEnabled').params, { key: 'manual-one', enabled: false })
    await ui.flush(() => ui.button('重新连接').click())
    assert.deepEqual(ui.calls.filter(call => call.method === 'setEnabled').at(-1).params, { key: 'manual-one', enabled: true })
    await ui.flush(() => ui.button('重命名').click())
    await ui.change(document.querySelector('[name="name"]'), 'Renamed')
    await ui.submit()
    assert.equal(ui.calls.find(call => call.method === 'renameConnection').params.name, 'Renamed')
    await ui.flush(() => ui.button('编辑配置').click())
    assert.match(document.querySelector('textarea').value, /<KEEP_EXISTING>/)
    await ui.submit()
    assert.match(ui.calls.find(call => call.method === 'reconfigureConnection').params.json, /<KEEP_EXISTING>/)
    await ui.flush(() => ui.button('断开连接').click())
    assert.equal(ui.calls.some(call => call.method === 'disconnect'), false)
    await ui.flush(() => ui.button('确认断开连接').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'disconnect').params, { key: 'manual-one' })
  } finally { await ui.close() }
})

test('policy and project scope changes require preview revisions before applying', async () => {
  const ui = await harness()
  try {
    await ui.flush(() => ui.row('manual-one').click())
    await ui.change(document.querySelector('[aria-label="连接策略"]'), 'deny')
    assert.equal(ui.calls.some(call => call.method === 'applyPolicy'), false)
    assert.ok(document.querySelector('[data-dsh-app-mcp-preview="applyPolicy"]'))
    await ui.flush(() => ui.button('应用').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'applyPolicy').params, { scope: 'connection', connectorId: 'custom', effect: 'deny', expectedRevision: 4 })
    assert.equal(normalizeGovernanceMutation(ui.calls.find(call => call.method === 'applyPolicy').params).effect, 'deny')
    await ui.flush(() => ui.button('可见范围').click())
    await ui.change(document.querySelector('[name="scope"]'), 'project')
    assert.deepEqual([...document.querySelector('[name="mode"]').options].map(item => item.value), ['move', 'copy'], 'only Host-supported scope operations are offered')
    await ui.change(document.querySelector('[name="targetWorkspaceId"]'), 'workspace-1')
    await ui.submit()
    assert.equal(ui.calls.some(call => call.method === 'applyConnectionScope'), false)
    await ui.flush(() => ui.button('应用').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'applyConnectionScope').params, { key: 'manual-one', mode: 'move', targetScope: 'project', targetWorkspaceId: 'workspace-1', expectedRevision: 3 })
    const scope = ui.calls.find(call => call.method === 'applyConnectionScope').params
    assert.deepEqual(normalizeScopeTarget({ scope: scope.targetScope, workspaceId: scope.targetWorkspaceId }), { scope: 'project', workspaceId: 'workspace-1' })
  } finally { await ui.close() }
})

test('tool discovery, scoped search and parameter details never invoke a tool', async () => {
  const ui = await harness()
  try {
    await ui.flush(() => ui.button('工具').click()); await ui.wait()
    assert.ok(ui.row('manual-one/read_file'))
    await ui.flush(() => ui.row('manual-one/read_file').click())
    assert.match(document.querySelector('[data-dsh-app-mcp-tool-detail] pre').textContent, /"path"/)
    await ui.change(document.querySelector('[aria-label="搜索"]'), 'read'); await ui.wait()
    assert.equal(ui.calls.filter(call => call.method === 'toolExplorer').at(-1).params.query, 'read')
    await ui.flush(() => ui.button('发现工具').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'toolExplorerAction').params, { connectionKey: 'manual-one', action: 'discover' })
    assert.ok(ui.calls.every(call => !/invoke|execute|callTool/.test(call.method)))
  } finally { await ui.close() }
})

test('backup export, snapshot preview, restore, history rollback and legacy migration are accessible', async () => {
  const ui = await harness()
  try {
    await ui.flush(() => ui.button('设置').click())
    await ui.flush(() => ui.button('导出配置').click())
    assert.equal(document.querySelector('[aria-label="导出配置"]').value, '{"connections":[]}')
    await ui.flush(() => ui.button('预览恢复').click())
    assert.equal(ui.calls.some(call => call.method === 'restoreSnapshot'), false)
    await ui.flush(() => ui.button('恢复').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'restoreSnapshot').params, { snapshotId: 'snapshot-1' })
    await ui.flush(() => ui.button('回滚').click()); await ui.flush(() => ui.button('应用').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'rollbackPolicy').params, { rollbackRevision: 3, expectedRevision: 4 })
    await ui.flush(() => ui.button('检查旧授权').click())
    await ui.flush(() => ui.Simulate.change(document.querySelector('.dsh-app-mcp-settings input[type="checkbox"]'), { target: { checked: true } }))
    await ui.flush(() => ui.button('迁移所选授权').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'migrateLegacy').params, { candidateIds: ['legacy-one'] })
    await ui.flush(() => ui.button('检查连接').click())
    assert.ok(ui.calls.some(call => call.method === 'healthCheck'))
  } finally { await ui.close() }
})

test('failed server operations keep the original form and unmount cancels requests and events', async () => {
  let liveSignal
  const ui = await harness(({ method }, _state, options) => {
    if (method === 'configure') return response({ ok: false, message: 'Validation failed; retained original connection' })
    if (method === 'healthCheck') return new Promise((_resolve, reject) => { liveSignal = options.signal; liveSignal.addEventListener('abort', () => reject(new DOMException('Closed', 'AbortError')), { once: true }) })
  })
  await ui.flush(() => ui.button('添加连接').click())
  await ui.change(document.querySelector('[name="name"]'), 'Keep draft')
  await ui.change(document.querySelector('[name="url"]'), 'https://example.test/mcp')
  await ui.submit()
  assert.match(document.querySelector('[role="alert"]').textContent, /retained original connection/)
  assert.equal(document.querySelector('[name="name"]').value, 'Keep draft')
  await ui.flush(() => ui.button('取消').click())
  await ui.flush(() => ui.row('manual-one').click())
  await ui.flush(() => ui.button('检查连接').click())
  await ui.close()
  assert.equal(liveSignal.aborted, true)
  assert.equal(ui.events[0].closed, true)
  assert.equal(ui.events[0].url, '/dsh-app/mcp/events')
})

test('JSON uploads respect the body limit and scope recovery uses its preview revision', async () => {
  const ui = await harness()
  try {
    await ui.flush(() => ui.button('JSON 导入').click())
    const fileInput = document.querySelector('[aria-label="读取 JSON 文件"]')
    await ui.flush(() => ui.Simulate.change(fileInput, { target: { files: [{ size: 1024 * 1024 + 1, text: () => { throw new Error('Must not read') } }] } }))
    assert.match(document.querySelector('[role="alert"]').textContent, /1 MiB/)
    await ui.flush(() => ui.Simulate.change(fileInput, { target: { files: [{ size: 20, text: async () => '{"connections":[]}' }] } }))
    assert.equal(document.querySelector('textarea').value, '{"connections":[]}')
    await ui.flush(() => ui.button('设置').click())
    const history = [...document.querySelectorAll('.dsh-app-mcp-settings .dsh-app-mcp-section')].find(item => item.querySelector('h2')?.textContent === '范围历史')
    await ui.flush(() => history.querySelector('button').click())
    assert.equal(ui.calls.some(call => call.method === 'rollbackConnectionScope'), false)
    await ui.flush(() => ui.button('应用').click())
    assert.deepEqual(ui.calls.find(call => call.method === 'rollbackConnectionScope').params, { rollbackRevision: 2, expectedRevision: 3 })
    assert.ok(document.querySelector('.dsh-app-mcp-content[data-wide="true"] > .dsh-app-mcp-detail'), 'settings retain their own scroll container')
  } finally { await ui.close() }
})
