// @ts-check
// Agent invocations: .agents/skills/kill-mutants/SKILL.md.
import { unitMutationTierByName } from "./bin/mutationTiers.ts";

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.mutation.component.config.mts",
  },
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
  concurrency: "75%",
  ignorePatterns: [".claude", ".agents", ".stryker-tmp"],
  htmlReporter: { fileName: "reports/mutation-component/mutation.html" },
  mutate: [...unitMutationTierByName.component.mutate],
  // Measured 2026-08-28: 81.50% total / 83.85% covered (811 killed, 4 timed
  // out, 157 survived, 28 with no coverage at all, 2 errors), 8m10s. The ten
  // `news/actions` server actions live here rather than on the integration
  // tier: their tests mock the use case and `next/cache`, so nothing they
  // assert needs an emulator, and this tier's runner already includes every
  // non-integration test.
  //
  // The survivors accepted in those six, so the next run does not re-litigate
  // them: the `console.error` message in each `catch` (log text nobody asserts
  // on), and, in `createArticle`, `updateArticle` and `rectifyArticle`, the
  // `parsed.error.issues[0]?.message ?? "..."` fallback with its two sibling
  // mutants — zod always fills `issues[0].message`, so no input reaches that
  // branch.
  //
  // The Story actions retain the same two Zod equivalents and their catch log
  // strings. `AttachCaptureForm.tsx` retains three UI-equivalent survivors:
  // its private submit handler cannot be reached with no selection because the
  // only trigger is disabled; removing the visual separator changes no field
  // or action; and `error || <p>{error}</p>` adds only an empty paragraph when
  // there is no error, with no text or accessible name.
  // `StoryForm.tsx` is 50 killed / 6 survived / 1 no-coverage. The HTML
  // datetime-local control sanitizes both mutated invalid initial/reset values
  // to the same empty value asserted by the tests. Radix and React Hook Form
  // likewise normalize an unmatched reset Topic and the mutated no-Topic
  // sentinel back to the empty submitted value. The remaining two survivors
  // are an emptied layout class and the same empty error paragraph described
  // above. Reproduce the state invariants with:
  //
  //   pnpm exec stryker run stryker.component.config.mjs --mutate "src/features/news/components/StoryForm.tsx:59-64,src/features/news/components/StoryForm.tsx:77-82,src/features/news/components/StoryForm.tsx:195-197"
  //
  // The full-file rerun is 50/6/1.
  //
  // `StoryPriorityForms.tsx` and `StoryQueueSection.tsx` together are 108
  // killed / 33 survived / 1 no-coverage (76.06% total). Their survivors are
  // visual variants, inter-word separators, pending-label text, and redundant
  // state clearing; the tests cover effective-priority feedback, Editor
  // precedence, conflict recovery, cursor preservation, every priority label,
  // and empty queues. Reproduce with:
  //
  //   pnpm exec stryker run stryker.component.config.mjs --mutate "src/features/news/components/StoryPriorityForms.tsx,src/features/news/components/StoryQueueSection.tsx"
  //
  // One known trade-off versus the former single-tier run: one `cn` mutant in
  // `src/lib/utils.ts` moves from Timeout to NoCoverage, because its previous
  // coverage came incidentally from component tests.
  //
  // `HomepageArticleBlock.tsx`'s remaining survivors are all Tailwind class
  // strings emptied to ``. A test that asserted on them would pin the styling
  // rather than the behaviour, which is the trade this tier refuses.
  //
  // Measured 2026-08-28 with `npx stryker run
  // stryker.component.config.mjs --mutate
  // "src/components/ui/area-navigation.tsx,src/features/news/actions/editorialCredentialActions.ts,packages/editorial-access/lib/ui/EditorialClientsManager.tsx,packages/editorial-access/lib/ui/EditorialPersonalAccessTokenList.tsx"`:
  // 321 initially surviving mutants. Behavioral tests added from that report
  // cover authorization, validation, routing, creation, issuance, copy and
  // revocation states. Styling classes and unreachable Zod fallback strings
  // remain intentionally unasserted.
  //
  // Reproduce with:
  //
  //   pnpm run test:mutation:component
  //
  // Measured 2026-08-29 for #473 with the Delegation action and list narrowed
  // by `--mutate`: 118 mutants, 64.41% total (76 killed, 31 survived, 11
  // without coverage, none timed out or errored). Ordinary tests added from
  // that single pass prove terminal and expiry copy, singular/empty evidence,
  // numeric action validation, dialog recovery and every pending-state lock.
  // Remaining signal is styling, logging and Zod fallbacks unreachable through
  // valid action results; mutation was not rerun.
  //
  // Measured 2026-08-29 for #405 with `AuthContext.tsx`, `getCurrentUser.ts`
  // and `synchronizeSession.ts` narrowed by `--mutate`: 85 mutants, 54.22%
  // total / 60.81% covered (45 killed, 29 survived, 9 without coverage and 2
  // runner errors). The single pass exposed the exact session-cookie key and
  // the provider's login/register, credential forwarding, refusal, missing
  // synchronized user and unsupported-method paths; ordinary behavioural
  // tests now cover them, and mutation was not rerun.
  //
  // The remaining report entries are accounted for without pinning internals:
  // changing the read-only adapter's cookie key leaves its deliberately equal
  // missing/invalid `null` result unchanged; replacing `[]` with one constant
  // dependency leaves mount-only effect semantics unchanged; context defaults
  // are unreachable because the root layout always installs the provider; and
  // the logout catch block/string are logging only. The two runner errors were
  // login/register selection mutants; the ordinary outcome tests now exercise
  // both selections.
  //
  // Measured 2026-08-29 for #399 with the seven changed runtime files narrowed
  // by `--mutate`: 490 mutants, 66.53% total / 75.64% covered (326 killed,
  // 105 survived, 59 without coverage, none timed out or errored). The report
  // was triaged once, then ordinary tests were added without rerunning mutation.
  // They cover every behavioural group exposed by that report: required ad
  // fields and exact create/update payloads; default-profile resolution; the
  // 1MB upload boundary and optional metadata; profile MIME types, replacement
  // and best-effort old-photo deletion; signed-out media access and list kind;
  // form initialization, loading, create/update errors, image serialization and
  // upload failure; and picker loading, create refusal, reload failure, id-based
  // selection and a registration absent from the fresh read.
  //
  // The entries intentionally left as noise are `console.error` strings;
  // Tailwind, whitespace and capitalization-only UI mutations; empty wrappers
  // that add no text or accessible name; and optional-chaining rewrites that are
  // equivalent under the now-discriminated action result contracts. The
  // type-only `src/features/media/mediaOptions.ts` change has no runtime rule
  // and is excluded from mutation scope.
  //
  // Measured 2026-08-30 for #548 with the five affected component-tier files
  // narrowed by `--mutate`: 566 mutants, 68.73% total / 71.38% covered (389
  // killed, 156 survived, 21 without coverage, none timed out or errored).
  // Ordinary tests added after that single pass prove all changed observable
  // rules: the three cache paths after presentation; every decision, evidence
  // origin, attribution, priority and identity branch; first, unchanged,
  // singular, plural and text-only differences; and queue count, empty,
  // suspension and delegation states. Mutation was not rerun.
  //
  // Every remaining report entry is accounted for by file. The 22 unchanged
  // action entries are the established Zod fallback/logging baseline, while
  // the two new cache-path survivors are covered by the ordinary side-effect
  // assertion. All 42 Draft-form entries sit outside its changed review-link
  // lines; mutants on that link were killed. The review view's remaining
  // entries are layout/whitespace variants or the `previousEvidence` fallback
  // that the DB builder cannot omit when a previous Submission exists. The
  // queue's remaining whitespace separator is presentation-only. All five
  // priority-map survivors change Tailwind Badge variants rather than labels,
  // order or readiness, so tests intentionally do not pin those classes.
  //
  // Measured 2026-08-30 for #567 with the Source Permission action, manager
  // and presentation map narrowed by `--mutate`: 134 mutants, 76.12% total /
  // 77.27% covered (102 killed, 30 survived, 2 without coverage, none timed
  // out or errored), 1m31s. Ordinary tests added after the single pass prove
  // default and cleared fields, pending locks and labels, error recovery and
  // generic TypeError mapping. The Playwright journey covers native-submit
  // behavior; remaining entries are whitespace, Badge styling, logging and
  // unreachable Zod fallbacks. Mutation was not rerun.
  //
  // Measured 2026-08-30 for #569 with its 14 affected component files narrowed
  // by `--mutate`: 631 mutants, 47.30% total / 72.86% covered (294 killed, 111
  // survived, 221 without coverage, 4 timed out and 1 errored). The report
  // exists, so this is the tier's single pass even though it is below `break`.
  // Ordinary tests added afterward prove empty-file and upload refusals,
  // failed metadata updates, authorized list/report pages and cursors, empty
  // and blank reference inputs, active-and-referenced public delivery, the
  // full Media passed into preview URL derivation, all structured provenance
  // form variants and round trips, and the private response's `nosniff`
  // header. Mutation was not rerun.
  //
  // The report is accounted for file by file. In `createMedia.ts:29-80` and
  // `updateMedia.ts:21-48`, the observable authorization, validation, zero-size,
  // upload/registration/update failure and cache outcomes are covered; what
  // remains is log/error wording, unreachable Zod fallbacks and object-literal
  // construction. `getMedia.ts:16-43`, `getMediaByIds.ts:13-34`, and
  // `getMediaOptions.ts:45-62` now have direct tests for every authorization,
  // empty-input, cursor, report, published-reference and read-failure branch;
  // remaining string/object mutants are presentation or equivalent optional
  // object spreads. `mediaForm.ts:11-190` now has direct schema and canonical
  // round-trip tests for every origin/basis; its four timeouts and one runner
  // error mutate generated Zod/control-flow internals whose public acceptance
  // and rejection outcomes those tests cover. `mediaOptions.ts:28` is covered
  // through a field-derived preview result, and `route.ts:24` through the exact
  // response header.
  //
  // In `MediaForm.tsx:32-144`, `MediaMetadataFields.tsx:41-240`, and
  // `MediaPicker.tsx:59-218`, remaining entries change Tailwind/markup strings,
  // empty wrappers, loading-copy, or React/Radix plumbing; tests cover payloads,
  // errors, basis-dependent fields, selection, reload and pagination without
  // pinning those internals. `MediaEditDialog.tsx:26-72` has its edit/revision
  // journey covered by the admin E2E test; its report entries are Radix state
  // glue and presentation. `MediaImage.tsx:11-18` and
  // `MediaPickerPreview.tsx:16-39` are display-only wrappers whose uncovered
  // blocks add no rule beyond the tested picker/preview boundary.
  //
  // The remaining changed runtime files were deliberately excluded during
  // scope preparation: `packages/media/index.ts` and
  // `hasArticleMediaReferenceUseCase.ts` are one-line export/adapters with no
  // branch; `persistLegacyMediaForTests.ts` and the Playwright POM are test
  // support; `migrate-media.mjs` only invokes the tested transition package;
  // the admin/news pages and `HomepageArticles.tsx` contain static layout or
  // pass already-tested Media values through; package scripts, indexes and
  // docs are declarative rather than runtime rules.
  thresholds: {
    high: 80,
    low: 40,
    break: 74,
  },
};

export default config;
