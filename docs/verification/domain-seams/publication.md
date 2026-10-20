# Verificação do piloto de publicação

Auditoria de [#778](https://github.com/BetoFrega/macae-classificados/issues/778),
contra os critérios de [#770](https://github.com/BetoFrega/macae-classificados/issues/770).
A spec define o escopo; a [política](../../agents/domain-infrastructure-seams.md)
define a regra arquitetural. Este registro reúne evidências, não redefine os contratos.

## Base e evidências

Inspeção em 2026-09-07 de `origin/main` em `13de607b3c2c7f40406128253d2ba1829109d191`.
Os arquivos do piloto não diferem do head validado da PR #783:

```sh
git diff --exit-code 76dcaad67ebe8fe688e2bc5a5be64fddba1ff084 13de607 -- src/packages/ads bin/domain-seams.mjs bin/domainSeams.test.ts bin/probe-domain-seam.mjs domain-seams.json tests/ads/publish-as-visitor.spec.ts
npm run lint:boundaries
npm run test:unit -- src/packages/ads/tests/publicationDrafts.test.ts bin/domainSeams.test.ts
```

Resultado: diff vazio, sete operações protegidas e 28 testes focais passaram.
O [CI da PR #783](https://github.com/BetoFrega/macae-classificados/actions/runs/34126973416)
passou com 1874 testes unitários, 471 de integração e 107 de staging-control.
Verificação: `gh run view 34126973416 --log`.
Lint obrigatório também passou; verificação: `gh pr checks 783 --required`.

A jornada local `tests/ads/publish-as-visitor.spec.ts` passou (1/1), incluindo build
de produção, publicação, pausa e repetição rejeitada. Reprodução:

```sh
task_e2e_tmp=$(mktemp -d /tmp/publication-e2e.XXXXXX)
TMPDIR="$task_e2e_tmp" npm run test:e2e -- tests/ads/publish-as-visitor.spec.ts
```

## Matriz de aceitação

Os números referem-se, na ordem, aos critérios da spec. As fontes abaixo são relativas
à raiz do repositório e podem ser inspecionadas com `git show 13de607:<caminho>`.

| Critério | Evidência e alcance | Resultado / lacuna |
| --- | --- | --- |
| 1. Sete operações e contrato | `src/packages/ads/publication.ts` mantém os sete exports e os delega à fábrica. `src/packages/ads/tests/publicationDrafts.test.ts` exercita salvar, ler, listar, perfil, publicar, concluir e excluir pela entrada pública controlável. | Atendido; nenhuma operação residual. |
| 2. Unidade hermética | O mesmo teste importa `publicationDrafts.ts`, com store e relógio controlados, sem mockar regras. O probe executa sete operações em processo com credenciais removidas e efeitos incidentais rejeitados. Os 28 testes focais passaram sem iniciar emuladores. | Atendido para o piloto; não afirma hermeticidade de toda a suíte. |
| 3. Decisões independentes | `src/packages/ads/lib/publicationDrafts.ts` contém propriedade, elegibilidade e transições. Os tipos da porta em `publicationDrafts.ts` não dependem do SDK; o grafo transitivo passa no checker. | Atendido; composição de produção permanece ligada ao adapter. |
| 4. Garantias reais | `src/packages/ads/lib/db/publicationDraftStore.ts` executa decisões dentro de `db.runTransaction`. `publication.integration.test.ts` prova saves concorrentes, associação atômica, preservação de campos, consultas por conta, publicação idempotente e corrida publicar/excluir no Firestore. | Atendido com integração real, não inferido do fake. |
| 5. Jornada | `tests/ads/publish-as-visitor.spec.ts` preserva a publicação do visitante e verifica pausa seguida de tentativa de publicação. Execução local 1/1. | Atendido no ambiente local; não é recibo de produção. |
| 6. Remoção de redundância | `git diff --no-ext-diff 3243f6c 13de607 -- src/packages/ads/tests/publication.integration.test.ts tests/ads/publish-as-visitor.spec.ts` mostra extensão da cobertura existente, sem retirada de cenários. | Atendido; não houve remoção que exigisse substituição. |
| 7. Fiscalização bloqueante | `bin/domain-seams.mjs` segue imports diretos/transitivos e de tipos. `bin/domainSeams.test.ts` rejeita import proibido direto/transitivo, efeito na importação/construção e operação não executada. `package.json` conecta o checker ao lint obrigatório. | Atendido; seis casos do checker passaram. |
| 8. Expansão/redução | O registro contém sete operações e `remainingOperations: []`. O checker compara com a base Git e os testes comprovam expansão aceita e remoção/relocalização rejeitadas. `.github/workflows/lint.yml` obtém histórico; a política documenta expansão. | Atendido; base indisponível falha explicitamente. |
| 9. Resíduos/redesign | O adapter legado `publicationStore.ts` foi removido. O adapter atual só mapeia SDK e executa efeitos. Não foi identificado redesign indispensável no piloto. A evolução de mídia fica em #786. | Atendido; nenhum resíduo de operação do piloto transferido para depois. |
| 10. Checks/limites | Este registro identifica comandos, SHA, CI, jornada e limites. | Atendido; nenhum ganho de duração é alegado. |

## Limites e continuidade

O probe complementa análise estática e testes de comportamento; não é um sandbox
universal nem prova garantias transacionais. O isolamento de diretório temporário
mitiga o defeito preexistente [#618](https://github.com/BetoFrega/macae-classificados/issues/618)
dos emuladores concorrentes. Ele não altera regras nem enfraquece checks do piloto.
A asserção de foco que falhou no primeiro CI foi corrigida para aguardar o efeito
observável, mantendo a exigência do elemento exato; o CI subsequente passou.

Nenhuma lacuna indispensável do piloto foi identificada nesta auditoria.
A proposta [#786](https://github.com/BetoFrega/macae-classificados/issues/786) é a fonte
canônica do próximo recorte e de sua triagem. Mídia permanece antes de autenticação:
`mediaIngestionUseCases.ts` e `mediaIngestionDb.ts` ainda misturam preparação/reserva
com infraestrutura; `authentication/lib/resolveSessionUseCase.ts` mistura resolução
com SDK e ambiente. Verificação: `rg -n 'firebase-server|appEnv|Date.now|reserveMediaUpload' src/packages/media/lib src/integrations/authentication`.
Essas migrações não fazem parte da aceitação da #770 nem foram iniciadas.
