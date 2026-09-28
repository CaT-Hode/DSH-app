import { execFile } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

/** Use the candidate core's own resolver and compatibility rules without booting or changing the profile. */
export async function inspectCoreCompatibility(profile, cli, version) {
  // pnpm exposes the CLI through a junction; its sibling dependencies live beside the real entry.
  const entry = await realpath(cli)
  const require = createRequire(entry)
  const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  for (const name of ['evaluatePluginCompatibility', 'readProfileVersionExemptions', 'resolveBundleDir']) {
    if (typeof boot[name] !== 'function') throw new Error(`DSH ${version} 不支持升级前插件检查（${name}）。`)
  }
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles ?? []
  if (!Array.isArray(bundles) || bundles.some(name => typeof name !== 'string' || !PACKAGE_NAME.test(name))) {
    throw new Error('共享配置中的插件列表无效。')
  }
  const exemptions = boot.readProfileVersionExemptions(profile)
  const anchor = join(dirname(dirname(entry)), 'package.json')
  const issues = []
  for (const name of bundles) {
    try {
      const directory = boot.resolveBundleDir('dsh-app', name, anchor, profile)
      const plugin = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (!plugin.dsh?.bundle) throw new Error('缺少 dsh.bundle 声明')
      const issue = boot.evaluatePluginCompatibility(plugin, exemptions, version)
      if (issue && !issue.exempted) issues.push({ name, version: plugin.version, reason: '声明的 DSH 版本范围不兼容' })
    } catch (error) { issues.push({ name, reason: String(error).slice(0, 300) }) }
  }
  return { version, checked: bundles.length, issues }
}

/** Run third-party metadata resolution outside Electron's main process; failed or unavailable checks cancel the switch. */
export async function checkCoreCompatibility({ node, profile, cli, version, script = fileURLToPath(import.meta.url), timeout = 30000 }) {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  const { stdout } = await execute(node, [script, '--inspect-core', profile, cli, version], {
    env, windowsHide: true, timeout, maxBuffer: 256 * 1024,
  })
  const report = JSON.parse(stdout.trim())
  if (report.version !== version || !Array.isArray(report.issues)) throw new Error('DSH 插件兼容检查返回了无效结果。')
  if (report.issues.length) {
    const names = report.issues.slice(0, 12).map(issue => `${issue.name}${issue.version ? `@${issue.version}` : ''}：${issue.reason}`).join('\n')
    throw new Error(`DSH ${version} 的兼容检查未通过，${report.issues.length} 个已启用插件将无法正常加载：\n${names}${report.issues.length > 12 ? '\n…' : ''}\n请先在插件市场更新这些插件，再重试 DSH 更新。原版本仍在运行。`)
  }
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--inspect-core') {
  try { process.stdout.write(JSON.stringify(await inspectCoreCompatibility(...process.argv.slice(3)))) }
  catch (error) { process.stderr.write(String(error)); process.exitCode = 1 }
}
