# Mutation context scenarios

These are acceptance fixtures for [Kill Mutants](../../.agents/skills/kill-mutants/SKILL.md),
not a second execution policy. Review each input by following that skill from
`AGENTS.md`. First decide whether the likely discovery value justifies the cost.
The invocation outcomes below apply only after opting in; omission never blocks
delivery. Then compare the proposed commands and exclusions with these outcomes.

| Input diff from the review base, after opting in | Expected outcome |
|---|---|
| Only `packages/text-normalization/slugify.ts:84-87` changes at runtime; `src/lib/utils.ts` is unchanged | One pure invocation with `--mutate 'packages/text-normalization/slugify.ts:84-87'`; no neighboring file, component or integration invocation |
| `packages/text-normalization/slugify.ts`, `src/features/navigation/UserSidebar.tsx:24-28` and `:30-37`, and `src/packages/demo-seed/lib/environment.ts` change at runtime | The three shell examples in the skill deliver exactly these paths/ranges to their respective tiers |
| A runtime file matches zero tiers or two tiers | No Stryker process; identify the missing or conflicting membership before execution |
| Only README prose, a type alias, static markup and a generated artifact change | No Stryker process; exclusions identify respectively documentation, erased type, no interaction/branch, and generated output without a handwritten runtime rule |
| A valid report contains survivors | Triage every survivor; verify useful new public-behavior tests with the ordinary suite and finish without another mutation run |

The first and fourth scenarios also require the context review.

## Measured focal probe

Measured 2026-09-04 against source base
`f2b7440e7798047f1374cfceb39e598b2a6e56dd`: the first scenario uses a
representative diff scope; `slugify.ts` itself is unchanged by this documentation
work. Reproduce the probe with:

```bash
mise exec -- npm run test:mutation:pure -- --mutate 'src/lib/slugify.ts:84-87'
```

Stryker produced `reports/mutation-pure/mutation.html` in 5 seconds: only
`src/lib/slugify.ts`, five mutants, three killed, two survived, none uncovered or
errored. Neither other tier started. The first sandbox attempt produced no report
because its logging socket failed with `listen EPERM`; the environment retry
produced this single completed report.

The pure config records a full-tier baseline measured 2026-08-28 at 72 seconds:
this probe took about 7% of that historical duration. Different source dates and
machine load make this a scope-cost illustration, not a controlled speed benchmark.
No full mutation run was started for comparison.

Both survivors are equivalent at line 84: `slug.length >= 100` and unconditional
`true` enter the truncation block for an already bounded slug. Earlier normalization
has removed trailing hyphens, so `substring(0, 100)` and the following trailing-hyphen
removal leave that value unchanged. Inputs longer than 100 still take the original
block. No behavioral gap or new test follows from these two mutants; no rerun.

For the actual delivery diff, exclusions are the skill, scenarios and routing prose;
config comments; test fixtures; and static help copy with no changed control flow.
They carry no changed runtime rule to probe after review. The separate representative
probe above is the issue's operational evidence, not mutation of this delivery diff.
