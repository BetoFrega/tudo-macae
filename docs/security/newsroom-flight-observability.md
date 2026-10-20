# Investigação de possível abuso nas leituras Flight da Redação

Na avaliação de 2026-10-01, com código da revisão `9cdc5566`, a observabilidade existente permite investigar tráfego, falhas e latência, mas não comprovar retrospectivamente se uma leitura privada foi autorizada ou se seu conteúdo chegou a um solicitante anônimo. A reprodução controlada do achado na revisão do scan comprova a vulnerabilidade naquela revisão; não comprova abuso em produção. Não foram consultados logs de produção nesta avaliação.

## Evidência disponível e limites

| Fonte no repositório | O que permite analisar | Limite para este abuso |
| --- | --- | --- |
| `www_origin_routed` | Classe `rsc`, resultado de transporte, classe de status, ray/request ID e revisão da origem quando disponíveis. | Logs detalhados configurados com amostragem de 10%; não incluem papel, decisão de autorização ou conteúdo. RSC também é navegação legítima. |
| `www_origin_signals` | Falhas de transporte/origem sem o head sampling dos logs detalhados. | O escritor retorna sem registrar resultados de sucesso. Uma leitura indevida com HTTP 200 não entra nesse contador. |
| `next.request.error` | Erros inesperados, rota normalizada, RSC/prefetch, digest e trace ID quando disponíveis. | Acesso indevido bem-sucedido não precisa gerar exceção. No Next instalado, erros de navegação, incluindo 401/403, são tratados antes do callback de erro de render. |
| Traces do servidor | Duração, correlação e status HTTP, condicionados à flag `server-tracing` e amostragem de 10%. | O exportador remove conteúdo, eventos e atributos livres; não exporta uma decisão de autorização. A configuração e a disponibilidade efetivas no provedor precisam de leitura de confirmação. |
| Guardas da PR | Sessão/papel nos layouts privados antes da leitura privada. | Não emitem hoje um evento operacional de autorização. |

HTTP 200 não prova autorização nem vazamento. Em uma resposta já iniciada, um stream Flight também pode transportar uma interrupção de autorização sem alterar os headers enviados. A árvore de navegação e os headers RSC são dados do solicitante, não evidência de identidade ou de intenção maliciosa. Ausência de logs, especialmente amostrados, não prova ausência de acesso.

## Como investigar com os sinais atuais

1. Delimitar o período e recuperar a revisão realmente atendendo tráfego. O SHA do scan e o da PR não comprovam qual versão estava em produção.
2. Consultar os registros de requisição disponíveis no provedor para o período e as rotas privadas. Comparar volume, método, status, latência, revisão e tráfego RSC observado com a navegação normal. Não limitar a investigação a 4xx/5xx.
3. Correlacionar por request ID/ray no edge e por trace ID no origin, quando presentes. IDs distintos exigem uma ligação registrada; não presumir que ray e trace ID sejam o mesmo valor. IDs propagados servem para correlação, não para autenticar um ator.
4. Usar erros e traces para distinguir falha de dependência, falha de transporte e renderização. Leituras de Firestore, se houver auditoria disponível, mostram atividade do backend; isoladamente não provam qual usuário recebeu a resposta nem que dados privados foram transmitidos.
5. Classificar o resultado: tráfego suspeito; tentativa de acesso negada; ou leitura/transmissão privada sem autorização demonstrada. Um pico de RSC ou um acesso negado isolado não basta para declarar ataque. Evidência insuficiente deve permanecer inconclusiva.

## Complemento recomendado

Registrar um evento próprio na fronteira de autorização da Server Action, que faz o papel de controller. Manter a regra fora da telemetria e emitir uma contagem por requisição/escopo, sem multiplicá-la pelas leituras paralelas de um render.

O evento proposto `private_read_authorization` conteria serviço, ambiente, release/revisão, operação de uma lista fechada, escopo Redação/Admin, papel exigido, resultado `allowed`/`unauthorized`/`forbidden`, transporte e correlação disponível. Usar a rota template do framework quando disponível; não reconstruí-la a partir de um header arbitrário. O resultado da aplicação deve permanecer separado do status HTTP.

Contadores por resultado e escopo permitem medir frequência de negativas. Duração e quantidade de resoluções de sessão por render ajudam a verificar o custo/latência apontado na revisão da PR. Essas medições ainda não foram implementadas; a redução de latência em produção não foi medida.

Preservar a visibilidade agregada de negativas; amostrar detalhes de sucesso quando necessário. Definir janela, quantidade mínima e limiar com base no tráfego observado antes de ativar alerta. Sem ativação de coleta, alertas ou aumento de amostragem nesta tarefa.

A [política de observabilidade](../../OBSERVABILITY.md) rege privacidade, correlação, custo e retenção. Não registrar cookies, tokens, árvore Flight, parâmetros, conteúdo editorial, corpo da resposta ou URLs completas. UID validado só é apropriado quando uma pergunta de investigação exige correlacionar um usuário; não usar UID/IP/entidade como dimensão de métrica. Para tráfego anônimo, não inventar identidade. Novos custos de ingestão exigem estimativa e aprovação antes da ativação.

## Reprodução da avaliação estática

```sh
rg -n 'requestClass|requestId|statusClass' packages/www-origin-routing/lib/router.ts packages/www-origin-routing/lib/types.ts
rg -n 'event.outcome|writeDataPoint' apps/www-origin/adapters/analytics.ts apps/www-origin/index.ts
rg -n 'head_sampling_rate|invocation_logs' apps/www-origin/wrangler.jsonc
rg -n 'next.request.error|rsc|prefetch|traceId' src/requestErrorDiagnostics.ts
rg -n 'server-tracing|TraceIdRatioBasedSampler|attributes|events' src/posthogTracing.ts
rg -n 'getCurrentUser|unauthorized|forbidden' src/app/redacao/layout.tsx src/app/admin/layout.tsx
rg -n 'getDigestForWellKnownError|isNextRouterError' node_modules/next/dist/server/app-render/create-error-handler.js
```

Os comandos verificam comportamento e configuração no código; não verificam exportação, retenção, alertas ou configurações ativas nos provedores.
