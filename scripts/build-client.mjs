/** Emit the closure factory consumed by DSH client-modules. */
import { readFileSync, writeFileSync } from 'node:fs'

const source = readFileSync(new URL('../client/plugin.mjs', import.meta.url), 'utf8')
const css = readFileSync(new URL('../client/style.css', import.meta.url), 'utf8')
const contextSource = readFileSync(new URL('../client/context-insight.mjs', import.meta.url), 'utf8')
const contextFactory = contextSource.replace('export default function createContextInsightClient', 'function createContextInsightClient')
if (contextFactory === contextSource) throw new Error('DSH App context factory entry is missing')
const linkedSource = source.replace(/^import createContextInsightClient from '\.\/context-insight\.mjs'\r?\n/m, '')
if (linkedSource === source) throw new Error('DSH App context factory import is missing')
const factory = linkedSource.replace('export default function createDshAppClient', 'function createDshAppClient')
if (factory === linkedSource) throw new Error('DSH App client factory entry is missing')
writeFileSync(new URL('../lib/client.js', import.meta.url), `window.__ModuleLoader__.load({\n  id: 'dsh-app',\n  factory: (require) => {\n${contextFactory}\n${factory}\n    return createDshAppClient(require, ${JSON.stringify(css)});\n  },\n});\n`)
process.stdout.write('Built DSH App client bundle\n')
