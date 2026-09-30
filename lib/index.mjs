import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'
import { installMaintenance } from './maintenance-host.mjs'
import { installCostMeter } from './cost-meter.mjs'
import { installContextInsight } from './context-insight.mjs'
import { installPluginMarket } from './market-host.mjs'
import { installSkills } from './skills-host.mjs'
import z from '@deepseek-ai/schemastery'
import { installMcp, Config as McpConfig } from './mcp/index.mjs'
import { installSidebar, SidebarConfig } from './sidebar/index.mjs'

export const name = 'dsh-app-host'
export const inject = ['webServer', 'webRuntime', 'connection', 'credentials', 'settings', 'llm', 'skills', 'sessions', 'pluginInventory', 'loader', 'tools', 'storageDomain', 'workspaceRegistry']
export const Config = z.object({ mcp: McpConfig, sidebar: SidebarConfig,
  auditIntervalMs: z.number().min(500).max(60000).default(2000), historyLimit: z.number().min(1).default(200),
  balance: z.any(), contextInsight: z.any(), market: z.any(), skills: z.any() })

export async function apply(ctx, config = {}) {
  // Standalone Web launches must trust the same Windows roots as the desktop.
  if (process.platform === 'win32' && getCACertificates && setDefaultCACertificates) {
    setDefaultCACertificates([...getCACertificates('default'), ...getCACertificates('system')])
  }
  const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'))
  const localOwner = process.env.DSH_LOCAL_DESKTOP_OWNER
  const appOwner = process.env.DSH_APP_OWNER
  if (localOwner && appOwner) throw new Error('Only one desktop carrier may own the DSH Host')
  const localDesktop = Boolean(localOwner)
  const directory = join(home, localDesktop ? 'desktop-link' : 'dsh-app')
  const filename = join(directory, 'web.json')
  const appDirectory = join(home, 'dsh-app')
  const runtimeFile = join(appDirectory, 'runtime.json')
  const ownerId = localOwner || appOwner
  const readyMessage = localDesktop ? 'dsh-shared-ready' : 'dsh-app-ready'
  const fatalMessage = localDesktop ? 'dsh-shared-fatal' : 'dsh-app-fatal'
  installMaintenance(ctx, { home, profile: join(home, 'profiles', 'web'), directory,
    auditIntervalMs:config.auditIntervalMs, historyLimit:config.historyLimit })
  installCostMeter(ctx, { home, balance: config.balance })
  installContextInsight(ctx, config.contextInsight)
  installPluginMarket(ctx, { home, profile: join(home, 'profiles', 'web'), directory, market: config.market })
  installSkills(ctx, { home, profile: join(home, 'profiles', 'web'), directory, skills: config.skills })
  await installMcp(ctx, { mcp: config.mcp })
  const inventory = await ctx.pluginInventory.list()
  if (!inventory.entries.some(row => row.moduleName === 'dsh-better-sidebar' && row.enabled)) installSidebar(ctx, config.sidebar)
  if (ownerId) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: localDesktop ? '/dsh-desktop/shutdown' : '/dsh-app/shutdown',
    handler(request, response) {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (request.headers[localDesktop ? 'x-dsh-desktop-owner' : 'x-dsh-app-owner'] !== ownerId) { response.writeHead(403); response.end(); return }
      response.writeHead(202, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
      setTimeout(() => process.emit('SIGTERM'), 100)
    },
  }))
  ctx.effect(() => {
    let disposed = false
    const removeRecord = () => {
      let record
      try { record = JSON.parse(readFileSync(filename, 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') return; throw error }
      if (record.pid === process.pid) unlinkSync(filename)
    }
    // A sibling's failed disposer may force process exit before this effect drains.
    process.on('exit', removeRecord)
    const ready = ctx.get('loader')?.await() ?? Promise.resolve()
    void ready.then(() => {
      if (disposed) return
      const origin = `http://127.0.0.1:${ctx.webServer.port}`
      const cli = process.argv[1]
      const manifest = JSON.parse(readFileSync(join(dirname(cli), '..', 'package.json'), 'utf8'))
      if (manifest.name !== '@deepseek-ai/dsh' || typeof manifest.version !== 'string') throw new Error('DSH core identity is invalid')
      const instance = { schemaVersion: 1, profile: 'web', pid: process.pid, coreVersion: manifest.version, origin, url: ctx.connection.authenticatedUrl(origin), ...(ownerId ? { ownerId } : {}) }
      mkdirSync(directory, { recursive: true })
      mkdirSync(appDirectory, { recursive: true })
      const runtime = { schemaVersion: 1, cli, node: process.execPath, cwd: process.cwd(), execArgv: process.execArgv }
      const runtimeTemporary = `${runtimeFile}.${process.pid}.tmp`
      writeFileSync(runtimeTemporary, JSON.stringify(runtime), { mode: 0o600 })
      renameSync(runtimeTemporary, runtimeFile)
      const temporary = `${filename}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(instance), { mode: 0o600 })
      renameSync(temporary, filename)
      if (process.connected) process.send?.({ type: readyMessage, instance })
    }).catch(error => {
      if (process.connected) process.send?.({ type: fatalMessage, message: String(error) })
      else console.error('DSH App connection registration failed:', error)
    })
    return () => {
      disposed = true
      process.off('exit', removeRecord)
      removeRecord()
    }
  })
}
