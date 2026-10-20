#!/usr/bin/env bash
# PostToolUse file edits — corrige o que o eslint corrige sozinho e devolve o
# que sobrou, nos arquivos que acabaram de ser tocados. Aceita os payloads de
# Claude Code, Antigravity e Codex.
#
# Motivo: sem isto o erro de lint só aparece no fim da tarefa, ou nunca. Aqui ele
# volta na hora, junto do arquivo que o causou.
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

failures=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    /*) absolute_file="$file" ;;
    *) absolute_file="$root/$file" ;;
  esac
  [ -f "$absolute_file" ] || continue

  case "$absolute_file" in
    "$root"/*) ;;
    *) continue ;;
  esac

  case "$absolute_file" in
    *.ts | *.tsx | *.js | *.jsx | *.mjs | *.json | *.jsonc | *.md | *.yml | *.yaml | *.css) ;;
    *) continue ;;
  esac

  npx eslint --fix "$absolute_file" > /dev/null 2>&1
  if ! remaining=$(npx eslint "$absolute_file" 2>&1); then
    failures="${failures}
eslint ainda reclama de ${absolute_file} depois do --fix:

${remaining}
"
  fi
done <<EOF
$files
EOF

if [ -n "$failures" ]; then
  printf '%s\n' "$failures" >&2
  exit 2
fi

if printf '%s' "$payload" | jq -e '.conversationId' > /dev/null 2>&1; then
  printf '{}\n'
fi
