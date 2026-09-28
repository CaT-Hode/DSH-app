/** Authenticated, read-only Web diagnostics and lifecycle-owned model observations. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ModelAudit } from './model-audit.mjs'
import { maintenanceReport } from './maintenance-report.mjs'
import { readJson } from './files.mjs'
import { redact } from '../desktop/startup-log.mjs'

/** Mount diagnostics with the same authentication as Web; disposal drains the active observation. */
export function installMaintenance(
  ctx,
  { home, profile, directory, auditIntervalMs = 2000, historyLimit = 200 }
) {
  if (!Number.isInteger(auditIntervalMs) || auditIntervalMs < 500 || auditIntervalMs > 60000)
    throw new Error('auditIntervalMs must be 500–60000')
  const audit = new ModelAudit({ home, profile, directory, historyLimit })
  const html = readFileSync(new URL('./maintenance.html', import.meta.url))
  const script = readFileSync(new URL('./maintenance-ui.js', import.meta.url))
  for (const [path, content, type] of [
    ['/dsh-app/diagnostics', html, 'text/html; charset=utf-8'],
    ['/dsh-app/maintenance-ui.js', script, 'text/javascript; charset=utf-8']
  ])
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path,
        handler(request, response) {
          const rejection = ctx.connection.requestRejection(request)
          if (rejection !== undefined) {
            response.writeHead(rejection)
            response.end()
            return
          }
          if (request.method !== 'GET') {
            response.writeHead(405)
            response.end()
            return
          }
          response.writeHead(200, {
            'content-type': type,
            'cache-control': 'no-store',
            'content-security-policy':
              "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'"
          })
          response.end(content)
        }
      })
    )
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-app/diagnostics.json',
      async handler(request, response) {
        const rejection = ctx.connection.requestRejection(request)
        if (rejection !== undefined) {
          response.writeHead(rejection)
          response.end()
          return
        }
        if (request.method !== 'GET') {
          response.writeHead(405)
          response.end()
          return
        }
        try {
          const report = await maintenanceReport({ home, profile, directory })
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          response.end(JSON.stringify(report))
        } catch (error) {
          response.writeHead(500, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: redact(String(error)) }))
        }
      }
    })
  )
  if (process.env.DSH_APP_PROBE === '1') return
  ctx.effect(() => {
    let operation = Promise.resolve(),
      running = false,
      disposed = false,
      lastError
    const observe = () => {
      if (running || disposed) return
      running = true
      operation = (async () => {
        const context = await readJson(join(directory, 'model-operation.json'), null)
        await audit.observe(
          context?.kind === 'upgrade'
            ? 'during-upgrade'
            : context?.kind === 'recovery'
              ? 'during-recovery'
              : 'external'
        )
        lastError = undefined
      })()
        .catch((error) => {
          const message = redact(String(error))
          if (message !== lastError) ctx.logger.warn(`DSH App model audit: ${message}`)
          lastError = message
        })
        .finally(() => {
          running = false
        })
    }
    observe()
    const timer = setInterval(observe, auditIntervalMs)
    timer.unref()
    return async () => {
      disposed = true
      clearInterval(timer)
      await operation
    }
  })
}
