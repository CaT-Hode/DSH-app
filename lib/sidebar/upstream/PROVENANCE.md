# Integrated sidebar engine

This directory retains the MIT licensed runtime of `dsh-better-sidebar@0.24.1`, from [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). The source artifact hashes are recorded in `upstream-hashes.json`; the copyright notice is retained in `LICENSE`.

`index.mjs` is the published Host artifact. Its settings row resolves to DSH App, and preference reads and writes use DSH App's `sidebar` field through `../settings.mjs`. The original `/sidebar` API, filesystem checks, WebSocket upgrades and session state remain in place. `client-factory.mjs` is the published browser factory with its registration wrapper removed and its documented registry functions exported. It is integrated into DSH App's single client module. Public browser aliases and `ctx.betterSidebar` remain available to existing contributors.

The editor, Mermaid and optional locale integration stay separate lazy scripts. The redundant standalone registry bundle, original sources, tests, build tools and unrelated package documentation are not retained. The engine uses DSH's native right sidebar and terminal. DSH App owns the surrounding layout, fonts and colors.

The three lazy scripts and license retain their original bytes through repository attributes. Only the published editor and Mermaid bundles exempt original trailing spaces from Git whitespace checks; those spaces include template-string content. Owned source and other files retain ordinary whitespace checks.

The integrated client contains exceptions from contributed registry and session-state subscribers so one failing subscriber does not prevent native tab synchronization, another subscriber or contribution disposal. Callback failures retain the engine's existing error reporting.
