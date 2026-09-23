import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../desktop/', import.meta.url)
const output = fileURLToPath(new URL('preload.cjs', root))
const base = readFileSync(new URL('preload-base.cjs', root), 'utf8')
const chrome = readFileSync(new URL('chrome.cjs', root), 'utf8')
writeFileSync(output, `${base}\n${chrome}`)
process.stdout.write(`Built ${output}\n`)
