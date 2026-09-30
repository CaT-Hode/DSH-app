/** Resolve DSH peer APIs from the same released runtime used by artifact checks. */
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const runtime = process.env.DSH_APP_TEST_CORE_ROOT
if (!runtime) throw new Error('Set DSH_APP_TEST_CORE_ROOT to a supported released DSH runtime')
const runtimeParent = pathToFileURL(join(runtime, 'package.json')).href
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@deepseek-ai/')) return nextResolve(specifier, { ...context, parentURL: runtimeParent })
  return nextResolve(specifier, context)
} })
