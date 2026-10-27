#!/usr/bin/env bash
# Session start — install locked dependencies once in a fresh worktree.
set -euo pipefail

root=$(git rev-parse --show-toplevel 2> /dev/null) || exit 0
[ -x "$root/node_modules/.bin/next" ] && exit 0

cd "$root"
if command -v mise > /dev/null 2>&1; then
  mise exec -- pnpm install --frozen-lockfile
else
  pnpm install --frozen-lockfile
fi
