import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { redact, StartupLog } from '../desktop/startup-log.mjs'

test('a split launch token is never published before its complete line can be redacted', () => {
  const log = new StartupLog()
  log.append('stdout', '\u001b[32m插件加载中\u001b[0m\nhttp://127.0.0.1:3080/?token=first-')
  assert.deepEqual(log.snapshot().entries.map(entry => entry.text), ['插件加载中'])
  log.append('stderr', 'warning: optional plugin unavailable\r\n')
  log.append('stdout', 'second\n')
  assert.equal(log.snapshot().entries.at(-1).text, 'http://127.0.0.1:3080/?token=[redacted]')
  assert.doesNotMatch(log.text(), /first-|second|\u001b/)
})

test('the visible transcript retains stream identity, command output and sanitized diagnostics', () => {
  const log = new StartupLog()
  log.line('system', '启动后端：dsh --profile web --no-open')
  log.append('stdout', '\u001b[32m正在加载插件\u001b[0m\n')
  log.append('stderr', 'Plugin warning: optional service unavailable\n')
  log.append('stdout', 'http://127.0.0.1:3080/?token=launch-secret\n')
  log.append('stderr', 'Authorization: Bearer access-secret\n')
  log.append('stdout', '{"api_key": "secret-key", "password": "private"}\n')
  log.append('stdout', '后端已就绪')
  log.flush('stdout')
  const actual = log.snapshot().entries.map(({ stream, text }) => ({ stream, text }))
  const expected = JSON.parse(readFileSync(new URL('./startup-log.snapshot.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected)
})

test('oversized unterminated output and a long log stream stay bounded', () => {
  const log = new StartupLog()
  log.append('stdout', 'api_key=' + 'x'.repeat(500000))
  log.append('stdout', 'continuation-that-must-not-escape\n')
  assert.equal(log.snapshot().entries[0].text, 'api_key=[redacted]')
  for (let index = 0; index < 1500; index++) log.line('stdout', `${index} ${'启动日志'.repeat(75)}`)
  const state = log.snapshot()
  assert.ok(state.omitted > 0)
  assert.ok(state.entries.length <= 1000)
  assert.ok(state.entries.reduce((total, entry) => total + Buffer.byteLength(entry.text, 'utf8'), 0) <= 128 * 1024)
  assert.match(state.entries.at(-1).text, /^1499 /)
})

test('retry clears failed output and partial lines while preserving monotonic snapshot revisions', () => {
  const log = new StartupLog()
  log.append('stderr', 'failure\nold partial')
  log.status('error', '启动失败')
  const failed = log.snapshot()
  log.reset()
  log.append('stderr', 'new attempt\n')
  log.flush('stderr')
  const next = log.snapshot()
  assert.ok(next.revision > failed.revision)
  assert.ok(next.run > failed.run)
  assert.equal(next.phase, 'loading')
  assert.equal(next.finishedAt, null)
  assert.deepEqual(next.entries.map(entry => entry.text), ['new attempt'])
})

test('log copying strips terminal hyperlinks and common credentials without altering ordinary paths', () => {
  const output = redact('D:\\deepseek-harness\nhttps://user:pass@example.test/path\nDEEPSEEK_API_KEY=sk-123456789\n\u001b]8;;https://example.test\u0007link\u001b]8;;\u0007')
  assert.equal(output, 'D:\\deepseek-harness\nhttps://[redacted]@example.test/path\nDEEPSEEK_API_KEY=[redacted]\nlink')
})
