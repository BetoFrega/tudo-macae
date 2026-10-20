# Auditoria final da limpeza Playwright

Na revisão limpa `12ac9d14617aa262a0c7e62705c37c7b182af410`, em
2026-09-07, os **108 casos completos passaram em 315,092 s**, com um worker,
zero retries, skips ou flakes. Os 75 unitários e 71 testes de integração afetados
também passaram. Dados, comandos, arquivos selecionados e fases estão em
[final-measurement.json](final-measurement.json).

## Comparação

| Execução | Casos Playwright | Tempo completo |
| --- | ---: | ---: |
| Baseline histórico `8e25b954` | 121 | 366,214 s |
| Aplicação e dois harnesses separados, `a9920b01` | 117 | 380,775 s |
| Infraestrutura compartilhada, `1398478e` | 117 | 347,731 s |
| Infraestrutura compartilhada e nove consolidações, `12ac9d14` | 108 | 315,092 s |

Entre as três últimas revisões, o código da aplicação é o mesmo. A eliminação
da segunda inicialização/build economizou 33,045 s na amostra; as nove
consolidações seguintes economizaram outros 32,639 s. A diferença observada
foi de **65,683 s** contra as coleções separadas, e **51,122 s** contra o baseline
histórico. A comparação histórica também inclui mudanças concorrentes da
aplicação; não atribuir toda a diferença exclusivamente à limpeza.

O comando `npm run test:e2e:full` executa a aplicação e ambas as coleções do
harness uma vez, sob uma única infraestrutura. Os comandos focais, a coleção de
staging, o projeto de snapshots da aplicação e a origem sintética do harness
permanecem disponíveis. Nenhum caso depende do estado deixado por outro.

Na execução final, a soma dos tempos atribuídos aos casos foi 258,910 s para a
aplicação, 7,326 s para o harness dependente dela e 16,252 s para o harness
sintético. Houve 27,878 s antes do primeiro caso e 0,602 s depois do último.
O intervalo dos testes inclui trocas de worker/projeto; cada duração inclui a
preparação e limpeza atribuídas pelo runner. Build, fixtures e corpo não têm
timers independentes nesta medição.

Os tiers inferiores afetados, com um ciclo de emuladores, custaram **46,740 s**;
o custo atual agregado medido foi **361,832 s**. Não existe uma amostra histórica
ordinária equivalente, portanto não foi calculada uma diferença agregada entre
todas as camadas. Os 146 testes inferiores incluem cobertura preexistente, não
146 testes acrescentados pela migração. Os comandos por tier e seus custos
estão no JSON; o wrapper externo apenas registrou tempo e resultado.

São amostras únicas, com caches aquecidos e infraestrutura inicialmente parada
no mesmo worktree e máquina. A variância não foi estimada. Uma tentativa que
falhou por `listen EPERM` antes dos testes foi descartada; os candidatos anteriores
à verificação de email também não substituem a medição final.

## Cobertura reconciliada

O [inventário canônico](inventory.json) preserva os 121 IDs e as 645 expressões
históricas: **622 verificações permanecem ou foram consolidadas em E2E e 23
migraram de camada**. Texto literal de Captura também tem cobertura jsdom,
sem perder sua passagem pelo formulário e detalhe. Os 56 checks compartilhados
permanecem localizados nos helpers; suas esperas de conclusão não foram removidas
isoladamente.

Cada migração aponta ao teste real, interface, execução anterior à retirada e
evidência do lote. A auditoria conferiu as expressões no cenário receptor,
precondições, loops e percursos, incluindo guard de mídia antes do reload,
usuários sem nova precondição de email verificado e redirect de matéria após
hidratação. A alias `detail` em PW099-A01 aponta ao mesmo `captureDetail` e tem
expressão atual registrada separadamente da histórica.

Foram eliminados **16 casos históricos independentes**. A mudança concorrente
`c769f71e` acrescentou dois casos de verificação de email e um de limpeza do
harness: 121 − 16 + 3 = 108, sendo 92 da aplicação e 16 do harness. As mudanças concorrentes `13de607b` e `c769f71e` acrescentaram 32
sítios de asserção, incluindo alterações em jornadas existentes,
estão separados em [main-additions.json](main-additions.json); não são remoções
nem economia desta limpeza.

As nove consolidações finais estão em
[journey-setup-consolidation.json](journey-setup-consolidation.json):

- PW003 → PW004: página administrativa de anúncios;
- PW017 → PW018: página administrativa de usuários;
- PW020 → PW019: metadados e anunciante no mesmo detalhe;
- PW034 → PW035: lista de anúncios nas sessões do proprietário e de outro usuário;
- PW009 → PW058 e PW010 → PW001: mídia nas matrizes de papel/rota;
- PW073 → PW071: apresentação de retenção e período na atividade editorial;
- PW085 → PW083: home, matéria, retorno e convite a publicar;
- PW090 → PW089: índice, matéria e redirect de slug.

Os 117 casos anteriores passaram antes dessas consolidações, os 22 casos focais
receptores passaram depois, e a coleção final completa passou na revisão limpa.
As revisões independentes de Standards e Spec não encontraram perdas no diff.

## Custos e oportunidades remanescentes

A espera de expiração de PW008 continua porque alterar o relógio do navegador
não controla a expiração no servidor construído; o impedimento e a prova
inferior determinística estão em [mcp-control-expiry.json](mcp-control-expiry.json).
As 41 chamadas de rate limit continuam provando a configuração efetiva do
endpoint; sua concorrência foi transferida ao contrato de integração.

Uploads e imagens servidas, revisão em duas páginas, custom claims chegando à
sessão, mutações refletidas em cache e paginação real permanecem na aplicação.
PW026 começa sem o perfil preenchido que PW022 já recebe; PW088 acrescenta
mídia à publicação; PW113 precisa ultrapassar a primeira página de Pautas.
Essas precondições não foram apagadas para reduzir contagens.

Há novas oportunidades de consolidar outras rotas por papel e redistribuir
variantes de apresentação/validação em jornadas mantidas, como PW012, PW025,
PW043 e PW086. Elas permanecem cobertas em E2E; esta auditoria não demonstra
que a suíte atingiu seu custo mínimo nem inventa impedimentos arquiteturais
para esse trabalho futuro. As garantias concretas dos casos mantidos substituem
as justificativas genéricas do inventário.

## Reprodução e entrega

Use a operação de emuladores e o comando completo descritos em
[Test Harness Operation](../../agents/test-harness-operation.md), com as versões,
condições e seleções registradas no JSON. Para conferir a mudança da coleção:

```bash
npm run test:unit -- bin/playwrightCollections.test.ts
npm run test:e2e:full -- --list
npm run test:e2e:full
```

O build de produção é executado pelo próprio stack E2E. Staging-control não foi
alterado; seu produtor continua incluído no contrato real de coleta. Lint,
`check:harness`, revisão final, CI e merge seguem o
[checklist de entrega](delivery.md); passar a medição não encerra esses gates.
