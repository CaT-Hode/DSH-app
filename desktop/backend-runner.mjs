import { pathToFileURL } from 'node:url'
import { bindParentIpc } from './parent-ipc.mjs'

bindParentIpc()

const cli = process.argv[2]
if (!cli) throw new Error('DSH CLI entry path is required')
const port = process.argv[3] || '0'
process.argv = [process.execPath, cli, '--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', port]
const stop = () => {
  if (process.listenerCount('SIGTERM') > 0) process.emit('SIGTERM')
  else process.exit(0)
}
process.on('message', message => { if (message?.type === 'shutdown') stop() })
process.once('disconnect', stop)
const { runCli } = await import(pathToFileURL(cli).href)
await runCli()
