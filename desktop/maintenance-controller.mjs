/** Serialize checks and plugin recovery while retaining app-owned shutdown and restart behavior. */
import { join } from 'node:path'
import { maintenanceReport } from '../lib/maintenance-report.mjs'
import { changePluginActivation } from '../lib/plugin-diagnostics.mjs'
import { runFunctionalCheck, captureCapabilities } from '../lib/functional-check.mjs'
import { writeJson } from '../lib/files.mjs'

/** Owns one cancellable maintenance operation; Electron and the Host remain separate adapters. */
export class MaintenanceController {
  constructor({
    home,
    profile,
    directory,
    runtime,
    instance,
    canChange,
    recover,
    progress,
    onIdle,
    runner,
    timeout = 120000
  }) {
    if (!Number.isInteger(timeout) || timeout < 10000 || timeout > 600000)
      throw new Error('Functional check timeout must be 10000–600000 ms')
    Object.assign(this, {
      home,
      profile,
      directory,
      runtime,
      instance,
      canChange,
      recover,
      progress,
      onIdle,
      runner,
      timeout
    })
  }
  /** Read shared records, including when the backend cannot start. */
  read() {
    return maintenanceReport(this)
  }
  /** A check and a recovery cannot overlap or race a core or plugin upgrade. */
  action(request) {
    if (this.operation) throw new Error('Maintenance is already running')
    if (!request || !['check', 'plugin'].includes(request.kind))
      throw new Error('Invalid maintenance operation')
    this.canChange(request.kind)
    this.abort = new AbortController()
    this.operation = this.execute(request).finally(() => {
      this.operation = undefined
      this.abort = undefined
      this.onIdle?.()
    })
    return this.operation
  }
  async execute(request) {
    if (request.kind === 'check') {
      const instance = this.instance()
      const expected = instance
        ? await captureCapabilities(instance, { signal: this.abort.signal })
        : undefined
      return runFunctionalCheck({
        ...this,
        runtime: this.runtime(),
        expected,
        signal: this.abort.signal,
        onProgress: this.progress
      })
    }
    await writeJson(join(this.directory, 'model-operation.json'), { kind: 'recovery' })
    try {
      return await this.recover(() =>
        changePluginActivation({
          ...this,
          name: request.name,
          action: request.action,
          revision: request.revision
        })
      )
    } finally {
      await writeJson(join(this.directory, 'model-operation.json'), { kind: 'idle' })
    }
  }
  /** Wait for the probe process and its temporary files before the app exits. */
  async dispose() {
    this.abort?.abort(new Error('Application is closing'))
    try {
      await this.operation
    } catch {
      /* The initiating IPC request receives the operation error. */
    }
  }
}
