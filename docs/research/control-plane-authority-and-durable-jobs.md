# Plano de controle de autoridade e jobs duráveis

Pesquisa para [“Pesquisar o plano de controle de autoridade e jobs duráveis”](https://github.com/BetoFrega/macae-classificados/issues/184).

## Resposta curta

Recomenda-se um **plano de controle separado, implementado sobre PostgreSQL dedicado**, com uma porta interna que não exponha SQL nem detalhes do provedor. Em produção, a primeira implementação pode usar uma instância Cloud SQL PostgreSQL de alta disponibilidade, distinta de qualquer PostgreSQL que participe como conector de dados. O App Hosting produz uma revisão Cloud Run, e Cloud Run tem integração oficialmente suportada com Cloud SQL PostgreSQL; portanto, essa opção é compatível com a hospedagem atual. ([Firebase App Hosting: processo de build](https://firebase.google.com/docs/app-hosting/build), [Cloud SQL: conectar a partir do Cloud Run](https://cloud.google.com/sql/docs/postgres/connect-run))

Esse banco é infraestrutura do **plano de controle**, não um conector migrável. Ele persiste somente autoridade, epochs/fencing tokens, leases, jobs/checkpoints, estado de manutenção e auditoria — nunca dados de anúncios, usuários ou arquivos. Assim, trocar Firestore por PostgreSQL, SQLite ou outro conector não move nem desativa o mecanismo que decide qual conector é autoritativo.

Cloud Tasks deve apenas **acordar** workers por HTTP autenticado; o PostgreSQL continua sendo a fonte de verdade dos jobs. Cloud Tasks entrega tarefas pelo menos uma vez e admite execuções duplicadas raras, logo handlers precisam ser idempotentes e não se pode tratar “uma task existente” como estado durável exclusivo do workflow. ([Cloud Tasks: visão geral](https://cloud.google.com/tasks/docs/dual-overview), [Cloud Tasks: HTTP targets e autenticação](https://cloud.google.com/tasks/docs/creating-http-target-tasks))

## Por que o estado não pode morar no processo

O App Hosting empacota a aplicação para Cloud Run, e cada implantação roda numa revisão Cloud Run. ([Firebase App Hosting: como funciona](https://firebase.google.com/docs/app-hosting/about-app-hosting), [Firebase App Hosting: frameworks e runtime](https://firebase.google.com/docs/app-hosting/frameworks-tooling)) Cloud Run usa instâncias stateless que escalam, pode atender várias requisições simultâneas por instância e grava num filesystem em memória que desaparece quando a instância para. ([Cloud Run: visão geral](https://cloud.google.com/run/docs/overview/what-is-cloud-run), [Cloud Run: contrato do container](https://cloud.google.com/run/docs/container-contract))

Consequentemente, memória, arquivo local, singleton Node.js e cron dentro do processo não podem ser a fonte de verdade para autoridade, lease ou progresso. Essa é uma conclusão arquitetural derivada das garantias do runtime acima.

## Separação proposta

### 1. Porta do plano de controle

Uma porta interna mínima deve oferecer operações atômicas orientadas ao problema, por exemplo:

- ler o snapshot atual de autoridade;
- iniciar uma migração somente se não houver outra ativa;
- adquirir/renovar/liberar lease comparando proprietário, expiração e fencing token;
- avançar checkpoint somente se job, fase, lease e token ainda coincidirem;
- solicitar cancelamento;
- entrar/sair do modo read-only com compare-and-set;
- confirmar cutover incrementando a epoch;
- anexar evento de auditoria.

Não deve existir uma API genérica de tabelas ou documentos. Essa porta permite trocar a hospedagem do plano de controle no futuro sem contaminar domínio, painel, CLI ou conectores com APIs do Cloud SQL.

### 2. Banco dedicado

O plano de controle deve ter instância, database, credenciais, migrations e ciclo de vida próprios. Compartilhar o mesmo cluster físico do conector PostgreSQL de aplicação reduziria custo, mas recriaria acoplamento operacional: aposentar, restaurar ou indisponibilizar esse conector poderia também apagar a decisão sobre autoridade. Portanto, a recomendação para produção é uma instância dedicada; em desenvolvimento e CI, outra implementação da mesma porta pode usar o SQLite isolado do teste.

Cloud SQL suporta conexão a partir do Cloud Run e recomenda pool por instância porque o número total de conexões cresce com o autoscaling. ([Cloud SQL: conectar a partir do Cloud Run](https://cloud.google.com/sql/docs/postgres/connect-run)) Para o plano de controle produtivo, a configuração regional de alta disponibilidade replica commits de forma síncrona entre zonas e faz failover automático quando a instância primária fica indisponível. ([Cloud SQL PostgreSQL: alta disponibilidade](https://cloud.google.com/sql/docs/postgres/high-availability)) Backups e point-in-time recovery também devem ser habilitados; a documentação oficial recomenda não apagar backups automatizados porque eles sustentam a recuperação pontual. ([Cloud SQL PostgreSQL: backups](https://cloud.google.com/sql/docs/postgres/backup-recovery/backups))

### 3. Tabelas lógicas mínimas

- `authority_state` — uma única linha: `authoritative_connector_id`, `authority_epoch`, `mode` (`normal`/`read_only`), `active_job_id`, `version`, timestamps.
- `migration_jobs` — intenção, origem, destino, estado/fase, pedido de cancelamento, erro resumível, criador e timestamps.
- `job_checkpoints` — cursor canônico por tipo de objeto/fase, contadores e último lote confirmado.
- `job_leases` — `job_id`, `owner_id`, `expires_at`, `fencing_token` monotônico.
- `audit_events` — eventos append-only com ator, ação, alvo, epoch, job, resultado, justificativa, correlação e payload redigido.
- `outbox` — notificações ainda não publicadas ao mecanismo de wake-up.

O desenho exato é decisão de implementação, mas autoridade, início do job e primeiro evento de auditoria devem ser gravados numa mesma transação; o mesmo vale para cada mudança de fase, checkpoint e evento correspondente. PostgreSQL oferece locks de linha (`SELECT ... FOR UPDATE`) para serializar alterações concorrentes e `SKIP LOCKED` para workers escolherem trabalho sem esperar por linhas já reclamadas. ([PostgreSQL: explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), [PostgreSQL: SELECT locking clause](https://www.postgresql.org/docs/current/sql-select.html))

## Leases e fencing

Um lease sozinho não impede um worker pausado de acordar depois de expirar e continuar escrevendo. Por isso, cada aquisição válida deve obter um `fencing_token` monotônico; toda mutação subsequente apresenta esse token e falha se ele não for o token corrente.

Regras recomendadas:

1. A aquisição ocorre em transação, bloqueando a linha do job e incrementando o token.
2. Renovação e checkpoint usam compare-and-set de `job_id + owner_id + fencing_token`.
3. Expiração usa tempo calculado pelo banco, não relógio do processo.
4. O worker trabalha em lotes pequenos e revalida lease e cancelamento entre lotes.
5. Toda operação é idempotente porque retry e execução duplicada são esperados quando Cloud Tasks dispara o worker. ([Cloud Tasks: entrega pelo menos uma vez](https://cloud.google.com/tasks/docs/dual-overview))

O fencing precisa alcançar também os **conectores de dados**. O plano de controle guarda a verdade global, mas cada conector mantém somente um pequeno guard local com a maior `authority_epoch` aceita. Uma escrita de domínio atualiza o registro e valida o guard na mesma transação nativa do conector. Esse guard não decide autoridade e não cria dependência circular; apenas rejeita uma instância antiga que tente escrever depois do cutover.

No cutover, durante o período read-only já acordado, o coordenador deve: concluir/verificar o delta; elevar o guard do conector antigo para rejeitar a epoch anterior; preparar o guard do destino; e então confirmar a nova autoridade/epoch no plano de controle. Se uma etapa falhar antes da confirmação, a origem permanece autoritativa e o modo normal pode ser restaurado. Depois da confirmação, voltar é uma nova migração. Essa sequência é uma recomendação derivada da impossibilidade de fazer uma transação ACID única entre bancos heterogêneos.

## Jobs duráveis, retomada e cancelamento

Cloud Tasks pode invocar um endpoint HTTP usando token OIDC e permite configurar retries, mas um handler HTTP tem timeout máximo de 30 minutos. ([Cloud Tasks: HTTP targets](https://cloud.google.com/tasks/docs/creating-http-target-tasks)) Portanto, uma migração não deve ser uma requisição longa:

1. A action administrativa cria o job e o outbox em transação e retorna o `job_id`.
2. Um dispatcher publica uma Cloud Task autenticada; publicação duplicada é inofensiva.
3. O handler adquire o lease e processa apenas um lote com orçamento curto.
4. Dados do lote são escritos idempotentemente no destino.
5. O checkpoint só avança depois da confirmação do lote; então o handler agenda o próximo wake-up e termina.
6. Se processo, task ou instância morrer, outro worker adquire um novo token após expiração e continua do último checkpoint confirmado.

O cancelamento é um estado durável (`cancel_requested_at`), não um sinal enviado a uma instância específica. O endpoint de cancelamento também retira imediatamente o sistema de read-only quando o cutover ainda não foi confirmado. O worker interrompe no próximo limite de lote e não inicia novas operações externas; uma operação já enviada ao banco pode terminar, por isso “imediato” significa latência máxima limitada pelo tamanho/timeout do lote. Cópias parciais ficam inertes no destino e serão reconciliadas numa tentativa futura.

## Autoridade em múltiplas instâncias

Cada instância deve obter um snapshot `{connectorId, epoch, mode, version}` do plano de controle. Cache pode reduzir leituras, mas não pode autorizar escrita indefinidamente. Para escrita:

- a instância apresenta a epoch ao conector;
- o guard transacional do conector rejeita epoch antiga;
- em indisponibilidade do plano de controle, novas escritas falham de forma fechada após um TTL curto; leituras podem continuar do último conector conhecido se a política de produto aceitar dados potencialmente defasados;
- readiness protegido deve indicar que o plano de controle está alcançável, a epoch observada e se a instância está apta a escrever.

Esse desenho aceita autoscaling e concorrência do Cloud Run sem eleger uma instância “líder” em memória. Cloud Run pode executar múltiplas requisições concorrentes em uma instância e criar múltiplas instâncias conforme carga, o que exige coordenação externa. ([Cloud Run: contrato do container](https://cloud.google.com/run/docs/container-contract))

## Auditoria

`audit_events` deve ser append-only para a role de runtime: conceder `SELECT`/`INSERT`, revogar `UPDATE`/`DELETE`/`TRUNCATE`, e reservar ownership/migrations para uma role separada. PostgreSQL distingue esses privilégios, embora o owner sempre possa voltar a concedê-los; portanto, “append-only” protege contra o caminho normal da aplicação, não contra comprometimento do owner. ([PostgreSQL: privilégios](https://www.postgresql.org/docs/current/ddl-priv.html), [PostgreSQL: REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html))

Para evidência mais forte, recomenda-se também encadear cada evento ao hash do anterior e exportar periodicamente para retenção externa imutável. O hash evidencia alteração, mas não a impede; a exportação é necessária se o requisito futuro incluir resistência a comprometimento administrativo completo. Logs da aplicação não substituem a tabela transacional, porque podem ser emitidos sem que a mudança de estado seja confirmada ou podem faltar após falha do processo.

## Alternativas consideradas

| Opção | Avaliação |
| --- | --- |
| Estado no conector autoritativo | Rejeitada: a decisão que troca/desativa um conector não pode depender exclusivamente dele; também complica recuperação quando ele está indisponível. |
| Firestore/Realtime Database como plano de controle | Tecnicamente compatível, mas mantém a dependência Firebase que a iniciativa quer reduzir e faz o controle depender de um dos fornecedores que motivou a mudança. |
| Arquivo local/SQLite na instância App Hosting | Rejeitada em produção: filesystem Cloud Run é em memória, não persiste e não é compartilhado entre instâncias. ([Cloud Run: contrato do container](https://cloud.google.com/run/docs/container-contract)) |
| Cloud Tasks como banco de jobs | Rejeitada: entrega pelo menos uma vez, duplicatas são possíveis e tasks concluídas são removidas; serve como transporte/wake-up, não como registro canônico do workflow. ([Cloud Tasks: visão geral](https://cloud.google.com/tasks/docs/dual-overview)) |
| Serviço de workflow adicional | Viável, mas adiciona produto, operação e modelo mental antes de haver necessidade demonstrada. O motor requerido cabe em transações PostgreSQL, batches idempotentes, leases e Cloud Tasks. Reavaliar apenas se surgirem workflows com timers/eventos/compensações que excedam esse modelo. |
| PostgreSQL dedicado para controle | Recomendado: tecnologia portável entre provedores, transações e locks adequados, conexão Cloud Run oficialmente suportada e independência do ciclo de vida dos conectores migráveis. ([Cloud SQL: conectar a partir do Cloud Run](https://cloud.google.com/sql/docs/postgres/connect-run), [PostgreSQL: explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)) |

## Requisitos que devem virar especificação

1. O plano de controle tem implantação, credenciais, backups e migrations independentes dos conectores.
2. Nenhum dado de domínio reside nele.
3. Exatamente um job que altera autoridade pode estar ativo.
4. Authority epoch e fencing token são monotônicos e nunca reutilizados.
5. Todo conector implementa guard transacional contra epochs antigas.
6. Workers são idempotentes, processam batches limitados e retomam do último checkpoint confirmado.
7. Cancelamento é durável e observável; antes do commit de cutover restaura modo normal na origem.
8. Cloud Tasks é wake-up autenticado, nunca fonte de verdade.
9. Auditoria acompanha a mesma transação das mudanças do plano de controle e a role da aplicação não pode alterá-la/apagá-la.
10. Falha do plano de controle bloqueia novas escritas após TTL; a política de leitura degradada deve ser explícita.
11. Readiness/diagnóstico expõe conectividade, epoch e aptidão de escrita sem revelar segredos.
12. Testes de concorrência cobrem lease expirado, worker antigo, tasks duplicadas, crash antes/depois do checkpoint, cancelamento em cada fase e duas instâncias tentando cutover.

## Riscos e decisões ainda necessárias

- Definir o TTL de cache/lease e o tamanho máximo de batch com medições; valores fixos agora seriam arbitrários.
- Decidir se leitura degradada é permitida quando o plano de controle fica indisponível.
- Estimar custo de uma instância Cloud SQL dedicada e escolher tier/HA por ambiente.
- Especificar como cada conector implementa atomicamente seu guard de epoch com a mutação de domínio.
- Definir retenção, redação e exportação externa da auditoria conforme os requisitos regulatórios reais.
