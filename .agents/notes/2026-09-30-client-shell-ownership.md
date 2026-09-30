# Agent Note: Own the sidebar shell and delegate session operations

Status: implemented

## Problem

An incompatible third-party sidebar icon export caused React to reject the entire sidebar. Layout replacements also risk hiding workspace extensions or writing model and session state through obsolete APIs.

## Decision

DSH App owns the navigation rail and sidebar shell. Its bundle disables only the official `ui-sidebar` row, while its client registration declares the same child slots and renders the official workspace browser, settings and footer contributions. The official root frame, right pane, conversation, composer, model selection and session services retain their responsibilities. New chat delegates to `uiWorkspace.startSession`; search delegates to the cancellable Session API.

The bundle configures the existing `session-query-sqlite` row to open an in-memory index on the first search. Profile overrides retain precedence. Searches do not activate matching sessions, and superseded or closed searches abort their requests. The first query pays index loading costs instead of every cold start.

The upper MCP rail button shadows the original footer launcher at a distinct priority and shares its registered Store declaration. Settings and MCP render in keyed main panes. Public stored-entry component decorators retain the original hooks, stores, injected callbacks and child-slot render authorization: settings replaces only its modal presentation with inline section navigation, and MCP renders its existing React panel tree inline before commit. Neither owner mounts a background mask or a modal layer in this presentation. Opening a store selects its pane; leaving a pane closes that store. Disposal restores both original components and the MCP launcher. Accounting remains owned by the [cost module](2026-09-30-cost-routing.md), and process ownership remains defined by the [Host note](2026-09-30-host-owner.md).

Decoration and restoration publish registry versions through an immediately disposed, non-winning registration. External store closure clears only the owner's currently selected pane. An upper dialog pauses MCP's original modal-open effects while retaining its iframe, preventing its Escape capture from closing the underlying main pane. MCP update guidance routes to an installed market panel or settings section; the connector's original npm fallback remains available when neither exists. These presentation adapters are verified against DSH 0.2.0-rc.2 and MCP Connector 0.2.63.

## Alternatives considered

**Keep the third-party Codex UI package.** The user requested an independently maintained layout. Depending on its private icon and DOM names repeats the compatibility failure and leaves this package unable to repair its own interface.

**Reimplement the workspace browser and composer.** Their official components already own grouping, archival, directory selection, permission controls and plugin extension slots. Duplicating those operations would create competing session and model authorities.

**Move rendered modal DOM nodes.** A moved node still carries its original modal isolation, focus behavior and React ownership. Adapting the owner's React presentation before commit preserves its configuration callbacks while avoiding a modal that disables the sidebar. The inline adapters depend on the supported published settings and MCP component presentations and are checked against those artifacts.

**Load the search index during startup.** This adds work to every cold start, including launches that never search. On-demand initialization keeps content search available while placing that work on the query that needs it.

## Consequences

This UI requires DSH 0.2.0-rc.2 or later matching the package peer range. Removing the bundle restores the official sidebar without deleting sessions or accounting data. Frame decoration and subscriptions are disposed with the client plugin, including queued animation frames. The document has a fixed viewport while the official conversation scrollport retains message navigation and tail following.
