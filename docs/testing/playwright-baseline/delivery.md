# Entrega da spec #765

Checklist canônico do executor único. Alterar estados somente com evidência do
tracker, checks e origin/main. O inventário de cobertura permanece em
[inventory.json](inventory.json); este arquivo acompanha a entrega dos tickets.

| Ticket | Escopo | Estado comprovado | Evidência |
| --- | --- | --- | --- |
| #771 | Baseline e inventário | Concluído: PR #779 merged, #771 closed, main 1218076 | PR #779; baseline completo em measurement.json |
| #772 | Separar harness | Concluído: PR #784 merged, #772 closed, main f6afc12 | harness-separation.json; CI verde |
| #773 | Consolidar anúncios | Concluído: PR #785 merged, #773 closed, main 5e2b528 | ad-controls-consolidation.json; CI verde |
| #774 | Publicar continuidade | Concluído: PR #800 merged, #774 closed, main 80dfe28 | Tickets e onze bloqueios da #797 verificados |
| #797 | Auditoria final de cobertura e medição integral | Validações locais aprovadas: 108 E2Es, 75 unitários e 71 integrações; estado de integração na PR #827 | [PR #827](https://github.com/BetoFrega/macae-classificados/pull/827); final-audit.md; final-measurement.json |
| #788 | Consolidar a matriz de acesso sem repetir rotas para o mesmo papel | Concluído: PR #807 merged, #788 closed, main fe851b4 | access-matrix-consolidation.json; CI verde |
| #789 | Migrar os contadores do formulário de anúncio para cobertura de componente | Concluído: PR #808 merged, #789 closed, main 4086d78 | ad-counters-migration.json; CI verde |
| #790 | Revisar a cobertura temporal do controle MCP preservando runtime e apresentação | Concluído: PR #812 merged, #790 closed, main aa444f6 | mcp-control-expiry.json; CI verde |
| #791 | Redistribuir variantes MCP de organização e prioridade de pauta | Concluído: PR #813 merged, #791 closed, main a7bb1cc | mcp-story-variants.json; CI verde |
| #792 | Redistribuir variantes MCP de revisão e reapresentação de rascunho | Concluído: PR #814 merged, #792 closed, main 0d5585d | mcp-draft-variants.json; CI verde |
| #793 | Redistribuir paginação e auditoria das leituras MCP preservando HTTP real | Concluído: PR #817 merged, #793 closed, main c320c6c | mcp-read-contracts.json |
| #794 | Revisar o custo da prova de rate limit MCP e sua fronteira de produção | Concluído: PR #821 merged, #794 closed, main 13a37af | mcp-rate-limit.json |
| #795 | Migrar a unicidade de Fonte por URL canônica para integração | Concluído: PR #822 merged, #795 closed, main c8ba6cb | source-uniqueness.json |
| #796 | Migrar estrutura de formulário e renderização segura de Captura para componente | Concluído: PR #825 merged, #796 closed, main a9a6ad4 | capture-components.json; 117 Playwright passaram após rebase |

## Gates por ticket

- **Concluído:** #771: revisão aprovada, CI verde na revisão sincronizada, merge confirmado,
  issue fechada e alterações presentes em origin/main.
- **Concluído:** #772: revisão aprovada, CI verde, merge e fechamento confirmados;
  alterações presentes em origin/main f6afc12.
- **Concluído:** #773: revisão aprovada, CI verde após rebase, merge e fechamento
  confirmados; alterações presentes em origin/main 5e2b528.
- **Concluído:** #774: continuidade verificada, revisão e CI aprovados; merge,
  fechamento e presença em origin/main 80dfe28 confirmados.
- **Concluído:** #788: revisão, CI e revalidação aprovados; merge, fechamento e
  presença em origin/main fe851b4 confirmados.
- **Concluído:** #789: revisões e CI aprovados; merge, fechamento e presença em
  origin/main 4086d78 confirmados.
- **Concluído:** #790: revisões e CI aprovados; merge, fechamento e presença em
  origin/main aa444f6 confirmados.
- **Concluído:** #791: revisões e CI aprovados após rebase; merge, fechamento e
  presença em origin/main a7bb1cc confirmados.
- **Concluído:** #792: revisões e CI aprovados; merge, fechamento e presença em
  origin/main 0d5585d confirmados.
- **Concluído:** #793: revisões e CI aprovados; merge, fechamento e
  presença em origin/main c320c6c confirmados.
- **Concluído:** #794: revisões e CI aprovados; merge, fechamento e
  presença em origin/main 13a37af confirmados.
- **Concluído:** #795: revisões, rebase e CI aprovados; merge, fechamento e
  presença em origin/main c8ba6cb confirmados.
- **Concluído:** #796: revisões, rebase e CI aprovados; merge, fechamento e
  presença em origin/main a9a6ad4 confirmados.
- **Auditoria final:** comparação completa e cobertura revisada em `final-audit.md`.
  A [PR #827](https://github.com/BetoFrega/macae-classificados/pull/827) registra
  o estado atual de CI e integração, sem copiar um estado transitório para este
  checklist. O fechamento de #797 e da spec #765 exige CI aprovado, merge e
  presença em origin/main; o tracker registra a comprovação final.
