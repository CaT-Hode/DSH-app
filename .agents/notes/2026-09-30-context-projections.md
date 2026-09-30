# Agent Note: Keep context insight on the selected session's projections

Status: implemented

## Problem

A context dashboard and local cost accounting can repeat usage calculations, disagree about cache buckets, or add historical-session reads to startup. The combined entry needs current-session context information without creating a second billing authority.

## Decision

[Context insight](../../lib/context-insight.mjs) registers one incremental `dshAppContext` Session projection. It retains content-free composition records, bounded request history, tool statistics and recent compaction, pruning, injection and route-change activity. Surface replacements follow positional start/end nodes, including ranges whose numeric sequence order differs from their surface order. The running DSH release supplies message projection and heuristic token estimation.

The [client](../../client/context-insight.mjs) subscribes to the selected session through official slot props. Occupancy uses `contextPressure`; cumulative provider usage uses `tokenUsage`; composition uses the official estimator. Character estimates are labeled and never treated as billed usage. The Cost and usage panel contains the context page, and the composer summary opens it. [Local cost accounting](2026-09-30-cost-routing.md) remains responsible for prices, budgets and historical totals.

## Alternatives considered

**Scan every session during startup or poll logs from the browser.** This adds work unrelated to the selected conversation. The official registry folds an opened session on demand and advances its live tail.

**Retain complete messages and arguments in projection values.** These values accompany session snapshots. Keeping content duplicates the durable log and enlarges routine traffic; bounded numeric records provide the required statistics without carrying sensitive content.

## Consequences

Request history and activities retain their configured recent entries; cumulative calls and failures survive truncation. Tool names beyond the configured cap share one Other tools aggregate. The four collection caps accept integers from 2 through 1000; reduced pending-call retention can omit timing for older unsettled calls. This integration does not reproduce the removed plugin's complete message browser, file activity, agent graph or view preferences.

[Focused regressions](../../tests/context-insight.spec.mjs) verify positional replacement, immutable folds, provider usage without double-counting reasoning, bounded retention, content omission, checkpoint validation and replay through the official DSH 0.2.0-rc.2 Session projection registry. These projection tests do not establish rendered selected-session binding or navigation behavior; those require desktop acceptance evidence.
