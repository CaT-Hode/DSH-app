## Integrated and conflicting plugins

> **Resolve duplicate plugins before installation.** DSH App already provides the features below. Remove or disable each predecessor's complete bundle in the same profile. Hiding a button can still leave duplicate routes, storage owners, model tools or client modules. The built-in market omits these packages and rejects reinstalling them; direct CLI installs still require care. DSH App does not automatically uninstall your plugins.

| Predecessor package | Replacement in DSH App | Conflict when both are enabled |
| --- | --- | --- |
| `dsh-better-sidebar` | Built-in files, Git, tasks, Side Chat and split workbench | Duplicate `/sidebar` routes, workbench registrations and public module names |
| `dsh-mcp-connector` | **Plugins → MCP** | Competing MCP storage, grant and connection services |
| `@michengai/dsh-codex-ui` | Owned layout, rail, session sidebar and title bar | Competing sidebar and main-view ownership |
| `dshmarket` | **Plugins → Browse** | Competing installation queues, updates and restart flows |
| `dsh-cost-meter` | **Cost and usage** | Duplicate usage listeners and accounting |
| `dsh-context` | **Cost and usage → Current conversation** | Duplicate context displays and event statistics |
| `@linxin666/dsh-client-ui-skill-explorer` | **Plugins → Skills** | Duplicate skill browsing and configuration |
| `@michengai/dsh-skills-manager` | **Plugins → Skills** and official skill providers | Competing skill sources, invocation policies and registrations |

Integration has two implementations. The MCP Host retains the MIT-licensed `dsh-mcp-connector@0.2.63` engine; Better Sidebar retains the MIT-licensed `dsh-better-sidebar@0.24.1` Host, client and lazy runtime scripts. This project rewrites the layout, skills, costs, context and plugin market. Licenses, pinned versions, original file hashes and local changes for the retained engines are recorded in [NOTICE.md](../NOTICE.md), [MCP provenance](../lib/mcp/upstream/provenance.json) and [sidebar provenance](../lib/sidebar/upstream/PROVENANCE.md). Both engines update with DSH App instead of separate predecessor packages.

Back up the profile and data before migration, then check these items. **Do not delete your DSH data directory:**

1. Better Sidebar: copy its effective preferences into DSH App's `sidebar` configuration field before removing the package. Per-session tabs, layouts and editor state retain their storage keys. Extensions retain `ctx.betterSidebar`, tab/viewer/icon/badge/settings registrations and public module aliases. See [the integrated sidebar](../lib/sidebar/README.md) for features and APIs.
2. MCP: keep the original `mcp_connector` storage and grant journal. The integrated engine reuses connections, policies, scopes and backups. While the old MCP package is enabled, the owned Host leaves that storage to it; remove the package and restart to transfer ownership.
3. Skills: keep skill files and the old manager's state file. The owned implementation reads existing sources and policies, with distinct model and command invocation states. While the old Skills Manager is enabled, the owned providers avoid duplicate registration.
4. Costs: the first read imports the old ledger without modifying its file. Confirm that history is visible before removing the predecessor. Unpriced calls retain tokens and counts; new prices apply only to subsequent calls.
5. Market: cancel unfinished `dshmarket` operations before removing it, preventing two queues from managing one profile.

Official scheduling, auto-review, Agent Team and voice input, plus compatible extensions such as GitGraph, can remain enabled. This table is not a compatibility guarantee for every community plugin. Uninstalling DSH App removes these integrated features and restores the official sidebar; it does not automatically reinstall predecessor packages.
