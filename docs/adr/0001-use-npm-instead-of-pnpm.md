---
record: adr
id: "0001"
status: accepted
decided: 2025-11-20
---

# 1. Use npm instead of pnpm

## Context

The project requires a package manager to handle dependencies. The team strongly favors [pnpm](https://pnpm.io/) due to its superior performance, efficient disk space usage, and strict dependency management.

However, the project relies on Firebase, and specifically uses Firebase Emulators for local development. Currently, Firebase Emulators have compatibility issues with pnpm's symlinked `node_modules` structure.

## Decision

We will use **npm** as the package manager for this project.

## Consequences

### Positive
- Fully compatible with Firebase Emulators and the wider Firebase ecosystem.
- No additional configuration or workarounds required for deployment or local development with Firebase tools.
- Pre-installed with Node.js, reducing setup steps for new developers.

### Negative
- Slower dependency installation compared to pnpm.
- Less efficient use of disk space (no content-addressable store).
- "Phantom dependencies" are possible (npm flattens dependencies, allowing access to packages not explicitly declared in `package.json`), unlike pnpm's strict mode.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0001-use-npm-instead-of-pnpm.md) preserves earlier dated wording and superseded clauses.
