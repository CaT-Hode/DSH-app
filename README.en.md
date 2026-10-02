<p align="center">
  <img src="docs/assets/readme/hero.png" width="100%" alt="DSH App — Your agent. Your workspace. A blue whale above a graphite workbench">
</p>

<h1 align="center">DSH App</h1>
<p align="center"><strong>Conversations, files and agents. One shared workspace.</strong></p>
<p align="center">A Codex-style client for DeepSeek Harness · Windows Desktop + Web</p>
<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong> · <a href="https://github.com/CaT-Hode/DSH-app/releases">Releases</a> · <a href="https://github.com/CaT-Hode/DSH-app/issues">Report an issue</a></p>
<p align="center">
  <a href="https://github.com/CaT-Hode/DSH-app"><img src="https://img.shields.io/badge/DSH-Plugin-4d6bfe?style=flat-square" alt="DSH Plugin"></a>
  <img src="https://img.shields.io/badge/Desktop-Windows-45454d?style=flat-square" alt="Windows Desktop">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square" alt="Node.js 24+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-4d6bfe?style=flat-square" alt="MIT License"></a>
</p>
<p align="center"><a href="#see-it-in-action">Demos</a> · <a href="#what-makes-it-different">Features</a> · <a href="#quick-start">Quick start</a> · <a href="#plugin-compatibility-and-migration">Compatibility</a> · <a href="#faq">FAQ</a></p>

DSH App brings DSH conversations, projects, files and extensions into one workbench. Desktop and browser connect to the same `web` profile, keeping your existing models, sessions and compatible plugins. Open the right-hand workbench yourself, or let the agent in your current conversation control it.

This community plugin provides its own layout and Electron shell. Codex is an interaction design reference; DSH App does not depend on the Codex UI plugin and is not the official DeepSeek desktop client.

## See it in action

### One canvas. A workbench when you need it.

The floating sidebar holds outputs, session information and working content. Opening it leaves reading space for the conversation; hiding it recenters the text. New chats start with the workbench hidden. Files, previews and Side Chat share one tool launcher.

![Floating workbench: reveal, preview a file, prepare a Side Chat draft, hide and restore](docs/assets/readme/workbench.gif)

### Plugin pages and settings, together

The left-rail `…` menu collects third-party extension pages. Separate settings open from a gear on the same row. A single-page plugin opens directly without a redundant settings button.

![Extension integration: Smart Notes, its settings gear and Task Board](docs/assets/readme/extensions.gif)

### Skills and MCP belong to the workflow

Switch between Browse, Skills and MCP in one plugin center instead of searching through separate management plugins.

![One plugin center: Browse, Skills and MCP](docs/assets/readme/plugin-center.gif)

<details>
<summary>About these recordings</summary>

These GIFs show the current DSH App client using an isolated DSH `0.2.0-rc.2` configuration, a sample workspace and a locally prepared demonstration conversation. They contain no personal conversations or API keys. Side Chat shows an unsent draft; no model messages are sent. Pauses and playback timing are adjusted for clarity and are not a performance benchmark. The header is generated brand artwork; the GIFs show the actual interface.

[Asset provenance and recording notes](docs/assets/readme/README.md)

</details>

## What makes it different

### Conversations and working content share a canvas

The navigation rail, project sidebar, header, composer and floating workbench use a consistent graphite surface hierarchy, with light and dark appearances. The message body and workbench coordinate their layout to keep conversations readable. The whale welcome screen asks what to do in the selected project; without a project it invites you to explore.

### Files, previews and Git stay close to the conversation

Built-in tools include a file tree, search, uploads, ZIP downloads, CodeMirror editing, Markdown / Mermaid / HTML / web previews, Git changes and changes from the current AI turn. The Better Sidebar extension APIs remain available while its layout, start page and settings are redesigned. Working content restores with its conversation; the original sidebar plugin is not required.

### Agents can put relevant content in front of you

Enable agent sidebar control to let the current agent open a file at a line, show a web page or extension tab, read tab state, switch content and hide the workbench. Commands bind to the calling conversation and receive client execution acknowledgements. Preparing a Side Chat draft and references never sends the message automatically.

```js
// Open a file in the current workspace at a specific line
sidebar_open_view({ target: "src/main.ts", line: 20 })

// Prepare an editable review draft for the user
sidebar_open_view({
  target: "sidechat", type: "tab", title: "Code review",
  draft: "Please review the current changes",
  context: [{ title: "Focus", text: "Check error handling and boundary cases" }]
})
```

| Agent tool | Purpose |
| --- | --- |
| `sidebar_open_view` | Open a file, folder, web page, DSH resource or registered tab |
| `sidebar_get_tabs` | Read actual tabs, available content, visibility and connection state |
| `sidebar_activate_tab` | Activate a tab and reveal the workbench |
| `sidebar_close_tab` | Close a tab |
| `sidebar_set_visibility` | Show or hide the workbench while retaining its contents |

See the [integrated sidebar guide](lib/sidebar/README.md) for complete behavior, acknowledgement states and extension interfaces.

### Side Chat is a conversation you can keep using

Side Chat supports multiple conversations, history, renaming, independent drafts and context references. Reference a main-chat draft, selected text or an open file. Copy an answer, add it to the main-chat draft, or turn a completed side conversation into a continuing main conversation. Streaming responses, reasoning, tools, subagents, stopping and reconnection remain available.

Later main-chat messages are not automatically synchronized into an existing Side Chat. You review and send the draft and references. Open side conversations can restore after a refresh or restart.

### Plugin compatibility goes beyond adding a button

Third-party `settings.section` and `settings.plugins.tab` registrations retain their native forms and controllers. Pages and settings with reliable ownership share one row without duplicate destinations. Single-page plugins have no gear; multiple settings pages offer a chooser. The menu follows plugin registration, disabling and unloading.

The built-in marketplace places official plugins first and labels their provenance, version and optional bundled status. Install, update and uninstall operations enter a cancellable queue, apply through the official CLI after restart, and retain backup and recovery records.

### Skills, MCP and usage have clear destinations

| Area | What it provides |
| --- | --- |
| **Skills** | Browse, create, edit, enable and import skills; connect local and project libraries; recover deleted skills |
| **MCP** | Connections, catalogs, OAuth, custom servers, tool policies, project scope and backup restoration |
| **Cost and usage** | Official DeepSeek balance, a local usage ledger, token heatmaps, model prices, historical costs and budgets |
| **Current-session insight** | Context use and composition, request trends, tool latency, failures and compaction activity |
| **Desktop maintenance** | Single instance and tray, in-window startup logs, diagnostics, retry and backup-supported update recovery |

Skills and MCP remain in the plugin center. Cost and usage keeps its own entry instead of being duplicated in the third-party `…` menu.

## Quick start

### Requirements

- **Windows**, **Node.js 24+** and **pnpm 11**.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) installed, with `dsh` available in your terminal.
- Current plugin version: **0.3.6**. Validated client baseline: **DSH 0.2.0-rc.2**, with Electron **44**. Other core versions require interface compatibility checks.
- Read the migration notes first if you already use separate sidebar, Codex UI, marketplace, MCP or cost plugins.

### 1. Install into your Web profile

```powershell
dsh plugin --profile web add 'git+https://github.com/CaT-Hode/DSH-app.git'
```

Use the GitHub source, or pass a Releases `.tgz` path to the same command. This project currently does not use an npm release as its installation source.

### 2. Activate it once

```powershell
dsh --profile web --no-open
```

Wait for the Web service to become ready, then stop it with `Ctrl+C`. The plugin records the DSH launch entry point.

### 3. Open the desktop client

```powershell
$dshData = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
& (Join-Path $dshData 'profiles\web\node_modules\.bin\dsh-app.cmd')
```

Use step three for subsequent launches. Configure a model in **Settings → Models** and add a working directory. Closing the window keeps it in the tray; quit completely through the tray menu or `dsh-app --quit`.

<details>
<summary>Ask a local agent to install it</summary>

```text
Install DSH App into my web profile using https://github.com/CaT-Hode/DSH-app and its README. Verify Node.js 24+, pnpm 11 and the DSH core version. Back up the profile, handle conflicting plugins using the migration table, and preserve models, conversations, MCP storage, skills and accounting data. Use the GitHub source, activate Web once, then open dsh-app.cmd. Do not delete the DSH data directory.
```

</details>

## Plugin compatibility and migration

These capabilities are integrated. **Do not enable their original plugins in the same profile.** Hiding a button can leave duplicate routes, services or listeners. Back up configuration and data before migrating; DSH App does not uninstall other plugins automatically.

| Integrated original plugin | Destination |
| --- | --- |
| `dsh-better-sidebar` | Right workbench: files, Git, previews and Side Chat |
| `@michengai/dsh-codex-ui` | DSH App navigation rail, project sidebar, header and conversation layout |
| `dshmarket` | Plugins → Browse |
| `dsh-mcp-connector` | Plugins → MCP |
| `dsh-cost-meter` / `dsh-context` | Cost and usage / current session |
| `@linxin666/dsh-client-ui-skill-explorer` / `@michengai/dsh-skills-manager` | Plugins → Skills |

[Complete conflict and migration instructions](docs/compatibility.en.md) · [Licenses and attribution](NOTICE.md)

Extensions checked in the installed client:

| Plugin | Verified scope |
| --- | --- |
| `@zzerx/dsh-plugin-notes` **0.4.2** | Page and same-row settings gear |
| `@linxin666/dsh-client-ui-task-board` **0.4.4** | Page, draft creation and deletion, disable and re-enable |
| `@linxin666/dsh-client-ui-git-graph` **0.4.4** | Real project branches and commit history |
| `dsh-image-gen` **0.8.5** | Native provider settings, single-page entry, disable and re-enable |

These records apply to specific versions, not the entire plugin ecosystem. Image generation was not requested, and Task Board checks did not execute model tasks.

## FAQ

<details>
<summary>Do Desktop and Web create separate conversations?</summary>

No. Both use the same conversations, models and plugin configuration when connected to the same backend and `web` profile. Open the current service in a browser from the header or tray menu.

</details>

<details>
<summary>The plugin installed, but Electron will not open.</summary>

Electron is an optional dependency; its first download needs network access. Check whether the package manager blocked its install script, or point `DSH_APP_ELECTRON` to a compatible `electron.exe`. Complete the initial Web activation before opening the desktop client.

</details>

<details>
<summary>The workbench is hidden, or the agent cannot control it.</summary>

New chats start with the workbench hidden. In an existing conversation, the upper-right list icon toggles it and `+` opens the tool launcher. Enable agent control in **Settings → General → Workbench**. Tools affect the calling conversation; disconnected commands wait for that conversation's view to reconnect.

</details>

<details>
<summary>Will updating or disabling a plugin delete its data?</summary>

Marketplace changes apply through a cancellable queue and restart. Disabling and uninstalling retain plugin data. Failed updates retain logs, queued operations and recovery backups. Updating the DSH core and migrating an old plugin are separate actions; a core rollback does not replace data migration.

</details>

<details>
<summary>How do estimated costs differ from the API balance?</summary>

The balance comes from the official DeepSeek account endpoint. Costs are local estimates based on configured model prices. Unpriced calls, estimated context composition and actual API tokens are labeled separately; character-based context estimates are not used for billing.

</details>

See the [usage guide](docs/guide.en.md) for navigation, configuration, diagnostics, updates and uninstalling.

## Development and credits

`client/` contains UI source, `desktop/` the Electron shell, and `lib/` Host services and integrated engines. `npm run build` generates the client and sandbox preload. Development setup and focused behavioral checks are documented in [tests/README.md](tests/README.md).

DSH App uses official DSH session, project, model, skill and connection services. The MCP engine is integrated from `dsh-mcp-connector@0.2.63`, and the sidebar engine from `dsh-better-sidebar@0.24.1`, retaining their licenses, provenance, hashes and modification records. Thanks to DeepSeek Harness and the community plugin authors.

[MCP provenance](lib/mcp/upstream/provenance.json) · [Sidebar provenance](lib/sidebar/upstream/PROVENANCE.md) · [NOTICE](NOTICE.md) · [MIT License](LICENSE)
