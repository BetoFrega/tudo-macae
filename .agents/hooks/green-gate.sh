#!/usr/bin/env bash
# Stop — o portão de verde. Impede que a tarefa termine com o repositório
# vermelho, em vez de pedir num checklist que o agente rode os comandos.
#
# Um portão que nunca fica verde é pior que portão nenhum: o agente aprende a
# ignorá-lo. Por isso cada verificação só roda quando pode dar veredito honesto.
#
# - eslint (~8s): sempre. É hermético.
# - tsc --noEmit (~4s): só com `.next/types` ou `.next/dev/types` presentes. O
#   tsconfig inclui esses diretórios, e o Next só os gera no build ou no dev —
#   sem eles, tsc acusa 10 erros de PageProps e de módulos .svg que não são
#   erros de verdade. Quem typecheca de fato é `next build`.
# - tiers unitário e de integração (~50s): sempre. O de integração sobe o
#   próprio fixture do API Worker, então os dois são herméticos.
#
# O build e E2E ficam de fora deste hook por custo. A entrega manual usa
# `npm run build:check`; E2E exige execução local/manual explícita.
# O procedimento de entrega está em docs/agents/production-delivery.md.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2> /dev/null || pwd)" || exit 0

# Turno de conversa não paga o pedágio.
if [ -z "$(git status --porcelain -- src tests eslint-rules 2> /dev/null)" ]; then
  exit 0
fi

failures=""

record() {
  failures="${failures}
--- ${1}
${2}
"
}

if ! out=$(npx eslint . 2>&1); then
  record "npm run lint" "$out"
fi

if [ -d .next/types ] || [ -d .next/dev/types ]; then
  if ! out=$(npx tsc --noEmit 2>&1); then
    record "npx tsc --noEmit" "$out"
  fi
else
  echo "portão de verde: tipos gerados do Next ausentes, tsc não rodou (npm run dev ou npm run build:check para gerá-los)" >&2
fi

if ! out=$(npm test 2>&1 | tail -40); then
  record "npm test" "$out"
fi

if [ -n "$failures" ]; then
  printf 'O portão de verde falhou. Conserte antes de dar a tarefa por pronta.\n%s' "$failures" >&2
  exit 2
fi

exit 0
