> Historical measurements below include the retired staging tier. The measurement scripts now collect only unit and integration; new samples are not directly comparable to that former three-tier total.

# Vitest Node migration evidence (#680)

Measured on 2026-09-04 in the linked worktree at baseline `16bb6822a6d5c294a1032d9cb5b9278aa3acf878`, with the session-precondition correction below applied identically before and after. Machine: Apple M1 Pro, 10 logical CPUs, 16 GiB RAM; Node 24.19.0, OpenJDK 25.0.2, Vitest 4.1.11. Dependencies were already installed and caches were retained; no installation or build ran during samples.

Each sample invokes `test:unit`, `test:integration` and `test:staging-control` sequentially, fail-fast, under one Auth/Firestore/Storage supervisor. Each complete sample starts a fresh emulator lifecycle on the worktree's derived ports. Timings sum the three public commands, including npm and integration preflight; supervisor startup/shutdown is outside that workload in both phases. Five samples per phase; P50/P75/P90 use nearest rank. Environment and setup durations sum worker time and are not elapsed time.

## Precondition correction

The initial pilot failed `preserves uploaded retry identity after expiry (completed=true)` in `src/features/media/createMedia.integration.test.ts`: expected `details.reservationExpired: true`, received `details: {}`. The test removes and restores the administrator role while reusing its cookie. Role removal now revokes that cookie (`updateCustomClaims`), so the retry could stop at authentication instead of exercising reservation expiry. The fixture now signs in the same user after restoring the role. All 14 existing file cases and assertions are preserved; the focused integration file passed after this change. The failed pilot and interrupted attempts were retained locally and are not successful benchmark samples. The first replacement sample could overlap an interrupted process; it was retained separately and rerun after the other baseline samples. The final five baseline observations all passed. The corrected fixture has Git blob `b293ac825c94c37de031da39d4b672fc810c9a20`.

## Environment policy

Node is the default for every ordinary entrypoint. Forty-seven component/hook test files explicitly select jsdom. `imageProcessing.test.ts` is the named non-TSX exception because its browser pipeline requires canvas and FileReader. Server SDK integration stays in Node. DOM matchers load only when the selected environment provides a document; no browser globals are fabricated for Node tests. Existing render and interaction assertions remain unchanged.

## Reproduction

Run the measurement driver from the repository root on the two revisions, preserving the session-precondition correction in both. Keep the same machine, installed dependencies, cache policy and emulator lifecycle. Retain JSON reports and logs for every tier and sample. The audit rejects any difference in file identity, test full name or status, except the three explicitly listed new environment contracts in `bin/ordinaryTestCollection.test.ts`.

```bash
mkdir -p /tmp/issue680
# Repeat with phase=after on the migrated revision.
for sample in 1 2 3 4 5; do
  mise exec -- node bin/emulators.mjs emulators:exec --only auth,firestore,storage \
    "node docs/verification/vitest-node/measure.mjs before $sample /tmp/issue680"
done
mise exec -- node docs/verification/vitest-node/audit.mjs /tmp/issue680
```

The drivers are observational artifacts, not a new ordinary test tier. To
measure the earlier revision, retain a copy of `measure.mjs` outside the
checkout and invoke that path. JSON reports contain test identities and logs
may contain emulator fixture content; retain them locally rather than in Git.

## Results

All five before and five after samples passed. [summary.json](summary.json)
contains every observation and the normalized collection digest.

| Elapsed ordinary workload | Before | After |
| --- | ---: | ---: |
| P50 | 112.73 s | 101.14 s |
| P75 | 122.15 s | 103.20 s |
| P90 | 165.87 s | 133.06 s |

The observed median decreased by 10.3%. The 270 s target is met; the baseline
already met it on this machine. Five observations on a shared host do not
establish a universal speedup: elapsed time varied from 97.07–165.87 s before
and 98.35–133.06 s after. No sample was removed for being slow.

| Aggregated worker time | Before P50 / P75 / P90 | After P50 / P75 / P90 |
| --- | ---: | ---: |
| Setup | 80.32 / 93.36 / 165.62 s | 57.16 / 60.21 / 68.08 s |
| Environment | 153.06 / 195.80 / 287.33 s | 71.57 / 71.71 / 73.44 s |

The audit passed for all ten samples: 235 files and all 2,233 existing cases
retain their full names and passing status, with zero skips/todos. The after
collection has 2,236 cases because it adds exactly three environment contracts
in the existing collection-test file. The audit compares multisets, preserving
duplicate-name cardinality as well as per-tier ownership.

## Validation

- Red→green: the unannotated Node contract failed under jsdom; the entrypoint
  contract failed while staging-control retained jsdom; the named exception
  contract and five existing image-processing cases failed without its DOM
  annotation. Each passed after its corresponding change.
- `npm run test:unit`: 183 files, 1,682 cases passed after migration.
- The ten measured compositions exercise the complete `npm test` tier order,
  including emulator integration and the isolated local staging-control REST
  server. No timeout, retry, collection or assertion was reduced.
- `npx next typegen` followed by `npx tsc --noEmit`: passed. A direct typecheck
  before generation failed because this fresh worktree lacked Next route and
  image declarations; generation resolved it without product edits.
- `npm run lint`: passed, including harness integrity and package boundaries.
- `node bin/emulators.mjs emulators:exec --only auth,firestore,storage 'npm run build:check'`:
  passed.
- The audit accepted synthetic parity and rejected a removed, skipped, renamed
  or unapproved added case; it then passed against the real ten samples.
- Standards and Spec reviewed independently, including final numerical
  evidence: zero actionable findings on each axis.
- No Playwright run: no production code or browser journey changed; rendered
  component behavior is preserved by the existing Vitest assertions. Mutation
  was not selected for this configuration and test-only change.
