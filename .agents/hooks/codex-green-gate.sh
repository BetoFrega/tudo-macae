#!/usr/bin/env bash
set -uo pipefail

cat > /dev/null
root=$(git rev-parse --show-toplevel 2> /dev/null) || {
  printf '{}\n'
  exit 0
}

if output=$("$root/.agents/hooks/green-gate.sh" 2>&1); then
  [ -z "$output" ] || printf '%s\n' "$output" >&2
  printf '{}\n'
else
  jq -nc --arg reason "$output" '{decision: "block", reason: $reason}'
fi
