/** Compose desktop and browser diagnostics from shared, credential-free records. */
import { join } from 'node:path'
import { readJson } from './files.mjs'
import { readModelConfiguration } from './model-audit.mjs'
import { pluginDiagnostics, logTail } from './plugin-diagnostics.mjs'
import { redact } from '../desktop/startup-log.mjs'

/** Read current configuration alongside retained audit, probe and startup results. */
export async function maintenanceReport({ home, profile, directory, recovery }) {
  const errors = []
  const read = async (label, operation, empty) => {
    try {
      return await operation
    } catch (error) {
      errors.push(`${label}: ${redact(String(error))}`)
      return empty
    }
  }
  const [plugins, models, audit, check, startup, startupFailure, recoveryActions] = await Promise.all([
    read('Plugins', pluginDiagnostics(profile, directory), { plugins: [], revision: null }),
    read('Models', readModelConfiguration(home, profile), { sources: [] }),
    read('Model history', readJson(join(directory, 'model-audit.json'), { history: [] }), { history: [] }),
    read('Functional check', readJson(join(directory, 'functional-check.json'), null), null),
    read('Startup log', logTail(join(directory, 'last-startup.log'), 16 * 1024), ''),
    read('Startup failure', logTail(join(directory, 'last-startup-failure.log'), 16 * 1024), ''),
    read('Recovery actions', Promise.resolve().then(() => recovery?.() ?? {}), {})
  ])
  return {
    schemaVersion: 1,
    at: new Date().toISOString(),
    ...plugins,
    models: models.sources,
    history: audit.history,
    check,
    startup,
    startupFailure,
    recovery: recoveryActions,
    errors
  }
}
