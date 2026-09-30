/** Emit the shared browser factory and its public sidebar aliases. */
import { readFileSync, writeFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const factory = (path, name) => {
  const source = read(path).replace(/^import .*\r?\n/gm, '')
  const linked = source.replace(`export default function ${name}`, `function ${name}`).replaceAll('export function ', 'function ')
  if (linked === source) throw new Error(`Missing factory ${name}`)
  return linked
}
const factories = [
  factory('../client/context-insight.mjs', 'createContextInsightClient'),
  factory('../client/skills.mjs', 'createSkillsClient'),
  factory('../client/mcp.mjs', 'createMcpClient'),
  factory('../client/theme-sync.mjs', 'createThemeSyncClient'),
  factory('../lib/sidebar/upstream/client-factory.mjs', 'createOwnedSidebarEngine'),
  factory('../client/sidebar-bridge.mjs', 'createSidebarBridge'),
  factory('../client/plugin-pages.mjs', 'createPluginPagesClient'),
  factory('../client/plugin.mjs', 'createDshAppClient'),
].join('\n')
const bridge = factory('../client/sidebar-bridge.mjs', 'createSidebarBridge')
const css = read('../client/style.css') + '\n' + read('../client/mcp.css') + '\n' + read('../client/plugin-pages.css')
writeFileSync(new URL('../lib/client.js', import.meta.url), `(function () {\n${bridge}\nregisterSidebarAliases(window.__ModuleLoader__);\nwindow.__ModuleLoader__.load({\n  id: 'dsh-app',\n  factory: (require) => {\n${factories}\n    return createDshAppClient(require, ${JSON.stringify(css)});\n  },\n});\n})();\n`)
process.stdout.write('Built DSH App client bundle\n')
