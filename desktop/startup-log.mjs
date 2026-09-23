import { stripVTControlCharacters } from 'node:util'

const MAX_LINES = 1000
const MAX_BYTES = 128 * 1024
const MAX_LINE = 8192

/** Remove terminal controls and common credentials before displaying or copying logs. */
export function redact(text) {
  return stripVTControlCharacters(String(text))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/([?&](?:[\w-]*token|api[_-]?key|key|auth|secret|password)=)[^\s"'&#]+/gi, '$1[redacted]')
    .replace(/(\bauthorization["']?\s*[:=]\s*["']?)(?:Bearer|Basic)\s+[^\s"',;]+/gi, '$1[redacted]')
    .replace(/(["']?(?:[\w-]+[_-])?(?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&]+)/gi, '$1[redacted]')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, '[redacted]')
}

/** Bounded, line-buffered stdout/stderr transcript; snapshots never contain raw credentials. */
export class StartupLog {
  constructor(onChange = () => {}) {
    this.onChange = onChange
    this.revision = 0
    this.sequence = 0
    this.run = 0
    this.reset()
  }

  /** Start a new attempt without carrying incomplete output over from the previous attempt. */
  reset() {
    this.run++
    this.startedAt = Date.now()
    this.finishedAt = null
    this.phase = 'loading'
    this.message = ''
    this.recoveryAvailable = false
    this.entries = []
    this.bytes = 0
    this.omitted = 0
    this.pending = new Map()
    this.changed()
  }

  changed() {
    this.revision++
    this.onChange()
  }

  /** Set loading, stopped, or error state while retaining the current transcript. */
  status(phase, message) {
    this.phase = phase
    this.message = redact(message)
    this.finishedAt = phase === 'loading' ? null : Date.now()
    this.changed()
  }

  /** Offer rollback only when the desktop has retained a pre-update snapshot. */
  recovery(available) {
    this.recoveryAvailable = available
    this.changed()
  }

  /** Consume decoded stream chunks. Partial lines stay private until newline or flush. */
  append(stream, chunk) {
    const parts = String(chunk).split(/\r\n|\r|\n/)
    let pending = this.pending.get(stream) ?? ''
    for (let index = 0; index < parts.length; index++) {
      pending += parts[index].slice(0, Math.max(0, MAX_LINE - pending.length))
      if (index < parts.length - 1) {
        this.line(stream, pending)
        pending = ''
      }
    }
    this.pending.set(stream, pending)
  }

  /** Publish a final unterminated line only after its stream reaches EOF. */
  flush(stream) {
    const pending = this.pending.get(stream)
    if (pending) this.line(stream, pending)
    this.pending.delete(stream)
  }

  /** Append one sanitized line, dropping oldest entries to bound memory and IPC payloads. */
  line(stream, value) {
    const text = redact(String(value).slice(0, MAX_LINE))
    if (!text.trim()) return
    this.entries.push({ id: ++this.sequence, elapsed: Date.now() - this.startedAt, stream, text })
    this.bytes += Buffer.byteLength(text, 'utf8')
    while (this.entries.length > MAX_LINES || this.bytes > MAX_BYTES) {
      this.bytes -= Buffer.byteLength(this.entries.shift().text, 'utf8')
      this.omitted++
    }
    this.changed()
  }

  /** Return a serializable revision for preload subscriptions and reload recovery. */
  snapshot() {
    return {
      revision: this.revision, run: this.run, startedAt: this.startedAt, finishedAt: this.finishedAt,
      phase: this.phase, message: this.message, omitted: this.omitted, entries: [...this.entries],
      ...(this.recoveryAvailable ? { recoveryAvailable: true } : {}),
    }
  }

  /** Copy the same sanitized transcript that is available to the startup page. */
  text() {
    return this.entries.map(entry => `[${(entry.elapsed / 1000).toFixed(3)}s] [${entry.stream}] ${entry.text}`).join('\n')
  }
}
