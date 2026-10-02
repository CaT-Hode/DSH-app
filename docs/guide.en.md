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
| Inspect the selected conversation's context | **Current conversation** on the same **Cost and usage** page, or click the context summary beneath the composer |
| Manage skills | **Plugins → Skills**, for viewing, creation, editing, enablement, import, recovery and library settings |
| Configure files, previews and task workbench | **Settings → General** uses compact rows for defaults, feature switches and extension options; Side card is no longer a separate page |
| Reload the interface | `Ctrl+R` |
| Hide or quit | Close hides to tray; **Exit DSH App** in the tray fully quits |

After authenticating to the shared backend, a browser can read the same records at `/dsh-app/diagnostics`. Restart and recovery actions run in the desktop app. If the DSH front end cannot load, the independent safe startup page can still open diagnostics and run recovery backed by a valid snapshot. The app only stops a backend it owns; an externally started Web server retains its own lifetime.

On its first read, the cost page copies daily, model and conversation totals plus pricing and budget settings from an existing `dsh-cost-meter` ledger into a separate file; the original is unchanged. It then records only new model-usage events, with no historical session scan during cold start. Amounts are estimates from saved prices; calls without a price remain counted and marked unpriced. Manage model prices in **Settings → Models** for the provider/model routes currently configured. Rates are in USD per million tokens, with flat or peak/off-peak tiers. Saved rates apply to subsequent calls and leave historical costs unchanged. Cache reads and writes use separate configured rates, and budgets use the selected display currency. After confirming the history, you can uninstall the old cost plugin through the plugin market.

Account balances come from the [official DeepSeek `user/balance` API](https://api-docs.deepseek.com/api/get-user-balance/) and display the original currencies, total, granted and topped-up balances independently of local cost estimates. The server resolves the official credential from the active DeepSeek API-key provider configuration. It explains and skips requests when the official provider is absent, its key is missing, its endpoint points to a third party, or its credential reference is shared with a third-party provider. Keys are never sent to the browser or written into the balance cache; ASS, MIFY and other third-party balances are not queried. Requests begin on the first display and do not hold up startup. Defaults are a five-minute cache, five-second timeout, 60-second error retry interval and 30-second minimum manual refresh interval; configure `balance.refreshMs`, `balance.timeoutMs`, `balance.retryMs` and `balance.minRefreshMs` on the plugin to adjust them. Failed requests retain the same account’s last successful balance with its timestamp and stale status. Changing the key hides the previous account’s balance.

Cost and usage is one continuous page with one page scroll area. Today, This week, This month and All time views control the all-conversation cost, token and call overview. Expense history and budgets are expandable; model prices live in Settings → Models. Beneath the account balance, Current conversation follows the selected session and shows context occupancy and estimated composition, request input/output and duration, tool failures, compactions, pruning and injections. It omits duplicate cumulative token and call cards. API usage and character estimates are labeled separately; estimated composition is not a billing input. The module reads the selected conversation's log projections on demand and updates incrementally, without scanning all historical sessions or polling. Request trends and activity retain recent entries. File browsing and team features remain owned by their respective modules.

Plugins → Browse merges the built-in market with installed management and loads the community catalog on demand. It supports search, categories, All/Installed/Updates/Available filters, exact npm versions and GitHub sources. Uncatalogued installed packages remain manageable. Official features retain their official activation and configuration services; retired integrations no longer offer duplicate installation actions. Install, update and uninstall actions create cancellable local requests. Restart and apply stops the backend, backs up the profile, invokes the official `dsh plugin` command and verifies installed versions and activation. Requests become applied only after the backend is ready. Updates retain their previous enabled state; uninstalling retains plugin data. Failures keep the requests, diagnostics and recovery backup. A standalone Web service needs its owner to restart it. The market no longer depends on `dshmarket`; cancel unfinished operations in that plugin before removing it. MCP update guidance opens the built-in market.

DSH App owns skill management without a Skills Manager or Skill Explorer dependency. The page connects to DSH's official skill registry, reads existing local and project libraries, and respects the old manager's source and disabled states without rewriting its state file. Model invocation flags remain in SKILL.md. Editing checks file revisions to avoid overwriting external changes. Removal uses a recoverable trash; restore never replaces an existing file. Local directories, folder uploads, ZIPs and public GitHub sources can be imported. Imports copy files without executing scripts and reject escaping paths, links, collisions and oversized files. Removing the two old community plugins only changes packages and activation; existing skill files remain.

## Update and uninstall

**Update DSH App:** exit the app, repeat the installation command, activate the new plugin through Web, and launch the app again. Once the community catalog lists it, the market's update/restart flow can also be used.

**Update DSH core:** when a newer version exists, click the title-bar update button and choose **Install and restart**. Before switching, the app checks presets, models and conversation operations in a temporary home. It then verifies the rendered interface. A failed upgrade attempts to restore the previous core and configuration. This does not change the global `dsh` command or a source checkout, and does not reverse session or plugin-data migrations.

**Uninstall:** exit the app, then run:

```powershell
dsh plugin --profile web remove dsh-app
```

Restart DSH Web to restore its official sidebar. Existing conversations and other plugins remain available; uninstalling does not delete sessions or the cost ledger. Reinstall removed predecessors yourself if needed. Restoring an older core does not replace preference or data migration.

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
| `DSH_APP_PNPM_CLI` | pnpm 11 CLI entry (`pnpm.cjs` / `pnpm.mjs`) used for core upgrades |
| Host `auditIntervalMs` | Model observation interval; default 2000 ms, range 500–60000 |
| Host `historyLimit` | Model change retention; default 200, range 1–2000 |
| Host `contextInsight.historyLimit` / `contextInsight.activityLimit` | Retained request/activity entries for the selected conversation; default 32 each, range 2–1000 each |
| Host `contextInsight.toolLimit` / `contextInsight.pendingLimit` | Retained tool names/pending calls; defaults 16/128, range 2–1000 each. Calls beyond the tool-name cap are grouped under Other tools |
| Host `skills.maxContentBytes` / `skills.maxArchiveBytes` / `skills.maxExpandedBytes` / `skills.maxFiles` | Skill text, ZIP, expanded bytes and file limits; defaults 1 MiB / 32 MiB / 64 MiB / 1000 |
| Host `skills.requestTimeoutMs` | GitHub skill import request timeout; default 15000 ms, range 1000–60000 |

Startup logs, configuration backups, quarantine records and model history are stored locally under `$DSH_HOME/dsh-app`. The repository-backed Windows adapter uses `desktop-link`. Connection descriptors contain authentication tokens and must not be included in public issue reports.

</details>
