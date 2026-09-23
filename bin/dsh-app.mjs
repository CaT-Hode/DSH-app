#!/usr/bin/env node
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write('Usage: dsh-app [--open-web] [--quit]\nLaunch the DSH App Electron window for the installed web profile.\n')
  process.exit(0)
}
if (process.argv.includes('--version')) {
  process.stdout.write(`${pkg.version}\n`)
  process.exit(0)
}

let executable = process.env.DSH_APP_ELECTRON
if (!executable) {
  try { executable = require('electron') }
  catch {
    process.stderr.write('Electron is unavailable. Install the optional electron dependency or set DSH_APP_ELECTRON to its executable path.\n')
    process.exit(1)
  }
}
const main = fileURLToPath(new URL('../desktop/main.mjs', import.meta.url))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(executable, [main, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  windowsHide: false,
})
child.on('error', error => { process.stderr.write(`DSH App could not start: ${error.message}\n`); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
