# Sequência de desacoplamento de domínio

Checklist canônico da sequência iniciada pela #770. A regra é
[Domain Infrastructure Seams](../../agents/domain-infrastructure-seams.md).
Uma família inventariada não equivale a capacidade auditada. A conclusão exige
inspeção de todas as regras e grafos de importação, não apenas tickets fechados.
Executor único; um ticket por vez. Decisões que ampliem comportamento serão reunidas
em um único ticket de decisões pendentes, criado quando houver a primeira decisão.

## Capacidades verificadas

| Capacidade | Evidência de entrega | Estado |
| --- | --- | --- |
| Publicação de anúncios, sete operações | #775–#778, PRs #780/#782/#783/#787; [matriz](publication.md) | Migrada e protegida |
| Preparação/reserva de upload | #786, PR #805; fábrica e probe `media-upload-preparation` | Migrada e protegida |
| Finalização de upload | #804, PR #811; fábrica e probe `media-upload-finalization` | Migrada e protegida |
| Planejamento e limpeza de quarentena | #810, PR #816, merge `43392945`; probe `media-quarantine-cleanup` | Migrada e protegida |
| Consultas de metadados/resultado de upload | #815, PR #820, merge `c86da4ce`; probe `media-upload-queries` | Migrada e protegida |
| Busca paginada e relatório de Mídias sem referência | #818, PR #824, merge `0180ecf6`; probe `media-catalog-search` | Migrada e protegida |
| Revisão canônica de metadados e coordenação editorial | #823; brief issuecomment-5574112036; base `0180ecf6` | Em implementação |

A proteção efetiva é verificada por `npm run lint:boundaries`; registro canônico
em `domain-seams.json`. Evidências de execução e CI de cada entrega ficam nas PRs.

## Inventário para auditoria global

Inventário inicial observado em 2026-09-07, base `2f392573`. Comandos:

```sh
rg --files src/packages
rg --files src/features
rg -n 'firebase|next/|process.env|Date.now|randomUUID|fetch\(' src/packages src/features
```

| Família | Estado de auditoria completa |
| --- | --- |
| ads | Publicação migrada; demais capacidades ainda não auditadas |
| media | Preparação/finalização migradas; demais capacidades ainda não auditadas |
| authentication | Resolução de sessão identificada como acoplada; auditoria restante |
| editorial | Não auditada |
| editorial-mcp e editorial-mcp-client | Classificar regras de domínio versus adapters legítimos |
| editorial-preflight | Não auditada |
| news-cache | Classificar política versus adapter de cache |
| demo-seed | Classificar finalidade e aplicabilidade da política |
| example | Template aritmético puro; três arquivos auditados, sem migração necessária |
| staging-control e staging-operations-mcp | Classificar regras operacionais versus adapters legítimos |
| Capacidades legadas em src/features | Inventariar regras por capacidade, incluindo os use cases fora de packages |
| Regras compartilhadas em src/lib e demais diretórios src | Classificar e seguir dependências transitivas |

Auditoria de `example` em 2026-09-07, base `c86da4ce`: `rg --files src/packages/example`
e `cat src/packages/example/index.ts src/packages/example/lib/impl.ts src/packages/example/tests/example.test.ts`.
A interface chama apenas aritmética pura; o único import de retorno é de tipo.

Nenhuma família não auditada é considerada concluída. O inventário será refinado
por capacidades ao longo da execução, sem criar uma fila antecipada de tickets.

## Bloqueios e encerramento

Nenhuma decisão bloqueante identificada até o início da #810. Quando existir,
registrar no ticket consolidado problema, evidências, recortes bloqueados,
alternativas e recomendação. Trabalhos independentes continuam.

- Pendente: Todas as capacidades de domínio identificadas e classificadas em origin/main.
- Pendente: Todas as migrações necessárias entregues com checks, revisão e merge.
- Pendente: Fiscalização ampliada sem redução de proteção.
- Pendente: Garantias reais e jornadas preservadas; equivalência documentada nas remoções.
- Pendente: Nenhum acoplamento incidental contrário à política restante.
- Pendente: Nenhuma decisão pendente impede conclusão; caso contrário, objetivo incompleto.
