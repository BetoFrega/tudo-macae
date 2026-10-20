# Stack dos adapters SQLite e PostgreSQL

Pesquisa para [“Pesquisar a stack dos adapters SQLite e PostgreSQL”](https://github.com/BetoFrega/macae-classificados/issues/185), realizada em 19 de julho de 2026. Este documento escolhe ferramentas de infraestrutura; ele não define as portas orientadas ao domínio nem transforma SQL/ORM na interface da aplicação.

## Recomendação

Adotar:

- **Drizzle ORM + Drizzle Kit**, com versões estáveis fixadas no lockfile;
- **`better-sqlite3`** para o adapter SQLite, restrito a desenvolvimento e CI;
- **`pg` (`node-postgres`)** para o adapter PostgreSQL;
- **PostgreSQL padrão acessível por TLS** como requisito do adapter, sem incorporar APIs de um provedor ao contrato;
- **Cloud SQL for PostgreSQL como primeira implantação candidata no App Hosting**, usando `@google-cloud/cloud-sql-connector` quando IAM/autenticação gerenciada forem desejados, mas somente após um pequeno teste de conectividade no backend real.

Essa combinação mantém o runtime da aplicação em TypeScript, oferece drivers oficiais do Drizzle para `better-sqlite3` e `node-postgres`, e produz migrações SQL versionadas e inspecionáveis. O Drizzle documenta suporte nativo aos dois drivers e o Drizzle Kit registra migrações aplicadas numa tabela própria ([SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite), [PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [migrações](https://orm.drizzle.team/docs/migrations), [`migrate`](https://orm.drizzle.team/docs/drizzle-kit-migrate)).

Não compartilhar uma única definição física de schema entre os dialetos. Manter:

```text
infra/persistence/sqlite/schema.ts
infra/persistence/sqlite/migrations/
infra/persistence/postgres/schema.ts
infra/persistence/postgres/migrations/
```

As duas representações implementam o mesmo modelo lógico e são verificadas pela suíte de contrato dos connectors. Essa duplicação pequena é intencional: tipos, DDL e recursos de SQLite e PostgreSQL diferem, e até o Prisma declara que arquivos de migração são específicos do provider e não podem ser reutilizados entre SQLite e PostgreSQL ([limitação oficial](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues)). Tentar esconder isso numa camada SQL “universal” criaria o tipo de acoplamento que as portas de domínio devem evitar.

## Comparação das opções realistas

| Opção | Pontos fortes | Custos/riscos neste projeto | Decisão |
| --- | --- | --- | --- |
| Drizzle + drivers nativos | API TypeScript pequena; suporta `better-sqlite3` e `pg`; schemas explícitos; gera SQL que pode ser revisado e executado programaticamente | Schemas e históricos separados por dialeto; o painel ainda precisa orquestrar estado, locks, relatório e retomada | **Escolher** |
| Kysely + `better-sqlite3`/`pg` | Query builder fino; dialetos oficiais; migrações `up/down` explícitas ([documentação](https://www.kysely.dev/)) | Exige escrever e manter mais DDL/tipagem à mão; não traz vantagem suficiente para o tamanho atual | Alternativa válida se o spike do Drizzle falhar |
| Prisma | Bom modelo declarativo, cliente gerado e migrações SQL editáveis ([Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)) | Um datasource por schema e migrações específicas por provider; múltiplos bancos pedem clients/configurações separados ([referência](https://www.prisma.io/docs/orm/reference/prisma-schema-reference), [guia de múltiplos bancos](https://www.prisma.io/docs/guides/database/multiple-databases)); mais geração e convenções do que o necessário | Não escolher agora |
| SQL direto nos drivers | Dependências mínimas e controle total | Tipagem, composição de queries e gestão de schema viram infraestrutura própria | Não escolher |

O ORM é detalhe interno de cada adapter. As features e os casos de uso não devem importar Drizzle, `pg`, `better-sqlite3` nem tipos de coluna.

## SQLite local e no CI

`better-sqlite3` é a escolha conservadora. Ele oferece transações completas, API síncrona, binários pré-compilados para versões LTS suportadas do Node e recomenda WAL para desempenho ([README oficial](https://github.com/WiseLibs/better-sqlite3)). A API síncrona é aceitável aqui porque cada banco pertence a um worker de teste ou a uma única instância local; SQLite não será usado em staging ou produção.

`node:sqlite` eliminaria a dependência nativa externa e o Drizzle já oferece driver para ele. Porém, no Node 24.18 a API ainda aparece como **release candidate**, embora esteja disponível desde Node 22.5 ([documentação do Node 24](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)). Portanto, não é a base recomendada agora. Reavaliá-lo quando estiver estável e quando o projeto tiver uma versão Node explicitamente fixada.

Configuração mínima do adapter SQLite:

- arquivo temporário exclusivo por processo/worker, não `:memory:`, para exercitar abertura, fechamento e reinício reais;
- `PRAGMA foreign_keys = ON`, pois o default pode variar conforme a compilação do SQLite;
- `PRAGMA journal_mode = WAL` e um `busy_timeout` explícito para desenvolvimento local; SQLite documenta os modos de journal e o controle de foreign keys em sua [referência de pragmas](https://www.sqlite.org/pragma.html);
- aplicar as migrações SQLite ao criar o arquivo;
- fechar a conexão e descartar o diretório temporário ao final;
- nunca montar o arquivo SQLite no App Hosting nem permitir esse adapter fora de `development`/`test`.

Para Vitest e Playwright, o nome do arquivo deve derivar de `runId + workerId`. Isso evita locks e limpeza global entre workers. Um arquivo-base já migrado pode ser copiado para cada worker se a medição mostrar que aplicar migrações virou gargalo; não antecipar essa otimização.

## PostgreSQL produtivo

Usar `pg.Pool` único por processo do servidor e passá-lo ao Drizzle. O `node-postgres` recomenda pools reutilizáveis e alerta que criar pools sem limite derrota o próprio pooling ([pooling](https://node-postgres.com/features/pooling)). O Cloud SQL limita cada instância Cloud Run a 100 conexões e recomenda limitar o pool por instância ([Cloud Run + Cloud SQL](https://cloud.google.com/sql/docs/postgres/connect-run)); portanto:

- começar com `max` pequeno e explícito (por exemplo, 5), não derivado da concorrência HTTP;
- definir timeouts de conexão, aquisição e queries;
- manter `maxInstances × pool.max` abaixo do orçamento do banco;
- instrumentar espera, uso e erros do pool antes de ajustar;
- fechar o pool no encerramento gracioso do processo.

O número exato é configuração operacional, não parte do connector. A recomendação de `5` é ponto inicial a validar por carga, não constante arquitetural.

### App Hosting e escolha do provedor

O App Hosting constrói um container e o executa em Cloud Run, suporta secrets em runtime e expõe `maxInstances`, concorrência e VPC em `apphosting.yaml` ([processo de build](https://firebase.google.com/docs/app-hosting/build), [configuração](https://firebase.google.com/docs/app-hosting/configure)). Isso é compatível com `pg` e com qualquer PostgreSQL padrão alcançável por TCP/TLS.

Para Cloud SQL, o Node.js Connector fornece criptografia e autorização IAM, mas não cria por si só um caminho de rede ([documentação do connector](https://cloud.google.com/sql/docs/postgres/connect-connectors)). O App Hosting hoje permite configurar Direct VPC Egress ou Serverless VPC Access em `apphosting.yaml`, e seu runtime usa a conta `firebase-app-hosting-compute@PROJECT_ID.iam.gserviceaccount.com` ([VPC do App Hosting](https://firebase.google.com/docs/app-hosting/configure#configure_vpc_access), [contas de serviço Firebase](https://firebase.google.com/support/guides/service-accounts)). Logo, Cloud SQL é viável em princípio, mas a decisão final precisa de um spike que prove:

1. conexão do backend de staging com o SHA esperado;
2. IAM mínimo da conta de runtime;
3. IP público + connector ou VPC privado, conforme a postura de segurança escolhida;
4. build do Next.js com os módulos server-only;
5. comportamento do pool sob escala para zero e múltiplas instâncias.

O contrato PostgreSQL deve aceitar duas fábricas de conexão sem mudar o adapter: uma baseada em `DATABASE_URL` TLS (portável entre provedores) e outra que fornece opções de socket via Cloud SQL Connector. Credenciais ficam em secrets do App Hosting e somente com disponibilidade `RUNTIME`; a documentação confirma que secrets são resolvidos durante rollout e podem ser limitados por ambiente ([configuração de secrets](https://firebase.google.com/docs/app-hosting/configure#store_and_access_secret_parameters)).

Não escolher Firebase Data Connect/SQL Connect: embora ele provisione Cloud SQL PostgreSQL, sua proposta central é schema/queries e SDKs gerados do Firebase ([quickstart](https://firebase.google.com/docs/sql-connect/quickstart)), recriando uma dependência de produto que esta iniciativa quer reduzir. O banco pode ser Cloud SQL; o acesso deve continuar sendo PostgreSQL padrão.

## Schema e migrações

Usar abordagem **code-first com SQL versionado**, uma linha de histórico por dialeto. `drizzle-kit generate` gera SQL a partir do schema TypeScript e `migrate` compara esse histórico com a tabela de migrações aplicada ([fluxo oficial](https://orm.drizzle.team/docs/migrations)). Regras:

- gerar durante desenvolvimento e revisar/editar o SQL no pull request;
- proibir `drizzle-kit push` em ambientes persistentes;
- representar cada evolução como `expandir → backfill → trocar leitores/escritores → contrair`;
- separar mudanças de DDL das etapas longas de backfill; DDL pequeno pode ser transacional quando o dialeto permitir, enquanto backfills são jobs resumíveis do painel;
- o executor do painel usa os migrators programáticos do Drizzle, mas o **controle** de versão, pré-condições, lease/fencing, checkpoints, cancelamento e relatório pertence ao serviço de schema da aplicação;
- nunca executar migração implicitamente no boot de cada instância, pois múltiplas instâncias poderiam concorrer e um erro impediria o serviço de subir;
- validar que o connector de destino está na versão lógica exigida antes de copiar dados entre providers.

Uma migração física não precisa ter o mesmo SQL nem o mesmo número interno em SQLite e PostgreSQL. Ela precisa levar ambos à mesma **versão lógica do contrato**, registrada separadamente pelo serviço de controle. Isso também permite que uma mudança seja trivial em PostgreSQL e exija reconstrução de tabela no SQLite sem contaminar o domínio.

## Isolamento e matriz de testes

- **SQLite:** arquivo temporário por worker, migrado e descartado integralmente.
- **PostgreSQL no CI:** container com versão principal igual à produção e banco exclusivo por worker/suíte. O PostgreSQL permite criar bancos clonando um template, mas exige `CREATEDB` e nenhuma conexão ativa no template ([`CREATE DATABASE`](https://www.postgresql.org/docs/current/sql-createdatabase.html)); começar criando bancos vazios e aplicando migrações, adotando template apenas se a medição justificar.
- **Contrato:** a mesma suíte orientada ao domínio roda contra SQLite, PostgreSQL e Firestore; não compara APIs do ORM.
- **Dialetos:** manter um pequeno conjunto de testes no PostgreSQL mesmo que as jornadas principais usem SQLite, porque constraints, concorrência, transações, ordenação e tipos não são equivalentes.
- **Build:** marcar módulos de infraestrutura com `server-only`; Next.js oferece esse limite para impedir imports acidentais no bundle cliente ([documentação](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)). Drivers Node não devem ser usados no Edge Runtime, que não suporta todas as APIs Node ([restrições do Edge](https://nextjs.org/docs/app/api-reference/edge)).

## Riscos e verificações antes da implementação

1. **Versões atuais do Drizzle:** a documentação pública consultada mistura exemplos de release candidate. Fixar uma versão estável após um spike e não adotar `@rc` por padrão.
2. **Semântica entre dialetos:** testar `null`, timestamps/UTC, booleans, JSON, ordenação, uniqueness, foreign keys, cascades e limites de inteiros antes de fechar o schema físico.
3. **Concorrência:** o SQLite síncrono é adequado ao uso local/CI isolado, não ao runtime hospedado.
4. **Conectividade App Hosting → PostgreSQL:** validar num backend de staging antes de comprometer Cloud SQL como fornecedor; a interface baseada em `pg` deve sobreviver à troca de fornecedor.
5. **Migrações pelo painel:** Drizzle fornece geração/aplicação de SQL, não o workflow operacional decidido no mapa. Esse workflow continua sendo código da aplicação e precisa de testes de interrupção e retomada.

## Decisão resumida

Usar **Drizzle + `better-sqlite3` + `pg`**, com schemas e migrações físicas separados, conectores de domínio por cima e Cloud SQL apenas como primeira hospedagem provável do PostgreSQL. Essa escolha é pequena, testável e não torna a aplicação dependente de uma API de banco Firebase. Antes de implementar o adapter produtivo, executar um spike estreito de Drizzle estável e conectividade App Hosting/Cloud SQL; se o Drizzle falhar nesse spike, Kysely é o fallback, sem alterar as portas de domínio.
