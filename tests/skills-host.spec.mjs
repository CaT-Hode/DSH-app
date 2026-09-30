import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import test from 'node:test'
import { SkillsManager, installSkills, parseSkillDocument } from '../lib/skills-host.mjs'

const raw = (name, flags = '', body = 'Original instructions') => `---\nname: ${name}\ndescription: Example\n${flags}---\n${body}\n`

function registry() {
  const providers = new Map()
  return { providers, registerProvider(create) {
    const controller = new AbortController()
    const provider = create({ signal: controller.signal, invalidate() {} })
    assert.ok(!providers.has(provider.name), 'one provider in each registration scope')
    providers.set(provider.name, provider)
    return () => { providers.delete(provider.name); controller.abort(new Error('disposed')) }
  }, async snapshot(options) {
    const candidates = (await Promise.all([...providers.values()].map(provider => provider.list(options)))).flat()
    return { skills: candidates, complete: true }
  }, async get(name, options) {
    for (const provider of providers.values()) {
      const candidate = (await provider.list(options)).find(row => row.name === name)
      if (candidate) return provider.get(candidate, options)
    }
  } }
}

async function fixture(t) {
  const parent = await fs.mkdtemp(join(tmpdir(), 'dsh-app-skills-host-'))
  const home = join(parent, 'dsh'), profile = join(parent, 'profile'), cwd = join(parent, 'project'), userHome = join(parent, 'user')
  for (const path of [home, profile, cwd, userHome]) await fs.mkdir(path)
  const entries = [], agents = [], disposers = [], events = new Map(), routes = new Map(), skills = registry()
  const ctx = { skills, settings: { describe() { return [] } }, sessions: { list() { return [{ header: { cwd } }] } },
    get(name) { return name === 'pluginInventory' ? { list: async () => ({ entries }) } : name === 'agents' ? { list: () => agents } : undefined },
    effect(create) { const disposer = create(); if (typeof disposer === 'function') disposers.push(disposer); return disposer },
    on(name, listener) { const list = events.get(name) || []; list.push(listener); events.set(name, list); disposers.push(() => list.splice(list.indexOf(listener), 1)) },
    emit() {}, connection: { requestRejection() {} }, webServer: { port: 19876, register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } } }
  const options = { home, profile, skills: { cacheMs: 1 } }
  const manager = new SkillsManager(ctx, options, { userHome, environment: {} })
  skills.registerProvider(control => manager.provider(control))
  t.after(async () => {
    await manager.close()
    for (const disposer of disposers.reverse()) await disposer()
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + sep + 'dsh-app-skills-host-'))
    await fs.rm(parent, { recursive: true, force: true })
  })
  return { parent, home, profile, cwd, userHome, ctx, manager, entries, agents, routes, events, disposers, options }
}

async function skill(path, name, flags = '', body) {
  await fs.mkdir(path, { recursive: true })
  await fs.writeFile(join(path, 'SKILL.md'), raw(name, flags, body))
}

test('full documents retain metadata and canonical invocation flags without evaluating YAML tags', () => {
  const text = raw('sample', 'disable-model-invocation: true\nuser-invocable: false\nmetadata:\n  category: local\n', 'Body')
  const parsed = parseSkillDocument(text, 'sample')
  assert.deepEqual(parsed.invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(parsed.metadata.category, 'local')
  assert.equal(parsed.raw, text)
  assert.throws(() => parseSkillDocument(raw('sample', 'modelInvocable: true\n'), 'sample'), /Use disable/)
  assert.throws(() => parseSkillDocument(raw('sample', 'name: duplicate\n'), 'sample'), /invalid/)
  assert.equal(parseSkillDocument(raw('sample', 'example: !!js process.exit(99)\n'), 'sample').name, 'sample')
})

test('old source and skill policy, official custom paths and duplicate fallback remain effective', async t => {
  const f = await fixture(t), custom = join(f.parent, 'custom')
  await skill(join(f.home, 'skills', 'shared'), 'shared')
  await skill(join(f.userHome, '.codex', 'skills', 'shared'), 'shared', '', 'Codex winner')
  await skill(join(custom, 'custom-skill'), 'custom-skill')
  await fs.mkdir(join(f.home, 'skills-manager'))
  await fs.writeFile(f.manager.legacyFile, JSON.stringify({ version: 1, sources: { dsh: false }, disabledSkills: {}, enabledSkills: {} }))
  f.entries.push({ entryId: 'custom-provider', moduleName: '@deepseek-ai/dsh-skill-filesystem', enabled: true, fiberPhase: 'active' })
  f.ctx.settings.describe = () => [{ ns: 'custom-provider', value: { customSkillDirs: [custom] } }]
  const candidates = await f.ctx.skills.providers.get('dsh-app-skills').list({ cwd: f.cwd })
  const chosen = candidates.find(item => item.name === 'shared')
  assert.equal(chosen.invocation.modelInvocable, true)
  assert.equal(chosen.rank, 399)
  assert.equal((await f.ctx.skills.get('shared', { cwd: f.cwd })).content, 'Codex winner')
  const state = await f.manager.state(f.cwd)
  assert.equal(state.libraries.find(item => item.path === custom).writable, false)
  assert.equal(state.skills.find(item => item.name === 'custom-skill').canEdit, false)
  assert.equal(state.libraries.find(item => item.id === 'dsh').enabled, false)
})

test('damaged previous policy fails closed without replacing its file', async t => {
  const f = await fixture(t)
  await skill(join(f.home, 'skills', 'sample'), 'sample')
  await fs.mkdir(join(f.home, 'skills-manager'))
  const broken = JSON.stringify({ version: 1, sources: [], disabledSkills: {}, enabledSkills: 4 })
  await fs.writeFile(f.manager.legacyFile, broken)
  const state = await f.manager.state(f.cwd)
  assert.equal(state.skills[0].enabled, false)
  assert.equal(state.skills[0].canToggle, false)
  assert.match(state.warnings[0].error, /invalid/)
  assert.equal((await f.ctx.skills.get('sample', { cwd: f.cwd })).invocation.modelInvocable, false)
  await assert.rejects(f.manager.action({ action: 'set-enabled', uri: state.skills[0].uri, enabled: true, cwd: f.cwd }), /invalid/)
  assert.equal(await fs.readFile(f.manager.legacyFile, 'utf8'), broken)
})

test('a model-only external skill keeps its command disabled while model toggles leave its file unchanged', async t => {
  const f = await fixture(t), path = join(f.userHome, '.codex', 'skills', 'model-only')
  await skill(path, 'model-only', 'disable-model-invocation: false\nuser-invocable: false\n')
  const original = await fs.readFile(join(path, 'SKILL.md'))
  const row = (await f.manager.state(f.cwd)).skills.find(item => item.name === 'model-only')
  assert.deepEqual([row.enabled, row.modelInvocable, row.userInvocable, row.managerEnabled], [true, true, false, true])
  let detail = await f.manager.detail(row.uri, f.cwd)
  assert.deepEqual([detail.enabled, detail.modelInvocable, detail.userInvocable], [true, true, false])
  assert.deepEqual((await f.ctx.skills.get('model-only', { cwd: f.cwd })).invocation, { modelInvocable: true, userInvocable: false })
  await f.manager.action({ action: 'set-enabled', uri: row.uri, enabled: false, cwd: f.cwd })
  assert.deepEqual((await f.ctx.skills.get('model-only', { cwd: f.cwd })).invocation, { modelInvocable: false, userInvocable: false })
  await f.manager.action({ action: 'set-enabled', uri: row.uri, enabled: true, cwd: f.cwd })
  detail = await f.manager.detail(row.uri, f.cwd)
  assert.deepEqual([detail.enabled, detail.modelInvocable, detail.userInvocable], [true, true, false])
  assert.deepEqual((await f.ctx.skills.get('model-only', { cwd: f.cwd })).invocation, { modelInvocable: true, userInvocable: false })
  assert.deepEqual(await fs.readFile(join(path, 'SKILL.md')), original)
})

test('create, revision-protected edit and model toggle use the real file and preserve body metadata', async t => {
  const f = await fixture(t)
  const created = await f.manager.action({ action: 'create', name: 'sample', description: 'Example', content: 'Instructions', cwd: f.cwd })
  assert.ok(created.uri)
  await assert.rejects(f.manager.action({ action: 'create', name: 'sample', description: 'Example', content: 'Duplicate', cwd: f.cwd }), /already exists/)
  let detail = await f.manager.detail(created.uri, f.cwd)
  await f.manager.action({ action: 'set-enabled', uri: created.uri, enabled: false, cwd: f.cwd })
  await assert.rejects(f.manager.action({ action: 'edit', uri: created.uri, content: detail.content.replace('Instructions', 'Edited'), revision: detail.revision, cwd: f.cwd }), { status: 409 })
  detail = await f.manager.detail(created.uri, f.cwd)
  await f.manager.action({ action: 'edit', uri: created.uri, content: detail.content.replace('Instructions', 'Edited'), revision: detail.revision, cwd: f.cwd })
  const definition = await f.ctx.skills.get('sample', { cwd: f.cwd })
  assert.equal(definition.content, 'Edited')
  assert.equal(definition.invocation.modelInvocable, false)
  detail = await f.manager.detail(created.uri, f.cwd)
  await f.manager.action({ action: 'edit', uri: created.uri, content: detail.content.replace('disable-model-invocation: true', 'disable-model-invocation: false'), revision: detail.revision, cwd: f.cwd })
  assert.equal((await f.ctx.skills.get('sample', { cwd: f.cwd })).invocation.modelInvocable, true)
  await assert.rejects(f.manager.detail('../../outside', f.cwd), { status: 404 })
})

test('imports publish full resources, skip conflicts and report invalid documents without overwriting', async t => {
  const f = await fixture(t), source = join(f.parent, 'source')
  await skill(join(source, 'sample'), 'sample')
  await fs.mkdir(join(source, 'sample', 'scripts'))
  await fs.writeFile(join(source, 'sample', 'scripts', 'never-run.mjs'), 'throw new Error("must not run")')
  await fs.mkdir(join(source, 'broken'))
  await fs.writeFile(join(source, 'broken', 'SKILL.md'), 'Invalid')
  const result = await f.manager.action({ action: 'import', source, cwd: f.cwd })
  assert.equal(result.count, 1)
  assert.equal(result.result.failed.length, 1)
  assert.equal(await fs.readFile(join(f.home, 'skills', 'sample', 'scripts', 'never-run.mjs'), 'utf8'), 'throw new Error("must not run")')
  const again = await f.manager.action({ action: 'import', source, cwd: f.cwd })
  assert.deepEqual(again.result.skipped, ['sample'])
  assert.equal(again.count, 0)
  assert.deepEqual(await fs.readdir(join(f.home, 'skills', '.dsh-app-staging')), [])
})

test('nested skill deletion and restore preserve bytes; restoration refuses a replaced junction ancestor', async t => {
  const f = await fixture(t), path = join(f.home, 'skills', 'group', 'sample')
  await skill(path, 'sample', 'disable-model-invocation: true\n')
  const original = await fs.readFile(join(path, 'SKILL.md'))
  await fs.mkdir(join(path, 'assets'))
  await fs.writeFile(join(path, 'assets', 'data.bin'), Buffer.from([0, 1, 255]))
  let state = await f.manager.state(f.cwd)
  let deleted = await f.manager.action({ action: 'delete', uri: state.skills[0].uri, cwd: f.cwd })
  assert.equal((await f.manager.state(f.cwd)).trash.length, 1)
  await f.manager.action({ action: 'restore', id: deleted.result.id, cwd: f.cwd })
  assert.deepEqual(await fs.readFile(join(path, 'SKILL.md')), original)
  assert.deepEqual(await fs.readFile(join(path, 'assets', 'data.bin')), Buffer.from([0, 1, 255]))
  state = await f.manager.state(f.cwd)
  deleted = await f.manager.action({ action: 'delete', uri: state.skills[0].uri, cwd: f.cwd })
  const outside = join(f.parent, 'outside')
  await fs.mkdir(outside)
  await fs.rmdir(join(f.home, 'skills', 'group'))
  await fs.symlink(outside, join(f.home, 'skills', 'group'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(f.manager.action({ action: 'restore', id: deleted.result.id, cwd: f.cwd }), /cannot contain links/)
  assert.deepEqual(await fs.readdir(outside), [])
  assert.equal((await f.manager.state(f.cwd)).trash.length, 1)
})

test('provider work settles when the caller or registration aborts without cancelling another catalog scan', async t => {
  const f = await fixture(t), lifecycle = new AbortController(), caller = new AbortController()
  const provider = f.manager.provider({ signal: lifecycle.signal, invalidate() {} })
  let release
  f.manager.scan = () => new Promise(resolve => { release = resolve })
  const reading = provider.list({ cwd: f.cwd, signal: caller.signal })
  await new Promise(resolve => setImmediate(resolve))
  caller.abort(new Error('caller cancelled'))
  await assert.rejects(reading, /caller cancelled/)
  release({ cwd: f.cwd, skills: [] })
  const second = provider.list({ cwd: f.cwd })
  await new Promise(resolve => setImmediate(resolve))
  lifecycle.abort(new Error('registration disposed'))
  await assert.rejects(second, /registration disposed/)
  release({ cwd: f.cwd, skills: [] })
})

test('active previous manager retains ownership; integration contributes again after its removal', async t => {
  const f = await fixture(t)
  await skill(join(f.home, 'skills', 'sample'), 'sample')
  f.entries.push({ moduleName: '@michengai/dsh-skills-manager', enabled: true, fiberPhase: 'active' })
  assert.deepEqual(await f.ctx.skills.providers.get('dsh-app-skills').list({ cwd: f.cwd }), [])
  const state = await f.manager.state(f.cwd)
  assert.equal(state.skills[0].canToggle, false)
  await assert.rejects(f.manager.action({ action: 'set-enabled', uri: state.skills[0].uri, enabled: false, cwd: f.cwd }), /previous Skills Manager/)
  f.entries.length = 0
  f.manager.invalidation()
  assert.equal((await f.ctx.skills.get('sample', { cwd: f.cwd })).provider, 'dsh-app-skills')
})

test('routes authenticate, accept the current host origin and register existing and future agent providers', async t => {
  const f = await fixture(t)
  await f.manager.close()
  f.ctx.skills.providers.clear()
  const existing = { id: 'existing', ctx: { get: () => registry() } }, futureRegistry = registry()
  const existingRegistry = registry(); existing.ctx.get = () => existingRegistry
  f.agents.push(existing)
  const manager = installSkills(f.ctx, f.options)
  t.after(() => manager.close())
  assert.equal(existingRegistry.providers.size, 1)
  const future = { id: 'future', ctx: { get: () => futureRegistry } }
  for (const listener of f.events.get('agent/created')) listener({ agent: future })
  assert.equal(futureRegistry.providers.size, 1)
  for (const listener of f.events.get('agent/disposed')) listener({ agent: future })
  assert.equal(futureRegistry.providers.size, 0)
  const handler = f.routes.get('/dsh-app/skills/action.json')
  async function request(origin, host, rejection) {
    const req = Readable.from([Buffer.from(JSON.stringify({ action: 'create', name: 'routed', description: 'Example', content: 'Body', cwd: f.cwd }))])
    Object.assign(req, { method: 'POST', url: '/dsh-app/skills/action.json', headers: { origin, host, 'content-type': 'application/json' } })
    f.ctx.connection.requestRejection = () => rejection
    const response = { writeHead(code) { this.status = code }, end(body) { this.body = body } }
    await handler(req, response)
    return response
  }
  assert.equal((await request('http://localhost:19876', 'localhost:19876', 401)).status, 401)
  assert.equal((await request('http://evil.example', 'localhost:19876')).status, 403)
  assert.equal((await request('http://localhost:19876', 'localhost:19876')).status, 200)
})

test('released rc.2 registry and scoped agent layers load owned filesystem definitions', async t => {
  const runtime = process.env.DSH_APP_TEST_RUNTIME
  if (!runtime) { t.skip('DSH_APP_TEST_RUNTIME selects the released artifact for the integration check'); return }
  const f = await fixture(t)
  const load = name => import(pathToFileURL(join(runtime, 'node_modules', '@deepseek-ai', name, 'lib', 'index.js')).href)
  const [{ Context }, { default: SkillRegistry }, { createScope }] = await Promise.all([load('cordis'), load('dsh-skill'), load('dsh-scope')])
  const root = new Context()
  const serviceFiber = await root.plugin(SkillRegistry)
  t.after(() => serviceFiber.dispose())
  await skill(join(f.home, 'skills', 'actual'), 'actual', 'disable-model-invocation: true\n', 'Real API body')
  const scopes = [], agents = []
  const fixtures = await root.plugin({ name: 'test-services', apply(ctx) {
    ctx.provide('sessions', f.ctx.sessions)
    ctx.provide('webServer', f.ctx.webServer)
    ctx.provide('connection', f.ctx.connection)
    ctx.provide('agents', { list: () => agents })
  } })
  t.after(() => fixtures.dispose())
  const install = { name: 'test-own-skills', inject: ['skills', 'sessions', 'webServer', 'connection', 'agents'], apply(ctx) {
    for (const id of ['existing-agent', 'second-agent']) {
      const key = {}, scope = createScope(ctx, key)
      scopes.push({ ...scope, key }); agents.push({ id, ctx: scope.ctx })
    }
    installSkills(ctx, f.options)
  } }
  const installed = await root.plugin(install)
  t.after(() => installed.dispose())
  const catalog = await root.skills.snapshot({ cwd: f.cwd })
  assert.equal(catalog.complete, true)
  assert.equal(catalog.skills.find(item => item.name === 'actual').provider, 'dsh-app-skills')
  assert.equal((await root.skills.get('actual', { cwd: f.cwd })).content, 'Real API body')
  for (const scope of scopes) {
    const competing = { name: 'actual', description: 'Scoped competing provider', invocation: { modelInvocable: true, userInvocable: true },
      provider: 'scoped-filesystem', source: 'user-dsh', rank: 400, locator: null }
    scope.ctx.get('skills').registerProvider(() => ({ name: 'scoped-filesystem', list: async () => [competing], get: async () => ({ ...competing, content: 'Competing body' }) }))
    const loaded = await root.skills.get('actual', { cwd: f.cwd, scope: scope.key })
    assert.equal(loaded.invocation.modelInvocable, false)
    assert.equal(loaded.content, 'Real API body')
    assert.equal(loaded.provider, 'dsh-app-skills')
  }
} )
