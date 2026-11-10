---
trigger: when_working_on_a_feature_or_remote_configuration
---

# Feature flags and remote config

Every feature task starts with a rollout classification: `flagged` or `unflagged`.
Make it in the first planning step and before implementation or test design; record the
decision and a one-sentence rationale in the work plan or delivery record. Reassess it
when scope, dependencies or blast radius change.

Classify a change as `flagged` when it needs staged exposure, depends on an external
service, has a broad blast radius, tests an unresolved behavior hypothesis or would be
slow to roll back through deployment. Classify a deterministic correction, refactor or
low-risk change as `unflagged` unless one of those conditions also applies. A flag is a
release control, never an authorization or security boundary.

## Provider

New flags live in [Cloudflare Flagship](https://developers.cloudflare.com/flagship/),
app `tudo-macae` (decided by Beto on 2026-11-09). The web Worker reads them through the
`FLAGS` binding in `wrangler.web.jsonc`; `src/integrations/release-control/flagshipFlag.ts`
is the app seam, and outside the Worker build it resolves every flag to its safe default.
Wrangler's local flag store starts empty, so local runs and E2E see the safe default
unless a test adds the flag with `wrangler flagship flags create --local`.

Flags created before that date still live in PostHog
(`grep -rn createPostHogFlagReader src`); migrate one by recreating it in Flagship with
its current state before switching its reader.

## Choose the control type

Choose by the decision the application consumes; record the type and rationale in
the work plan or delivery record before implementation or test design.

| Decision | Flagship variant | Example |
|---|---|---|
| Enable or disable a capability, including a temporary global rollout | Boolean | Enable D1 sitemap reads |
| Serve named alternatives to different audiences | String variants with targeting rules | `control` or `new` by audience |
| Deliver application settings with the same payload for every caller | JSON variant (remote config) | `{"source":"d1","timeoutMs":3000}` |

All three support changes without redeployment when the application already
interprets the served value. A global audience alone does not require remote config;
a temporary on/off migration switch can remain boolean. Choose remote config when
explicit values or several related parameters express the operational decision.

For remote config, define the payload schema, established defaults, evaluation
boundary and owner. Validate the payload at that boundary; missing, malformed or
unavailable configuration preserves the established behavior. Test valid payloads
and those failure states through the narrowest public seam. Persistent configuration
remains while its settings are used; remove it when its consumers are retired.

Evaluate on the server through the binding; it needs no API token. Use the
`*Details` methods and treat any `errorCode` as unavailable, because the typed methods
return the default silently for an unknown flag or a type mismatch.

Provider behavior: [Flagship concepts](https://developers.cloudflare.com/flagship/concepts/)
and [evaluation reasons](https://developers.cloudflare.com/flagship/reference/evaluation-reasons/).

## Temporary rollout contract

- Create the flag off before merging the gated code. Missing, delayed, malformed and
  failed evaluations resolve to the established behavior.
- Evaluate once at the composition boundary. When the decision affects server-rendered
  output, layout or loading performance, resolve it before rendering or at the serving
  edge; client-side flicker is not an acceptable rollout mechanism.
- Record the owner, purpose, initial audience, success and rollback signals and the
  removal condition in the delivery record. Do not open a removal ticket: the flag
  stays until the product owner approves its removal, a decision taken outside the
  repository.
- Test the enabled, disabled and unavailable states through the narrowest public seam.
  Preserve an integrated test when only a browser can prove the transition.
- Activate only after both implementations and their dependencies are verified. Expand
  deliberately; disable first on rollback, then remove unused infrastructure.
- Agents may enable and keep a flag on throughout testing, without repeated approval,
  when targeting is restricted to the exact test user.
- Once the product owner approves removal, remove the flag and losing branch after
  full adoption, or the gated branch after abandonment. Do not reuse the key for
  another feature.

The flag provider owns runtime release state. The repository owns the key, safe default,
evaluation boundary and lifecycle evidence; neither source silently substitutes for
the other.
