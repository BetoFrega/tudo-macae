---
record: adr
id: "0047"
status: accepted
decided: 2026-10-27
---

# 47. Use pnpm as the package manager

## Context and requirements

[ADR 0001](0001-use-npm-instead-of-pnpm.md) kept npm only because Firebase
Emulators did not work with pnpm's symlinked `node_modules`. The repository no
longer depends on Firebase: on 2026-10-27, the last npm lockfile listed no
Firebase package (`git grep -c firebase 772ea75 -- package-lock.json` prints
nothing).

The repository is a workspace of 33 packages and apps whose boundaries
[workspace orchestration](../agents/workspace-orchestration.md) requires each
workspace to declare. npm hoists every dependency to the root, so an undeclared
import still resolves. Development uses several Git worktrees at once, and npm
installs a full copy of the dependencies in each one.

## Decision

Use pnpm, pinned by `packageManager` in `package.json`, for installation, scripts
and CI. Workspaces are listed in `pnpm-workspace.yaml`, and internal dependencies
use the `workspace:*` protocol. `pnpm-workspace.yaml` also holds the dependency
overrides that [ADR 0006](0006-npm-overrides-for-transitive-advisories.md) governs
and the allow-list of dependencies whose install scripts may run.

## Alternatives and consequences

These measurements were taken on 2026-10-27 in a cloud container on Node 22,
with a cold cache:

- An install took 21 s with pnpm and 36 s with `npm ci`. The `node_modules`
  directory took 1.1 GB with pnpm and 1.3 GB with npm.
- Two worktrees sharing one pnpm store took 1.1 GB for the store plus 73 MB per
  worktree, against 1.3 GB per worktree with npm. With the store warm, a second
  worktree installed in 1.6 s.
- Under pnpm, the root application failed to resolve `@tudomacae/classifieds-photos`,
  `@tudomacae/release-control`, `@tudomacae/design-foundations`, `vite` and
  `@stryker-mutator/api`, which it imported without declaring. The migration
  declares them.

Staying on npm and declaring those five dependencies costs nothing, but nothing
would stop the next undeclared import. Bun installs faster still, but it
keeps npm's flat `node_modules`, which loses the boundary check, and it would add
another tool to the stack.

Store sharing needs the store and the worktrees on the same volume. Otherwise
pnpm copies the files and the disk saving is lost. pnpm runs no dependency
install script that is missing from the allow-list, so a new dependency that
needs one fails to install until it is added there. Reconsider this decision if
a required tool cannot work with symlinked `node_modules`, which is what kept
the repository on npm before.
