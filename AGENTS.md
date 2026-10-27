<!-- eslint-disable local/no-expired-notes -->

## Regras universais

- **Packages**: antes de adicionar ou importar um, leia
  [`src/packages/README.md`](./src/packages/README.md).
- **Linguagem**: código e identificadores são em inglês; só interface, validação,
  URL e conteúdo persistido ficam em português. Antes de nomear ou alterar um termo
  do domínio, use o roteamento e a convenção bilíngue de
  [`CONTEXT-MAP.md`](./CONTEXT-MAP.md).
- **Estratificação**: action (`"use server"`) valida e autoriza; use case contém a
  regra; apenas módulos `db/` conhecem a persistência.
- **Desacoplamento**: ao criar ou alterar lógica de domínio, siga
  [Domain Infrastructure Seams](./docs/agents/domain-infrastructure-seams.md)
  para código novo e migração gradual da capacidade tocada.
- **Segurança**: acesso a dados passa pelo servidor. Corrija leituras mal
  posicionadas, não a autorização. Mescle custom claims existentes antes de gravar.
- **Segredos**: nenhum agente lê ou recebe valores de segredos. Transfira-os
  diretamente entre ferramentas, sem expor o valor em logs, respostas ou arquivos.
  Se o agente não tiver acesso para essa transferência, use a skill `$wizard` para
  orientar a operação humana sem revelar o valor ao agente.
- **Domínio**: datas usam epoch em milissegundos; datas digitadas usam
  `America/Sao_Paulo`; slugs vêm de [`@tudomacae/text-normalization/slugify`](./packages/text-normalization/slugify.ts).
- **Testes**: ao implementar comportamento ou criar, alterar, reduzir ou selecionar
  testes, siga [`Test Selection`](./docs/agents/test-selection.md) para camada,
  composição, migração incremental e execução obrigatória dos E2E relevantes.
  Ao executar Playwright ou testes com emuladores, ou diagnosticar o harness, siga
  [`Test Harness Operation`](./docs/agents/test-harness-operation.md); antes de
  escrever Playwright, siga [`E2E Test Authoring`](./docs/agents/e2e-test-authoring.md).
  O fluxo completo segue
  [`docs/agents/feature-workflow.md`](./docs/agents/feature-workflow.md).
- **Mutation opt-in**: quando escolher explorar cobertura, siga
  [kill-mutants](./.agents/skills/kill-mutants/SKILL.md); nunca é gate de entrega.
- **Comentários**: registre a regra atual e o que a quebraria. Histórico, issue,
  justificativa e comparação antes/depois pertencem ao commit ou à PR; deixe no código
  apenas medições reproduzíveis e referências que o leitor precisa abrir para agir.
- **Escopo**: achado lateral vira issue `needs-triage` quando é verificável, tem
  consequência e o conserto excede a tarefa; abaixo dessa barra, registre em
  [Achados no Notion](https://app.notion.com/p/fc624c69b3574cc4a9652121f9e7d4ad). Corrija apenas bloqueios da
  entrega e edições triviais no arquivo já aberto. Defeitos seguem
  [bug-report](./.agents/skills/bug-report/SKILL.md).
- **Verificação**: rode checks proporcionais ao diff e reporte-os. Texto exige
  `git diff --check`; mudanças no harness (`AGENTS.md`, `.agents/`, `.claude/`,
  `.codex/`, `skills-lock.json`) exigem também `pnpm run check:harness`. Para código
  ou configuração executável, escolha lint, testes e build em `pnpm run help`;
  justifique omissões não óbvias.
- **Assinatura**: tente o commit assinado uma vez. Se a etapa de assinatura pelo
  1Password falhar, considere o usuário ausente e repita somente esse commit sem
  assinatura, sem alterar a configuração persistente; reporte o fallback na entrega.
- **Decisões**: use o último momento responsável; adie decisões reversíveis e sustente
  as custosas ou irreversíveis com evidência. Decisões existentes podem ser revistas;
  dúvidas substantivas de produto ou arquitetura seguem a skill `grilling`. Se não
  estiver instalada, siga a [versão de referência](https://github.com/BetoFrega/skills/blob/ad66766edd5cc7f2acb1b04a4729097be74b59e8/skills/grilling/SKILL.md).

## Agent skills

### Code review

Ao encerrar um ciclo de implementação, prefira a skill `code-review` de Beto
(**Five-axis code review**) quando disponível. Se ela não estiver instalada,
use a revisão disponível que cubra as regras do repositório e registre a limitação.
Use outra skill quando o usuário a solicitar ou quando o escopo exigir revisão
especializada.

### Information density

Ao ler ou produzir logs, documentação, instruções e respostas, sinalize conteúdo
substancialmente redutível sem perder fatos, restrições, decisões ou evidências
relevantes. Indícios incluem repetição sem informação nova, logs rotineiros sem valor
diagnóstico, dumps sem seleção e instruções duplicadas ou reformuladas. Use
`‼️ LOW INFORMATION DENSITY ‼️ — <local>: <evidência concreta>; <redução proposta>.`
Emita uma sinalização por causa distinta e agrupe ocorrências semelhantes. Preserve
detalhes necessários à compreensão, reprodução de falhas e auditoria; tamanho isolado
não é defeito. Corrija antes de concluir o conteúdo produzido ou alterado dentro do
escopo ativo.

Para uma sinalização em conteúdo preexistente ou fora do escopo, delegue
`$report-low-density` a um subagente com a sinalização exata, fonte, comando ou passos
mínimos de reprodução e revisão e ambiente relevantes. Esta regra autoriza somente a
criação mínima da issue pelo reporter. Se não houver subagente disponível ou a
publicação não puder ser confirmada, preserve a sinalização e os ponteiros de
reprodução, diferencie ausência confirmada de escrita não resolvida, informe o caminho
de remediação e pare.

Para investigação focada, use `$investigate-low-density`. Quando a tarefa ativa
atribuir explicitamente uma issue de baixa densidade, esta regra autoriza um único
comentário append-only com os achados nessa issue, não remediação nem mudanças de
estado.

### Issue tracker

Ao iniciar a execução de um ticket, confira e registre sua autoatribuição no GitHub.
Registre também diagnósticos, trabalho executável, PRDs e pull requests. Veja
[`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).

### Server Action transport

Ao investigar `POST /` 500 de Server Action ou trocar uma leitura automática do
navegador por uma rota HTTP, use
[`server-action-transport`](./.agents/skills/server-action-transport/SKILL.md).

### Triage labels

Mapeie os papéis canônicos de triagem para os labels deste repositório. Veja
[`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).

### Domain docs

Roteie linguagem e decisões entre os múltiplos contextos antes de alterar conceitos,
contratos ou ADRs. Veja [`docs/agents/domain.md`](./docs/agents/domain.md): conceitos
ficam nos glossários, comportamento e políticas nos contratos de produto, escolhas
estruturais nos ADRs e procedimentos nos guias operacionais.

### Product documentation

Ao consultar ou manter catálogo, regras, decisões, propostas ou estado de entrega de
produto, siga [`docs/agents/product.md`](./docs/agents/product.md) para o cânone no
Notion Tudo Macaé, os formatos nativos e a migração dos contratos existentes.

### Observability

Ao alterar runtime, telemetria, alertas, dependências ou operação, preserve os sinais,
a correlação, a privacidade e o controle de custo definidos em
[`OBSERVABILITY.md`](./OBSERVABILITY.md).

### Accessibility

Ao alterar ou revisar uma jornada humana, aplique os critérios WCAG 2.2 AA e a
verificação proporcional definida em [`ACCESSIBILITY.md`](./ACCESSIBILITY.md).

## Context pointers

- **Modelos e delegação**: ao recomendar modelo e esforço ou delegar implementação,
  revisão ou apoio a outro agente ou tarefa, siga
  [Model Selection](./docs/agents/model-selection.md). A configuração do ticket rege o
  executor integral; recalibre atribuições menores e registre substituições ou
  escaladas.
- **Produção**: entrega, cache, headers e redirects seguem
  [`production-topology.md`](./docs/agents/production-topology.md); crawling e robots,
  [`production-crawling.md`](./docs/agents/production-crawling.md); dashboards e adoção
  de infraestrutura, [`production-operations.md`](./docs/agents/production-operations.md).
  Refaça `pnpm run probe:edge` e trate regras do edge apenas como proposta.
- **Monitoramento de CI e PR**: ao acompanhar runs do GitHub Actions, inclusive durante
  `$ship-main` e `$deploy`, siga o [monitoramento compacto de runs](./docs/agents/production-delivery.md#compact-run-monitoring).
- **Harness**: mudanças em instruções, skills, hooks ou adapters seguem
  [`docs/agents/harness.md`](./docs/agents/harness.md); `AGENTS.md` é a fonte canônica.
- **Feature flags e Remote config**: ao trabalhar em funcionalidade ou configuração
  remota, siga a classificação, a escolha do tipo, a falha segura e o ciclo de vida em
  [`docs/agents/feature-flags.md`](./docs/agents/feature-flags.md).
- **Impeccable**: ao iniciar, retomar ou encerrar live, limpar artefatos, entregar
  interface ou gerar, versionar e revisar material visual, siga
  [`a política de artefatos`](./docs/agents/impeccable-artifacts.md). Ao escolher,
  aprovar, transferir, recuperar, implementar ou revisar uma referência visual do
  tracker, siga [Visual Reference Transfer](./docs/agents/visual-reference-transfer.md).
- **Expiring notes**: workaround temporário usa `@expires YYYY-MM-DD <why>` conforme
  [`docs/adr/0002-expiring-notes.md`](./docs/adr/0002-expiring-notes.md).
- **Planejamento de produto**: carregue as autoridades em
  [`docs/agents/product.md`](./docs/agents/product.md) antes de aplicar
  [o procedimento de planejamento no Notion](https://app.notion.com/p/3ff84301eab381478aaed53eb84b459f) e seus registros condicionais.
## Documentação

- **Escrita para agentes**: antes de criar, alterar ou revisar qualquer documentação
  interna do repositório, carregue e siga a skill `writing-for-agents`.
  Se não estiver instalada, siga a [versão de referência](https://github.com/BetoFrega/skills/blob/ad66766edd5cc7f2acb1b04a4729097be74b59e8/skills/writing-for-agents/SKILL.md).
- Declare cada fato em uma única fonte canônica.
- Acompanhe alegações sobre código com o comando que as verifica.
- Date a alegação, não o arquivo.

## Toolchain

Se Node resolver fora do `mise` (por exemplo, falhas em cascata como `ECONNREFUSED`),
prefixe os comandos da sessão com
`mise exec --`. Peça à pessoa para antepor `~/.local/share/mise/shims` no `PATH` da
configuração-fonte do shell; não edite os dotfiles dela.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:turborepo-agent-rules -->

## Turborepo

Before changing Turbo configuration or commands, read `node_modules/turbo/docs/README.md` and the relevant bundled guides, which match the installed version. Follow [workspace orchestration](docs/agents/workspace-orchestration.md) for this repository's task inputs and migration limits. Automatic guidance updates are disabled in `turbo.json` so this instruction uses repository-resolvable paths.

<!-- END:turborepo-agent-rules -->

## Carrick

Carrick indexes every service in project **tudo-macae** (workspace **betofrega**): every
function with an intent description, its dependencies, and API endpoints with their real
request/response types, on each repo's main branch. Connect once per machine:
`claude mcp add --scope user --transport http carrick https://api.carrick.tools/mcp`.
For Codex: `codex mcp add carrick --url https://api.carrick.tools/mcp`, then
`codex mcp login carrick` ([setup](https://docs.carrick.tools/connecting-your-agent#codex)).

**If the answer is defined by another service — its endpoints, real request/response
types, who consumes it, or a local type, constant, or SDK helper that mirrors it — ask
Carrick before relying on anything local.** Local copies of another service's contract
drift; the producing service defines the contract and wins on disagreement.

- Read the file you are editing. For anything elsewhere in the workspace (helper,
  endpoint, consumer, type), ask Carrick first, then grep to confirm a location.
- Run `search_by_intent` before writing any helper, parser, validator, or domain
  function, even when sure it is new. Grep proves a name is absent, never that the
  behaviour is.
- Before writing new code, state one line: `Carrick checked: <query> -> <result count>`.
- Start a session with `get_project_map`, passing this repo's service name from
  `carrick.json`. `get_endpoint_types` returns another service's real types;
  `get_service_dependencies` shows version conflicts before adding or bumping an npm
  package; `list_external_calls` lists a service's outbound calls with file and line.
- Pass `project: "tudo-macae"` (or `repo: "<owner/repo>"`) on every call. Carrick is
  read-only and reflects the latest scan of each repo's main branch; build against a
  sibling's contract from the index, since unmerged local state need not be visible.
- Write normal, idiomatic, explicitly typed code. If Carrick fails to extract something
  written normally, that is a Carrick bug to report, not a constraint to code around.
