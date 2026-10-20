#!/usr/bin/env bash

set -euo pipefail

# Resolve user-owned installations without pinning a plugin cache version.
skill_root="$(node --input-type=module <<'JS'
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const home = homedir();
const candidates = [
  path.join(home, ".agents/skills/impeccable"),
  path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "skills/impeccable"),
  path.join(home, ".claude/skills/impeccable"),
];
try {
  const registry = JSON.parse(readFileSync(path.join(home, ".claude/plugins/installed_plugins.json"), "utf8"));
  for (const [name, installations] of Object.entries(registry.plugins || {})) {
    if (!name.startsWith("impeccable@")) continue;
    for (const installation of installations) {
      if (installation.scope === "user" && typeof installation.installPath === "string") {
        candidates.push(path.join(installation.installPath, "skills/impeccable"));
      }
    }
  }
} catch {
  // An unavailable registry leaves direct user installations eligible.
}
const root = candidates.find(candidate =>
  existsSync(path.join(candidate, "scripts/impeccable")) ||
  existsSync(path.join(candidate, "scripts/hook.mjs"))
);
if (root) process.stdout.write(root);
JS
)"

if [[ -z "$skill_root" ]]; then
  exit 0
fi

if [[ -f "$skill_root/scripts/impeccable" ]]; then
  exec "$skill_root/scripts/impeccable" hook
fi

exec node "$skill_root/scripts/hook.mjs"
