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
| Recover from startup failures | Live backend logs and elapsed time; failed front-end loads return to a safe page with retry, diagnostics and backup-backed recovery actions |
| Update core and plugins | Core update button only when a newer release exists; installation, restart, configuration backup and recovery |
| Diagnose and recover | Plugin status and startup-failure logs, individual disable/retry, plugin-update recovery and rollback to a backed-up DSH version |
| Track model configuration | Original model IDs, ASS provider markers and observed configuration changes |
| Track cost and usage | Local model-usage estimates by day, model and conversation, budget reminders, and imported `dsh-cost-meter` history |

The package contains its own desktop and maintenance features. Codex UI, plugin markets, MCP connectors and other community plugins are installed separately; the title bar can open their existing pages.

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
- This release was exercised with DSH **0.1.7-rc.2** and Electron **44**. DSH interfaces are evolving; run the functional check when using another version.

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
| Inspect costs | Title-bar `…` → **Cost and usage**; the shared Web service also serves `/dsh-app/cost` |
| Reload the interface | `Ctrl+R` |
| Hide or quit | Close hides to tray; **Exit DSH App** in the tray fully quits |

After authenticating to the shared backend, a browser can read the same records at `/dsh-app/diagnostics`. Restart and recovery actions run in the desktop app. If the DSH front end cannot load, the independent safe startup page can still open diagnostics and run recovery backed by a valid snapshot. The app only stops a backend it owns; an externally started Web server retains its own lifetime.

On its first read, the cost page copies daily, model and conversation totals plus pricing and budget settings from an existing `dsh-cost-meter` ledger into a separate file; the original is unchanged. It then records only new model-usage events, with no historical session scan or external balance request during cold start. Amounts are estimates from saved prices; calls without a price remain counted and marked unpriced. External account balances and third-party quotas are outside this page. After confirming the history, you can uninstall the old cost plugin through the plugin market.

## Update and uninstall

**Update DSH App:** exit the app, repeat the installation command, activate the new plugin through Web, and launch the app again. Once the community catalog lists it, the market's update/restart flow can also be used.

**Update DSH core:** when a newer version exists, click the title-bar update button and choose **Install and restart**. Before switching, the app checks presets, models and conversation operations in a temporary home. It then verifies the rendered interface. A failed upgrade attempts to restore the previous core and configuration. This does not change the global `dsh` command or a source checkout, and does not reverse session or plugin-data migrations.

**Uninstall:** exit the app, then run:

```powershell
dsh plugin --profile web remove dsh-app
```

Restart DSH Web to continue using existing conversations and other plugins in the browser.

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

Startup logs, configuration backups, quarantine records and model history are stored locally under `$DSH_HOME/dsh-app`. The repository-backed Windows adapter uses `desktop-link`. Connection descriptors contain authentication tokens and must not be included in public issue reports.

</details>

## Ecosystem and scope

DSH App installs through the standard `dsh.bundle.patch` declaration and targets the `web` profile. Community plugins are discoverable through the [dsh-plugin GitHub topic](https://github.com/topics/dsh-plugin). The plugin market uses the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) community catalog; its maintainers review submissions.

The repository retains the `bin/` launcher, `desktop/` shell, `lib/` Host and maintenance modules, and required build scripts. `npm run build` generates the sandbox preload already included in the repository. Development tests, snapshots and recording intermediates are excluded from the source branch.

MIT · See [NOTICE.md](NOTICE.md) for artwork and project attribution.
