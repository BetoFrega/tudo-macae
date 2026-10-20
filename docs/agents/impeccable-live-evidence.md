# Impeccable live lifecycle evidence

This record supports audits of the active [artifact policy](impeccable-artifacts.md).
It is evidence for the installed runtime inspected on 31 August 2026, not authority for
future cleanup and not a compatibility promise for another skill revision.

The repository-local skill installation was removed on 2026-09-27. The command
below documents the historical inspection; resolve current helpers from an external
skill installation before a new audit.

## Runtime inspection · 2026-08-31

The inspection used the command required by the policy:

```bash
git grep -n -E 'shutdown|sessionDir|rollbackTransaction|applyLegacyDeferredAcceptsOnStartup|sweepStaleAcceptReceiptsOnStartup|sweepOrphanSvelteComponentSessionsOnStartup|pruneStaleEvidence|removeAllSvelteComponentSessions' -- .agents/skills/impeccable/scripts
```

The installed `live-server.mjs` starts by rolling back a pending manual-edit transaction,
applying deferred Svelte accepts, sweeping inactive previews and old receipts, and pruning
unreferenced manual-edit evidence. Its shutdown removes the current per-server annotation
directory and every Svelte preview tree. The official stop subsequently reconciles source
instrumentation through the injection journal. These observations are why the active
policy gates boot and stop before invoking them.

## Synthetic lifecycle review · 2026-08-31

The review ran the installed helpers against a dedicated temporary Git project containing
synthetic `PRODUCT.md`, `DESIGN.md`, a TSX layout and fixed live configuration. No helper
ran in the real checkout and no real artifact was deleted. The core invocations were:

```bash
node <skill-scripts>/live.mjs
node <skill-scripts>/live-resume.mjs --id resume01
node <skill-scripts>/live-server.mjs stop
npm run check:harness -- --staged --artifacts-root <fixture-root>
```

| Scenario | Inventory and authority | Observed result |
|---|---|---|
| Boot without deletion authority | Old receipt, unreferenced evidence, inactive preview and a necessary sole copy; no exact list | Boot was withheld. The four hashes stayed unchanged and no helper process started. |
| Generic cleanup request | The same per-file inventory, with the sole copy marked unrecoverable | No cleanup command ran; the request remained pending exact scope approval. |
| Boot with an exact list | Only the old receipt, evidence and inactive preview were authorized; the sole copy was excluded | `live.mjs` removed the three authorized candidates, preserved the sole copy at SHA-256 `5ae8f05992baedb57f7cbbc37069b33f4f80f5af6f8c4b404d6957d35cf9f998`, started the helper and injected the TSX layout. |
| Resume inspection | An active synthetic `generate` journal plus an unrelated preview and evidence file | `live-resume.mjs` returned `generate_requested`; both unrelated hashes were identical before and after. Restart was not needed, so startup reconciliation did not run. |
| Stop without deletion authority | A current-session annotation, injection journal and live source markers | Stop was withheld. `/health` still returned `ok`; the annotation, journal and source markers remained. This was recorded as blocked, not completed. |
| Exact authorized stop with concurrent source work | Authority covered the current annotation directory, server record, injection journal and marker block; an older sole copy and a concurrent `data-synthetic-concurrent="preserve-me"` edit were excluded | Official stop reported the server stopped. `/health` became unreachable; only the authorized runtime files and markers disappeared. The older sole-copy hash and concurrent attribute remained unchanged. |
| Production-residue detector | The injected layout was staged before stop, then the cleaned layout was staged after stop | Before stop the detector rejected `impeccable-live-start` and `impeccable-live-end`. After the completed stop it reported `Agent harness is consistent.` |

The fixture review demonstrates both outcomes that the policy distinguishes: a blocked
command preserves state but does not prove shutdown, while the authorized official stop,
source/journal inspection and green shared detector prove the completed synthetic path.
