#!/usr/bin/env bash
# PreToolUse file edits — pede confirmação humana antes de alterar o arquivo que
# define o carregamento de imagem. Aceita os payloads de Claude Code, Antigravity
# e Codex.
set -uo pipefail

payload=$(cat)
root=$(git rev-parse --show-toplevel 2> /dev/null) || exit 0

files=$(printf '%s' "$payload" | jq -r '
  .tool_response.filePath?,
  .tool_input.file_path?,
  .toolCall.args.TargetFile?
' 2> /dev/null)

patch=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2> /dev/null)
if [ -n "$patch" ]; then
  patch_files=$(printf '%s\n' "$patch" | sed -nE 's/^\*\*\* (Add|Update|Delete) File: //p')
  files="${files}
${patch_files}"
fi

protected=false
while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    /*) absolute_file="$file" ;;
    *) absolute_file="$root/$file" ;;
  esac
  case "$absolute_file" in
    "$root"/next.config.ts)
      protected=true
      break
      ;;
  esac
done <<EOF
$files
EOF

[ "$protected" = true ] || {
  if printf '%s' "$payload" | jq -e '.conversationId' > /dev/null 2>&1; then
    printf '{}\n'
  fi
  exit 0
}

read -r -d '' reason <<'EOF' || true
Este arquivo é guardado de propósito.

- next.config.ts já cobre o bucket inteiro por host em remotePatterns; mídia nova
  não precisa de entrada nova.

Se a alteração é mesmo necessária, confirme com a pessoa antes de seguir.
EOF

if printf '%s' "$payload" | jq -e '.conversationId' > /dev/null 2>&1; then
  jq -nc --arg r "$reason" '{decision: "ask", reason: $r}'
elif printf '%s' "$payload" | jq -e '.hook_event_name' > /dev/null 2>&1; then
  jq -nc --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ($r + "\n\nCodex não oferece ask em PreToolUse. Depois da confirmação, desative este hook para a edição em /hooks e reative-o em seguida.")
    }
  }'
else
  jq -nc --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $r
    }
  }'
fi
