import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'

export const name = 'dsh-app-host'
export const inject = ['webServer', 'connection']

export function apply(ctx) {
  // Standalone Web launches must trust the same Windows roots as the desktop.
  if (process.platform === 'win32' && getCACertificates && setDefaultCACertificates) {
    setDefaultCACertificates([...getCACertificates('default'), ...getCACertificates('system')])
  }
  const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'))
  const directory = join(home, 'dsh-app')
  const filename = join(directory, 'web.json')
  const runtimeFile = join(directory, 'runtime.json')
  const ownerId = process.env.DSH_APP_OWNER
  if (ownerId) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-app/shutdown',
    handler(request, response) {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (request.headers['x-dsh-app-owner'] !== ownerId) { response.writeHead(403); response.end(); return }
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
      const instance = { schemaVersion: 1, profile: 'web', pid: process.pid, origin, url: ctx.connection.authenticatedUrl(origin), ...(ownerId ? { ownerId } : {}) }
      mkdirSync(directory, { recursive: true })
      const runtime = { schemaVersion: 1, cli: process.argv[1], node: process.execPath, cwd: process.cwd(), execArgv: process.execArgv }
      const runtimeTemporary = `${runtimeFile}.${process.pid}.tmp`
      writeFileSync(runtimeTemporary, JSON.stringify(runtime), { mode: 0o600 })
      renameSync(runtimeTemporary, runtimeFile)
      const temporary = `${filename}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(instance), { mode: 0o600 })
      renameSync(temporary, filename)
      if (process.connected) process.send?.({ type: 'dsh-app-ready', instance })
    }).catch(error => {
      if (process.connected) process.send?.({ type: 'dsh-app-fatal', message: String(error) })
      else console.error('DSH App connection registration failed:', error)
    })
    return () => {
      disposed = true
      process.off('exit', removeRecord)
      removeRecord()
    }
  })
}
