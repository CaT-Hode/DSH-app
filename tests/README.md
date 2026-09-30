# Focused development checks

Install development dependencies with pnpm; skip Electron scripts and optional downloads:

```powershell
pnpm install --ignore-scripts --no-optional --config.auto-install-peers=false
```

Published API checks use a separately installed DSH 0.2.0-rc.2 runtime. The test-only resolution hook binds every DSH peer to that runtime, avoiding a second, incomplete peer graph:

```powershell
$env:DSH_APP_TEST_CORE_ROOT = 'C:\path\to\dsh-runtime'
$env:DSH_APP_TEST_RUNTIME = $env:DSH_APP_TEST_CORE_ROOT
npm run build
node --import ./tests/runtime-resolution.mjs --test tests/client-ui.spec.mjs tests/mcp-host.spec.mjs tests/mcp-ui.spec.mjs tests/sidebar-client.spec.mjs tests/sidebar-host.spec.mjs tests/sidebar-settings.spec.mjs tests/sidebar-settings-ui.spec.mjs tests/sidebar-settings-integration.spec.mjs
node --import ./tests/runtime-resolution.mjs --test tests/skills-host.spec.mjs tests/skills-ui.spec.mjs tests/skill-import.spec.mjs tests/context-insight.spec.mjs tests/cost-meter.spec.mjs tests/cost-ui.spec.mjs
node --test tests/market-host.spec.mjs tests/market-operations.spec.mjs tests/plugin-market-ui.spec.mjs tests/startup-theme.spec.mjs tests/theme-sync.spec.mjs
```

Browser checks use React, jsdom and the released SlotCore/module and locale runtimes. They exercise the built owner, public sidebar aliases, plugin subpages, missing package metadata, official uninstall callback replacement, MCP forms and preview revisions, recovery notices, model/command skill states and request cancellation. General settings checks cover workbench controls, contributed settings, serial edits, revision conflicts and unmount cleanup. A focused composition loads the built owner into the released General section and verifies its adapter, Input implementation and independent disposal; viewport portals and desktop observers remain outside this fixture. Host checks cover domain restoration, credential redaction, scoped routes, legacy-owner exclusion, Cordis child teardown, filesystem imports, accounting and session projections. No test requires the retired MCP or sidebar npm packages.

Theme checks execute the released theme presenter and emulate system media changes without changing OS settings. Startup checks include light/dark HTML and source changes whose resolved color is unchanged. These checks do not send model messages, grant OAuth permissions or establish external server availability. Native-window acceptance and live profile preservation are separate deployment checks.
