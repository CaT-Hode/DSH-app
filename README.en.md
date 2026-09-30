<p align="center"><img src="desktop/DSH.svg" width="96" alt="DSH App whale icon"></p>
<h1 align="center">DSH App</h1>
<p align="center">A desktop window for DeepSeek Harness, sharing your Web plugins, settings and conversations.</p>
<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong> · <a href="https://github.com/CaT-Hode/DSH-app/releases">Releases</a> · <a href="https://github.com/CaT-Hode/DSH-app/issues">Report an issue</a></p>
<p align="center">
  <img src="https://img.shields.io/badge/DSH-Plugin-4d6bfe" alt="DSH plugin">
  <img src="https://img.shields.io/badge/Windows-Electron-1673c9" alt="Windows Electron">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT"></a>
</p>

DSH App is a community plugin for Windows. Install it into your existing `web` profile to open DeepSeek Harness in Electron. **Open in browser** connects to the same backend, retaining your installed plugins, conversations and settings. This is not the official DeepSeek desktop client.

[Features](#features) · [Demos](#demos) · [Installation](#installation) · [Usage](#usage) · [Update-and-uninstall](#update-and-uninstall) · [FAQ](#faq)

## Features

| Task | What DSH App provides |
| --- | --- |
| Use Desktop and Web together | One backend, one `web` profile, shared conversations and plugins |
| Open and close the app | Native window, whale tray and single-instance behavior; close to tray |
| Navigate the workbench | Integrated title bar, search, back/forward, action menu and window controls |
| Built-in client layout | Icon navigation rail, project and session sidebar, full conversation search, and rounded conversation and composer surfaces shared by desktop and Web |
| Recover from startup failures | Live backend logs and elapsed time; failed front-end loads return to a safe page with retry, diagnostics and backup-backed recovery actions |
| Update core and plugins | Core update button only when a newer release exists; installation, restart, configuration backup and recovery |
| Diagnose and recover | Plugin status and startup-failure logs, individual disable/retry, plugin-update recovery and rollback to a backed-up DSH version |
| Track model configuration | Original model IDs, ASS provider markers and observed configuration changes |
| Track cost and balance | Official DeepSeek API account balances, local tokens, model-usage estimates, budget reminders, and imported `dsh-cost-meter` history |
| Inspect context | Current-session occupancy and composition, request trends, tool timing, compactions and recent activity, integrated into Cost and usage |

The package owns its client layout, desktop window and maintenance features, with no Codex UI dependency. Official DSH services and components continue to handle projects, sessions, archiving, model selection and sending. Plugin markets, skills, MCP and other installed features remain available through the rail or More features menu. The bundle replaces only the sidebar shell; workspace, settings, conversation and right-panel plugins retain their existing slots.

Open Settings from the upper More features menu, or MCP from the outline puzzle icon. Both pages appear in the main area beside the session sidebar, retaining navigation and projects. Settings uses the official sections; MCP retains the connector's server configuration, marketplace and update controls. The native titlebar keeps navigation, shortcuts and window controls on the current theme background.

The inline settings presentation is verified with DSH `0.2.0-rc.2`, and the MCP presentation with `dsh-mcp-connector@0.2.63`. These adapters use the corresponding component slots and React element structures; other versions require revalidation.

Full-text search builds a local in-memory index on the first query, without contacting an external service or loading that index during cold startup. The first query can take longer than subsequent queries. Explicit profile search settings override the bundle default.

## Demos

**Desktop window and title bar**

![DSH App desktop and title bar](https://raw.githubusercontent.com/CaT-Hode/DSH-app/media/v0.2.0/desktop.gif)

**Diagnostics and functional checks**

![DSH App diagnostics and functional checks](https://raw.githubusercontent.com/CaT-Hode/DSH-app/media/v0.2.0/diagnostics.gif)

Recorded with real DSH `0.1.7-rc.2`, the stock Web interface and a separate demo home without personal conversations. GIFs show key frames captured in one run. The check sends no model messages; playback is paced to show the workflow, not to measure performance.

## Installation

### Prerequisites

- Windows, **Node.js 24+** and **pnpm 11**.
- An installed [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), with `dsh` available in your terminal.
- DSH App **0.3.0** targets the DSH **0.2.0-rc.2** client APIs. Its package version requirement prevents activation on older cores. Electron is **44**; run the functional check when using another core version.

### 1. Add the plugin

Run in PowerShell:

```powershell
dsh plugin --profile web add 'git+https://github.com/CaT-Hode/DSH-app.git'
```

This is a GitHub installation source. There is currently no npm release named `dsh-app` from this project. A `.tgz` downloaded from Releases can also be passed to `dsh plugin --profile web add`.

### 2. Activate it once

```powershell
dsh --profile web --no-open
```

Wait for the Web server to become ready. The plugin remembers the DSH launch entry. Press `Ctrl+C` to stop this foreground server.

### 3. Open the desktop app

```powershell
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
& (Join-Path $dshHome 'profiles\web\node_modules\.bin\dsh-app.cmd')
```

Use step 3 for later cold starts. Electron opens its own window; the backend console is hidden and its startup output appears inside the app.

<details>
<summary>Ask a local agent to install it</summary>

```text
Follow https://github.com/CaT-Hode/DSH-app to install DSH App into my existing web profile, preserving my configuration, models and plugins. Verify dsh, Node.js 24+ and pnpm 11, add the GitHub plugin source, start Web once to activate it, and then open dsh-app.cmd. Do not overwrite other plugins or confuse this project with an npm package named dsh-app.
```

</details>

## Usage

| Goal | Entry point |
| --- | --- |
| Open the same service in a browser | Tray or title-bar menu → **Open in browser** |
| Inspect diagnostics | Title-bar `…` or whale tray → **Diagnostics and recovery** |
| Recover a startup or front-end failure | Safe startup page → **Restart / Diagnostics and recovery**; plugin or DSH recovery appears when a valid backup exists |
| Exercise conversation and model operations | Diagnostics → **Run functional check** |
| Disable a failing plugin | Plugins → **Disable and restart** |
| Retry the plugin | The same page → **Enable and restart** |
| Inspect model changes | **Model sources / Change history** |
| Inspect costs and balance | **Cost and usage** at the bottom of the sidebar shows the official API balance, monthly costs, tokens and budget; click it for details. The shared Web service also serves `/dsh-app/cost` |
| Inspect the selected conversation's context | **Cost and usage → Context**, or click the context summary beneath the composer |
| Reload the interface | `Ctrl+R` |
| Hide or quit | Close hides to tray; **Exit DSH App** in the tray fully quits |

After authenticating to the shared backend, a browser can read the same records at `/dsh-app/diagnostics`. Restart and recovery actions run in the desktop app. If the DSH front end cannot load, the independent safe startup page can still open diagnostics and run recovery backed by a valid snapshot. The app only stops a backend it owns; an externally started Web server retains its own lifetime.

On its first read, the cost page copies daily, model and conversation totals plus pricing and budget settings from an existing `dsh-cost-meter` ledger into a separate file; the original is unchanged. It then records only new model-usage events, with no historical session scan during cold start. Amounts are estimates from saved prices; calls without a price remain counted and marked unpriced. ASS provider IDs are separate from vendor pricing tables. Enter the actual USD rates for that provider and model under **Model prices**, in dollars per million tokens; saved rates apply to subsequent calls and leave historical costs unchanged. Cache reads and writes use separate configured rates, and budgets use the selected display currency. After confirming the history, you can uninstall the old cost plugin through the plugin market.

Account balances come from the [official DeepSeek `user/balance` API](https://api-docs.deepseek.com/api/get-user-balance/) and display the original currencies, total, granted and topped-up balances independently of local cost estimates. The server resolves the official credential from the active DeepSeek API-key provider configuration. It explains and skips requests when the official provider is absent, its key is missing, its endpoint points to a third party, or its credential reference is shared with a third-party provider. Keys are never sent to the browser or written into the balance cache; ASS, MIFY and other third-party balances are not queried. Requests begin on the first display and do not hold up startup. Defaults are a five-minute cache, five-second timeout, 60-second error retry interval and 30-second minimum manual refresh interval; configure `balance.refreshMs`, `balance.timeoutMs`, `balance.retryMs` and `balance.minRefreshMs` on the plugin to adjust them. Failed requests retain the same account’s last successful balance with its timestamp and stale status. Changing the key hides the previous account’s balance.

The Context page follows the selected conversation, showing official DSH token usage, occupancy and estimated composition alongside request input/output, duration, tool failures, compactions, pruning and injections. API usage and character estimates are labeled separately; estimated composition is not a billing input. The module reads the selected conversation's log projections on demand and updates incrementally, without scanning all historical sessions or polling. Request trends and activity retain recent entries while call totals remain cumulative. This integration covers the main context statistics; file browsing, team features and cross-session costs remain owned by their respective modules.

## Update and uninstall

**Update DSH App:** exit the app, repeat the installation command, activate the new plugin through Web, and launch the app again. Once the community catalog lists it, the market's update/restart flow can also be used.

**Update DSH core:** when a newer version exists, click the title-bar update button and choose **Install and restart**. Before switching, the app checks presets, models and conversation operations in a temporary home. It then verifies the rendered interface. A failed upgrade attempts to restore the previous core and configuration. This does not change the global `dsh` command or a source checkout, and does not reverse session or plugin-data migrations.

**Uninstall:** exit the app, then run:

```powershell
dsh plugin --profile web remove dsh-app
```

Restart DSH Web to restore its official sidebar. Existing conversations and other plugins remain available; uninstalling does not delete sessions or the cost ledger.

## FAQ

<details>
<summary>Electron is missing, or the first launch fails</summary>

Electron is an optional dependency. Its binary download may require network access; installation policy or a download failure can leave the Host plugin installed without a usable Electron executable. Set `DSH_APP_ELECTRON` to an existing compatible `electron.exe` and retry. If the app cannot locate DSH, complete the one-time Web activation first.

</details>

<details>
<summary>Does the ASS marker identify who changed a model?</summary>

No. It recognizes ASS's provider-ID convention. Change history retains observed before/after values while the Host runs; external writers stay unknown. First use establishes a baseline, with no invented past history, and intermediate writes between observations can be missed. Model audit records omit API keys.

</details>

<details>
<summary>Does a functional check call models or change my conversations?</summary>

It creates blank conversations in a temporary DSH home, changes presets and models, and archives them. It sends no model messages and does not use your existing conversations. It does not validate balances or model responses. Plugins still execute their normal startup effects.

</details>

<details>
<summary>Can I configure paths, the port and history retention?</summary>

| Setting | Purpose |
| --- | --- |
| `DSH_HOME` | Use an existing non-default DSH data directory |
| `DSH_APP_ELECTRON` | Electron executable path |
| `DSH_APP_NODE` / `DSH_APP_CLI` | Explicit backend Node and DSH CLI paths |
| `DSH_APP_PORT` | Loopback port; default `0` lets the OS choose |
| `DSH_APP_PNPM_CLI` | pnpm 11 `pnpm.cjs` used for core upgrades |
| Host `auditIntervalMs` | Model observation interval; default 2000 ms, range 500–60000 |
| Host `historyLimit` | Model change retention; default 200, range 1–2000 |
| Host `contextInsight.historyLimit` / `contextInsight.activityLimit` | Retained request/activity entries for the selected conversation; default 32 each, range 2–1000 each |
| Host `contextInsight.toolLimit` / `contextInsight.pendingLimit` | Retained tool names/pending calls; defaults 16/128, range 2–1000 each. Calls beyond the tool-name cap are grouped under Other tools |

Startup logs, configuration backups, quarantine records and model history are stored locally under `$DSH_HOME/dsh-app`. The repository-backed Windows adapter uses `desktop-link`. Connection descriptors contain authentication tokens and must not be included in public issue reports.

</details>

## Ecosystem and scope

DSH App installs through the standard `dsh.bundle.patch` declaration and targets the `web` profile. Community plugins are discoverable through the [dsh-plugin GitHub topic](https://github.com/topics/dsh-plugin). The plugin market uses the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) community catalog; its maintainers review submissions.

The repository retains the `bin/` launcher, `desktop/` shell, `lib/` Host and maintenance modules, and required build scripts. `npm run build` generates the client bundle and sandbox preload. Only focused cost and client-plugin behavior regressions are retained; snapshots and recording intermediates are excluded from the source branch.

See [focused development checks](tests/README.md) for cost, context and the actual DSH browser-factory test setup and commands.

MIT · See [NOTICE.md](NOTICE.md) for artwork and project attribution.
