# Domain infrastructure seams

## Required design

New domain behaviour must be testable without initializing infrastructure.
Persisted input does not make a rule persistence-dependent: decisions operate on
domain values; adapters obtain those values and apply the resulting effects.

- Keep business decisions in use cases or pure policies. Persistence adapters
  own SDK operations and mapping, not eligibility, authorization policy or domain
  transitions. Evaluate decisions against transaction reads inside the transaction
  when correctness requires atomicity; extraction must preserve that guarantee.
- Compose effectful modules with explicit dependencies for persistence, external
  services and behaviour-relevant time or randomness. Production composition owns
  SDK initialization and environment configuration. Importing a policy or building
  a module with test adapters must not initialize SDKs or require credentials.
- Define internal seams in domain terms, with only the operations the module
  needs. Keep SDK types and generic database query interfaces in adapters. Introduce
  a seam for a concrete substitution, such as production and in-memory adapters,
  rather than adding an interface to every helper.
- Preserve a small consumer interface. Routes and actions use production entry
  points; they do not assemble dependencies on each call. A focused root entry
  point may expose construction with explicit dependencies for module tests and
  composition. Keep adapter implementations private and avoid mutable global
  overrides or test-mode branches in production behaviour.

## Gradual migration

Every change to existing domain behaviour must migrate the smallest coherent
capability it touches to this design, including incidental infrastructure coupling
inside existing packages. A file move or a wrapper around the coupled implementation
does not satisfy migration. Unrelated capabilities remain outside the change.

### Before implementation

Inspect each affected capability from its public entry point through use cases,
production composition and persistence or service adapters. Trace SDK imports and
behaviour-relevant time or randomness; a package boundary or dynamic import alone
does not establish infrastructure isolation.

Before writing tests or implementation, report a compact inventory for every
affected capability: public entry point, current dependency construction, remaining
coupling, and the commands used to verify it. Classify each as already isolated,
requiring migration, or new behaviour. Identify which guarantees need real
infrastructure tests. Reuse verified policies and adapters when they fit.

State the smallest coherent migration alongside the functional change, including
the public test seams and any residual coupling. This step is complete when every
affected capability has an evidenced classification and an implementation and
verification path. Update the inventory if implementation expands the affected
capabilities; report inspection findings proactively rather than waiting for a
question about refactoring or adapters.

Implement new behaviour under the required design and migrate
the affected existing rules with it. If part of that migration cannot safely fit,
the PR must identify the exact residual coupling, the concrete safety or scope
constraint, and the next bounded migration step. This exception does not permit
adding new incidental coupling.

## Verification and completion

Tests exercise module operations through root entry points, including instances
constructed with controlled dependencies. Assert observable results and effects,
not private calls or their incidental ordering. Pure policies may have focused
entry points when they represent a coherent domain interface.

Use unit tests for decisions and orchestration with controlled adapters. Keep
integration coverage for actual adapter behaviour, transaction atomicity,
concurrency, query semantics and provider guarantees; an in-memory adapter does
not establish these. Preserve affected user journeys. Replace redundant tests only
after equivalent behavioural coverage exists, following
[Test Selection](test-selection.md).

A change is complete when new and migrated rules run without infrastructure,
affected infrastructure guarantees retain coverage, and any residual migration is
explicit in the PR. Report the checks run; claim efficiency gains only with a
before/after measurement of the affected test path.

## Fitness function

`domain-seams.json` is the registry of protected entry points, operations and
construction factories and isolated probes. `remainingOperations` makes an incremental cut explicit; it is
not protected coverage. `pnpm run lint:boundaries` checks each protected entry's
transitive source imports, including type imports, and runs its probe in a fresh
process without provider credentials. Local source is followed; only the reviewed
pure external dependencies `zod`, `remark-parse` and `unified` are allowed.
`remark-parse` and `unified` are used only for parsing Markdown syntax into an
AST; they own no application state or infrastructure. SDK, storage and persistence imports,
unresolved imports and computed dynamic imports fail closed. Production
composition and adapters live outside that graph.

Each probe imports the protected entry, constructs it with controlled dependencies
and exercises every registered operation. The runner observes successful calls
and rejects registered operations that the probe never executes. Network globals are trapped and provider
module loading is rejected. The probe complements the static check and behavioural
tests; it is not a general-purpose sandbox or proof of transaction correctness.
The checker tests include deliberately invalid import graphs and runtime effects.

For each migration, expand the existing entry's operations and probe or add a new
entry. Run the checker and relevant behavioural coverage before claiming protection.
The registry is compared with the PR base (`origin/main` locally); removing an
entry, operation, probe or protected entry path fails. CI fetches history for this
comparison. For a legitimate replacement in one reviewed migration, register the
new protected entry with `replaces: ["old-seam-id"]`; the checker requires one
unambiguous replacement and requires the old protected source to leave the tree. The
replacement becomes the next baseline. Report the protection impact explicitly.
A seam with no consumer and no replacement leaves the registry only when the same
PR lists it in `domain-seams.retired.json` with its `id` and `reason`; the checker
rejects a retired id that is still registered, a remaining probe, or an entry that
still names the factory. Retirements need the maintainer's review.
`DOMAIN_SEAMS_BASE` selects an explicit comparison ref for a local review, not a
way to waive a failing PR check. An unavailable base fails rather than silently
turning off reduction detection.
