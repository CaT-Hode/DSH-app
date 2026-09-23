/** A DSH plugin manager asks its desktop parent to install recorded versions before restarting the Host. */
export const APPLY_PLUGIN_UPDATES = 'apply-plugin-updates'

const BOUND_SEND = Symbol.for('dsh.desktop.bound-parent-send')

/** Preserve callback signatures and report closed-channel failures without unhandled error events. */
export function bindParentIpc() {
  if (typeof process.send !== 'function' || process.send[BOUND_SEND]) return
  const nativeSend = process.send.bind(process)
  const send = (message, handle, options, callback) => {
    if (typeof handle === 'function') { callback = handle; handle = undefined; options = undefined }
    else if (typeof options === 'function') { callback = options; options = undefined }
    const complete = typeof callback === 'function' ? callback : error => {
      if (error) process.stderr.write(`[DSH IPC] 消息未送达：${error.code || error.message}\n`)
    }
    return nativeSend(message, handle, options, complete)
  }
  Object.defineProperty(send, BOUND_SEND, { value: true })
  process.send = send
}
