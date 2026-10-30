# Deep modules

Copy `example/` when starting a package:

```text
src/packages/<name>/
  index.ts
  client.ts
  lib/
  tests/
```

**Entry points.** Root files are the package interface. Import a package only through those entry points; every file in a subfolder is private implementation. A package may expose several focused root files.

**Intra-package freedom.** Files inside one package may import its internals freely. Packages are flat: a package cannot contain another package.

**Tests through the interface.** Tests live in `tests/`, import the package through root entry points, and may share fixtures only from their own `tests/` folder. They never import `lib/` directly.

**Infrastructure seams.** For new or changed domain behaviour, follow [Domain Infrastructure Seams](../../docs/agents/domain-infrastructure-seams.md), including composition entry points and gradual migration of existing coupling.

**No cycles.** Package dependencies must remain acyclic. Run `pnpm run lint:boundaries` to check package rules and the [protected domain seams](../../docs/agents/domain-infrastructure-seams.md#fitness-function).

Avoid barrel files that re-export a whole subtree. Add several small entry points when callers need distinct interfaces, and keep the implementation hidden in `lib/`.

Migrated npm modules live in root `packages/` and obey these same interface rules.
Their orchestration and transitional inputs are documented in
[workspace orchestration](../../docs/agents/workspace-orchestration.md).
