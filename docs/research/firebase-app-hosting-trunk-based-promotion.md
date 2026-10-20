# Promoção trunk-based no Firebase App Hosting

Pesquisa para o ticket [Pesquisar promoção trunk-based no Firebase App Hosting](https://github.com/BetoFrega/macae-classificados/issues/173), consultada em 19 de julho de 2026.

## Conclusão

O fluxo é viável, com **dois projetos Firebase e dois backends App Hosting**, mas a promoção precisa ser orquestrada pelo CI. O App Hosting permite iniciar um rollout de um commit específico e consultar rollout, build e tráfego por API; ele não oferece uma operação pronta de “promover de staging para produção”. Cada backend reconstrói o mesmo commit usando sua própria configuração. Portanto, a unidade promovida é o **SHA Git**, não uma imagem idêntica.

Fluxo recomendado:

1. `main` dispara automaticamente o backend de staging.
2. O workflow consulta o rollout/build até encontrar o SHA esperado e estado terminal bem-sucedido.
3. O runner espera o endpoint público de health responder com o mesmo SHA e então executa smoke tests de staging.
4. Se passarem, o workflow cria manualmente um rollout no backend de produção com o **mesmo SHA completo**.
5. O workflow repete a atestação por API e pelo endpoint de health e executa apenas checks não destrutivos em produção.
6. Falha pós-deploy aciona rollback para um build anterior conhecido como saudável; o rollback automático exigirá automação própria.

## Ambientes e configuração

O guia oficial recomenda produção e staging em **projetos Firebase distintos**, cada qual com seu backend, em vez de dois backends no mesmo projeto. Cada backend recebe um `Environment name`; durante o build, `apphosting.<ambiente>.yaml` sobrescreve `apphosting.yaml`. Segredos continuam separados por projeto e exigem acesso concedido às contas de serviço de build/runtime. [Deploy multiple environments](https://firebase.google.com/docs/app-hosting/multiple-environments) e [Configure App Hosting](https://firebase.google.com/docs/app-hosting/configure).

Configuração proposta:

- Staging: projeto Firebase próprio, backend ligado a `main`, rollout automático habilitado e environment name `staging`.
- Produção: projeto Firebase próprio, backend ligado ao mesmo repositório, rollout automático desabilitado e environment name `production` (ou configuração-base deliberadamente produtiva).
- Os IDs de projeto, região, backend e URLs devem ser variáveis do workflow; credenciais e segredos não entram no repositório.

## Disparo e atestação do SHA

O Firebase CLI aceita rollout manual de commit específico:

```sh
firebase apphosting:rollouts:create BACKEND_ID \
  --git_commit FULL_SHA \
  --project PROJECT_ID
```

A documentação também permite selecionar commits anteriores pela console e desabilitar rollouts automáticos. [Manage rollouts and releases](https://firebase.google.com/docs/app-hosting/rollouts) e [Firebase CLI reference](https://firebase.google.com/docs/cli#app-hosting-commands).

O controle não deve confiar só no término do comando. A API v1 oferece `rollouts.get/list`, `builds.get/list` e `traffic.get`; o rollout referencia seu build e termina em `SUCCEEDED`, `FAILED`, `CANCELLED` ou `SKIPPED`. O build expõe `source.codebase.hash`, o SHA-1 completo resolvido, além dos estados `BUILDING`, `BUILT`, `DEPLOYING`, `READY`, `FAILED`, `SKIPPED` e `EXPIRED`. `READY` sozinho não garante que o build serve tráfego, razão para conferir rollout/tráfego e depois a própria aplicação. [Rollout resource](https://firebase.google.com/docs/reference/apphosting/rest/v1/projects.locations.backends.rollouts), [Build resource](https://firebase.google.com/docs/reference/apphosting/rest/v1/projects.locations.backends.builds) e [App Hosting REST API](https://firebase.google.com/docs/reference/apphosting/rest).

O polling do CI deve ter timeout, backoff e falhar imediatamente em estado terminal negativo. Antes dos smoke tests, ele deve exigir simultaneamente:

- rollout `SUCCEEDED`;
- build associado com `source.codebase.hash == FULL_SHA`;
- endpoint público de liveness retornando `sha == FULL_SHA`.

O SHA deve ser injetado explicitamente no build, por exemplo como variável pública não secreta derivada do commit. O endpoint público deve expor apenas liveness e SHA. Diagnóstico de readiness (conector, schema e dependências) permanece autenticado. A fonte oficial não fornece automaticamente um “SHA da aplicação” em runtime; esse endpoint é responsabilidade do projeto.

## Smoke tests e promoção

Staging pode executar jornadas que criam dados sintéticos, desde que usem `runId`/namespace exclusivo, limpeza em `finally` e um janitor para resíduos. Produção deve receber somente checks não destrutivos: SHA, liveness/readiness, página pública e conectividade segura. O workflow jamais começa testes enquanto o healthcheck anunciar outro SHA.

App Hosting transforma o código em imagem via Cloud Build e implanta em Cloud Run/CDN. Como os projetos e configurações são diferentes, disparar o mesmo SHA em produção provoca **outro build**, não reutiliza necessariamente o container testado em staging. Isso é uma limitação explícita da estratégia “mesmo código”, e deve ser mitigada com lockfiles, builds determinísticos, atestação do SHA e smoke checks produtivos. [App Hosting build process](https://firebase.google.com/docs/app-hosting/build).

## Rollback

O App Hosting oferece dois caminhos oficiais pela console:

- rollback instantâneo para uma imagem de build anterior, sem reconstrução, preservando código e configuração daquele build;
- novo rollout de commit anterior, reconstruído com a configuração atual.

O primeiro é preferível para recuperação rápida; o segundo é apropriado quando a configuração/segredo atual precisa permanecer. [Manage rollouts and releases](https://firebase.google.com/docs/app-hosting/rollouts#restore_a_previous_rollout).

Há uma lacuna importante: a documentação pública do CLI descreve criação de rollout, mas não documenta um comando CLI específico para rollback instantâneo. A API expõe builds, rollouts e tráfego e permite criar rollout a partir de build existente, porém a automação concreta precisa ser validada num protótipo contra os projetos reais. Até isso ser comprovado, o runbook deve manter rollback instantâneo pela console como fallback e permitir que o CI reconstrua um SHA saudável anterior como fallback automatizado.

O pipeline deve persistir, para cada ambiente, o último par `{sha, build, rollout}` aprovado. Não deve escolher cegamente “o rollout anterior”, porque ele pode ser falho ou nunca ter recebido tráfego.

## Autenticação e permissões

Para CI, o Firebase recomenda Application Default Credentials; `FIREBASE_TOKEN` é legado e menos seguro. Em GitHub Actions, a opção indicada é OIDC com Workload Identity Federation, que evita chave longa e exige `permissions: id-token: write`. O trust deve restringir repositório/owner e `main`, preferencialmente usando IDs numéricos imutáveis nas condições. [Firebase CLI in CI](https://firebase.google.com/docs/cli#use_the_cli_with_ci_systems), [Google Workload Identity Federation for deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) e [google-github-actions/auth](https://github.com/google-github-actions/auth).

Permissões mínimas precisam ser concedidas separadamente em staging e produção. As ações de criar/observar rollout requerem, entre outras, `firebaseapphosting.rollouts.create/get/list`; observar builds/tráfego requer suas permissões `get/list`. Os papéis predefinidos `roles/firebaseapphosting.developer` e `roles/firebaseapphosting.viewer` dividem escrita e leitura, enquanto `roles/firebaseapphosting.admin` é mais amplo. O ideal é uma role customizada mínima para o runner; se isso não for viável inicialmente, usar Developer + Viewer sem Owner/Editor. A referência alerta ainda que deploy via Firebase CLI pode exigir `roles/serviceusage.apiKeysViewer`. [Firebase App Hosting roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product#app_hosting) e [App Hosting IAM permissions](https://cloud.google.com/iam/docs/roles-permissions/firebaseapphosting).

GitHub Environments devem separar `staging` e `production`, com aprovação/proteção para produção se desejada. O job de produção só deve ser alcançável após sucesso do job de staging para o mesmo `github.sha`.

## Lacunas que viram trabalho de implementação/protótipo

- Criar os dois projetos/backends e confirmar nomes de ambiente, configuração e isolamento de segredos.
- Implementar healthchecks público/protegido e injeção confiável do SHA.
- Escrever um poller da API v1 que correlacione rollout, build, tráfego e SHA, com timeout e diagnóstico.
- Prototipar rollback instantâneo automatizado por API e documentar fallback pela console.
- Configurar OIDC/WIF e role mínima em ambos os projetos; evitar credenciais estáticas.
- Guardar o último build saudável por ambiente e impedir promoções concorrentes (concurrency group no workflow).
- Medir propagação do CDN/healthcheck para definir timeout e backoff reais.

## Decisão sugerida

Adotar a sequência **staging automático em `main` → atestação tripla do SHA → smoke tests → rollout manual do mesmo SHA em produção → checks não destrutivos**, em projetos separados. Considerar a promoção como dois builds do mesmo código, não promoção binária. Antes de depender de rollback automático, abrir um protótipo operacional específico para provar criação de rollout a partir de build anterior/controle de tráfego com as APIs e credenciais reais.
