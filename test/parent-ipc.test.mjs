import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'

const bridge = new URL('../desktop/parent-ipc.mjs', import.meta.url).href

async function childProgram(program, ipc = true) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { bindParentIpc } from ${JSON.stringify(bridge)};
    ${program}
  `], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] })
  const messages = []
  let stdout = ''
  let stderr = ''
  child.on('message', value => messages.push(value))
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const timer = setTimeout(() => child.kill(), 10000)
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  }).finally(() => clearTimeout(timer))
  assert.equal(code, 0, stderr)
  return { messages, stdout, stderr }
}

test('detached process.send works in a delayed plugin callback', async () => {
  const result = await childProgram(`
    bindParentIpc();
    const bound = process.send;
    bindParentIpc();
    assert.equal(process.send, bound);
    function requestDesktopHotUpdate(send = process.send) {
      if (typeof send !== 'function') return false;
      send('apply-plugin-updates');
      return true;
    }
    setTimeout(() => {
      assert.equal(requestDesktopHotUpdate(), true);
      process.disconnect();
    }, 20);
  `)
  assert.deepEqual(result.messages, ['apply-plugin-updates'])
  assert.equal(result.stderr, '')
})

test('send callback overloads keep acknowledgements and the native return value', async () => {
  const result = await childProgram(`
    bindParentIpc();
    const send = process.send;
    for (const [index, args] of [[0, []], [1, [null]], [2, [null, { keepOpen: true }]]]) {
      await new Promise((resolve, reject) => {
        const sent = send({ index }, ...args, error => error ? reject(error) : resolve());
        assert.equal(typeof sent, 'boolean');
      });
    }
    process.disconnect();
  `)
  assert.deepEqual(result.messages, [{ index: 0 }, { index: 1 }, { index: 2 }])
})

test('closed IPC reports failure to callbacks and logs unhandled delivery failures without crashing', async () => {
  const result = await childProgram(`
    bindParentIpc();
    const send = process.send;
    process.disconnect();
    await new Promise(resolve => {
      const result = send('after disconnect', error => {
        assert.equal(error.code, 'ERR_IPC_CHANNEL_CLOSED');
        resolve();
      });
      assert.equal(result, false);
    });
    assert.equal(send('no callback after disconnect'), false);
  `)
  assert.deepEqual(result.messages, [])
  assert.match(result.stderr, /DSH IPC.*ERR_IPC_CHANNEL_CLOSED/)
})

test('invalid IPC payloads still raise their native errors', async () => {
  await childProgram(`
    bindParentIpc();
    const send = process.send;
    assert.throws(() => send(undefined), { code: 'ERR_MISSING_ARGS' });
    assert.throws(() => send(() => {}), { code: 'ERR_INVALID_ARG_TYPE' });
    assert.throws(() => send('x', null, 123), { code: 'ERR_INVALID_ARG_TYPE' });
    process.disconnect();
  `)
})

test('standalone Web processes do not advertise a desktop IPC capability', async () => {
  await childProgram(`
    assert.equal(process.send, undefined);
    bindParentIpc();
    assert.equal(process.send, undefined);
  `, false)
})
