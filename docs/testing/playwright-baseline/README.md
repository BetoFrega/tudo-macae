# Baseline e inventário Playwright

Registro canônico da #771 para a limpeza coordenada pela #765. O
[inventário](inventory.json) contém as decisões por cenário e asserção; os
lotes #772, #773 e os preparados pela #774 atualizam esse mesmo registro.

O resultado consolidado está na [auditoria final](final-audit.md), com
comparação integral, cobertura reconciliada e limitações.

## Leitura do inventário

A coleta de 2026-09-07 usa a revisão indicada no JSON. Os IDs PW identificam
os casos coletados; os sufixos A identificam as asserções explícitas. Expressões
são evidência do candidato, não instruções nem nova fonte de regras do produto.
Uma asserção em loop representa todas as iterações do cenário, não um novo caso
por iteração. Helpers compartilhados têm catálogo separado; conservar suas
precondições e sincronização até uma análise específica provar redundância.

- **manter**: depende da jornada, do navegador ou da aplicação integrada.
- **consolidar**: preservar asserções em contexto coerente já exercitado.
- **migrar**: substituir a prova por unitário ou integração antes da retirada.
- **migrar parcialmente**: manter a jornada e transferir variantes de regra;
  a decisão de cada asserção identifica o destino pretendido.
- **separar**: preservar o teste em coleção própria do harness; não representa
  economia de execução por si só.

O baseline não demonstra equivalência pela execução de substitutos.
Os candidatos são pontos de partida inspecionáveis, não permissão de exclusão.
Para efetivar uma migração, registrar teste substituto, resultado, revisão e
comando de execução no item correspondente. Até lá a cobertura permanece.
Os casos mantidos não precisam de substituto. Se uma migração exigir refatoração
relevante da aplicação, registrar o impedimento e manter o E2E.

## Fronteiras que precisam permanecer

- Claims/sessão e autorização por rota: preservar cookies reais, renovação e
  bloqueios no app. A matriz pode consolidar papel × rota, não eliminar rotas.
- Publicação, edição, exclusão e pausa de Anúncio: preservar preparação pela
  aplicação, conclusão de ações e leitura pública/cache. Writers diretos não
  substituem esses contratos.
- Perfis, categorias, mídia e navegação: preservar conexão formulário → operação
  → leitura. Contadores e variantes de validação são candidatos para jsdom.
- Redação: manter publicação, revisão, conflito com texto local preservado,
  retificação e projeções públicas. Regras isoladas não substituem essas jornadas.
- MCP: manter autenticação/transporte HTTP real e integração com a interface.
  O contrato de integração de rate limit usa configuração reduzida e relógio
  controlado; isso não prova sozinho o limite efetivo do app construído.
- Harness: processos reais, sanitização de trace e diagnóstico em navegador
  precisam continuar executados. O cenário de limpeza de categoria requer
  aplicação e Firebase; os de controles sintéticos não.

## Protocolo de comparação

1. Fixar revisão e registrar árvore limpa, sistema/arquitetura, versões de Node,
   Java, Playwright e navegador, worker/retries, comando e serviços iniciais.
2. Hidratar snapshots LFS antes da medição. Usar o supervisor de emuladores do
   worktree; comprovar suas portas livres. Não reutilizar outro checkout.
3. Coletar sem filtros com `mise exec -- npx playwright test --list --reporter=json`. Guardar a lista para conferir ausência de omissões.
4. Executar `npm run test:e2e -- --reporter=line,json` sob `mise exec --`, com
   `PLAYWRIGHT_JSON_OUTPUT_NAME` apontando para um arquivo local. Medir do início
   do processo até sua saída; o reporter JSON fornece tempos dos testes e steps.
5. Distinguir stack inicialmente parado de caches de build/dependências frios.
   O baseline após hidratação reutiliza o cache de build da tentativa rejeitada;
   repetir essa condição na comparação. Não apagar caches nem dados alheios.
6. Registrar inicialização até o primeiro teste, janela dos testes, soma das
   durações e encerramento. Steps aninhados não se somam aos pais: sobreposição
   produziria dupla contagem. Se fixtures não forem discriminadas pelo reporter,
   declarar preparação/corpo/limpeza como não separáveis; não estimar por diferença.
7. Ao final da limpeza, executar integralmente aplicação e harness e os tiers
   unitários/integração afetados. Registrar custo agregado e diferenças de coleção,
   ambiente e revisão. Comparação focal por lote não substitui esse resultado.
8. Reportar separadamente custo eliminado, reduzido pela troca de camada e apenas
   deslocado. Uma execução por revisão não estima variância nem prova causalidade
   de pequenas diferenças. Repetir apenas se a conclusão depender dessa incerteza.

Falha ambiental ou execução com testes falhos não constitui baseline aprovado.
Não corrigir cobertura ou alterar retries para obter um número verde.
Logs brutos podem conter dados de fixtures: publicar somente projeções de tempos,
resultados e identificação de testes; manter logs completos como material local.

## Resultado de 2026-09-07

A [medição sanitizada](measurement.json) é a fonte dos tempos por caso, ambiente,
revisão e tentativas rejeitadas. Sua execução válida aprovou todos os 121 casos,
sem retries nem skips. O tempo total inclui a inicialização do processo e o
encerramento. A soma dos testes é menor que a janela total por causa do custo
entre testes; as parcelas não devem ser somadas novamente ao tempo total.

Antes dela, o preflight recusou snapshots LFS não hidratados e uma execução
completa encontrou duplicação temporária do seletor de perfil vazio no cadastro.
O diff executável desta PR restringe os controles visíveis, mantendo
as mesmas asserções. A medição foi atualizada após sincronizar a correção de
foco da publicação integrada pela main na PR #781. A revisão anterior também está identificada no registro.
Essa correção é um bloqueio de prontidão do baseline, não um lote de migração.
As demais mudanças desta PR são documentação; não alteram o candidato executável.

Para reproduzir a lista de maiores custos a partir da evidência versionada:

```bash
python3 - <<'PY'
import json
from pathlib import Path
m = json.loads(Path('docs/testing/playwright-baseline/measurement.json').read_text())
print(m['wall'], m['phasesSeconds'], m['groupSummedSeconds'])
for case in sorted(m['tests'], key=lambda c: c['durationMs'], reverse=True)[:12]:
    print(case['id'], case['durationMs'], case['title'])
PY
```

## Prioridade dos lotes

1. **MCP, PW082:** maior caso individual da amostra. Avaliar migração da matriz
   de limitação para o contrato real em integração, cujo teste existente controla
   relógio e limite. Preservar prova representativa da configuração/rota real.
   Economia potencial por troca de camada, ainda não medida; #774 dimensiona o lote.
2. **Anúncios, PW027/PW028:** consolidação delimitada em #773. Os tempos completos
   desses casos incluem preparação: não representam economia garantida, pois as
   asserções continuam nas jornadas receptoras. Comparar o conjunto antes/depois.
3. **Harness:** #772 desloca uma coleção relevante, mas a maior parte de seu custo
   continuará existindo. PW121 concentra a dependência real de app/Firebase;
   separá-lo de testes sintéticos exige manter um fluxo explícito de execução.
4. **Jornadas longas mantidas:** PW111, PW023, PW004, PW005 e PW018 merecem examinar
   preparação/steps no lote de continuidade. Duração alta não autoriza remover
   publicação, visibilidade, navegação ou concessão de papéis. A instrumentação
   atual não prova qual fixture domina cada caso.
5. **Regras pequenas e duplicação de acesso:** URL canônica de Fonte, estrutura
   do formulário de Captura e as seis rotas repetidas do usuário comum têm
   oportunidades concretas no inventário. Seu ganho deve ser confrontado com o
   custo da cobertura substituta. A matriz dos demais papéis permanece distinta.

A #774 deve usar as decisões e impedimentos deste inventário para preparar os
lotes restantes e a auditoria final. Não marcar migração concluída ao publicar um
ticket ou ao localizar um teste candidato: é necessária evidência da substituição.

## Separação do harness (#772)

[harness-separation.json](harness-separation.json) registra a execução completa das
coleções separadas e o custo agregado. `revision`, `file`, `line` e asserções do
inventário preservam a fotografia do baseline; `currentLocation` identifica o
destino efetivo dos casos separados, com resultado e referência em `evidence`.
Os 121 contratos permanecem: 106 jornadas, 14 contratos independentes e uma
prova de limpeza com aplicação. A redução do comando de jornadas desloca custo;
a soma das coleções desta amostra cresceu com a inicialização adicional.

## Controles de anúncios (#773)

[ad-controls-consolidation.json](ad-controls-consolidation.json) registra o lote
focal de edição/exclusão. PW027 foi incorporado a PW031 e PW028 a PW032;
`currentLocation` em cada asserção registra também o destino das precondições
compartilhadas. As jornadas do proprietário permanecem independentes. A coleção
passa a 104 jornadas e mantém os 15 contratos do harness. Os tempos somados dos
seis casos anteriores e das quatro jornadas atuais incluem suas fixtures;
a comparação focal não representa economia demonstrada da suíte inteira.

## Continuidade (#774)

O inventário aponta aos tickets #788–#796 por caso ou por asserção quando a
jornada permanece. Os casos mantidos sem trabalho de implementação adicional
apontam à auditoria #797; a justificativa continua em cada item. A auditoria
reconcilia também alterações concorrentes posteriores ao baseline, como as
asserções acrescentadas à publicação de visitante pela PR #783.

O checklist [delivery.md](delivery.md) acompanha os gates. A ordem operacional
serial não cria dependência funcional entre lotes; #797 depende de todos os
onze lotes de implementação, incluindo #772 e #773 já concluídos. A spec #765
permanece aberta até a comprovação do resultado integral.

## Matriz de acesso (#788)

[access-matrix-consolidation.json](access-matrix-consolidation.json) registra a
consolidação de PW059 em PW001. As seis rotas administrativas repetidas estão
nas oito preservadas; cada asserção em loop registra suas rotas no inventário.
A prova antes do reload e as provas após o reload permanecem distintas. Os
outros papéis continuam independentes. A amostra focal não demonstrou redução
de tempo apesar de eliminar navegações e uma preparação repetidas.

## Contadores da publicação (#789)

[ad-counters-migration.json](ad-counters-migration.json) registra a execução do
substituto antes da retirada de PW026-A01/A02. A rota de publicação usa
`PublicationJourney`, não o `AdForm` indicado como candidato no baseline; o
substituto renderiza o componente e hook atuais. A jornada PW026 permanece.
O custo do novo teste de componente é separado do E2E; retirar duas asserções
sem retirar a preparação não demonstra redução do tempo integral.

## Expiração do controle MCP (#790)

A regra temporal ganhou prova determinística pelo handler público, com controle
criado pela aplicação: a mutação passa um milissegundo antes do prazo e é recusada
no instante da expiração, enquanto leituras continuam. Os 41 contratos de
integração e 19 testes de política, action e painel passaram.

PW008 permanece integralmente no E2E. O relógio do servidor Next não é controlado
pelo Vitest nem pelo navegador, e a interface pública exige expiração futura.
Preservar a prova HTTP antes/depois e os modos na tela mantém a espera real de
5,1 segundos; eliminá-la exigiria composição de relógio no servidor/harness fora
do escopo. Não houve retirada de asserção, caso ou preparação.

Os dois E2E passaram. Tempos, comandos, revisão, custo adicional e limitações
estão em [mcp-control-expiry.json](mcp-control-expiry.json). A variação focal não
demonstra economia; a auditoria final deve incluir a espera e o teste adicional.

## Variantes de organização de Pauta MCP (#791)

PW079 migra seis verificações para contratos públicos de integração: listagem de
Capturas, replay da Pauta, revisão da anexação, associação de Assunto, prioridade
recomendada sem decisão humana e recusa por escopo. Os 31 contratos passaram
antes de cada retirada; as duas sequências de revisão e execução estão em
[mcp-story-variants.json](mcp-story-variants.json).

A jornada mantém oito verificações e as mutações pelo transporte MCP real.
Conflito e ausência da Captura recusada permanecem juntos: conferir IDs em
integração não prova ausência renderizada. Pauta, Capturas selecionadas, prioridade
e justificativa continuam verificadas no navegador.

Foram retiradas três chamadas de ferramenta e a preparação de um cliente/PAT
limitado, sem eliminar caso ou alterar workers/retries. Os contratos existentes
receberam preparação e chamadas adicionais; a amostra focal não demonstra ganho
integral. A medição distingue custo deslocado e duração externa do E2E.

## Variantes de revisão e reapresentação MCP (#792)

PW080 migra oito verificações para os contratos públicos de desenvolvimento de
Matéria: escopo de apresentação, leitura inicial, atualização/conflito de revisão,
replay, URLs de revisão e recusa da ferramenta de publicação. Os 13 contratos
passaram antes da retirada; a sequência e o mapeamento individual estão em
[mcp-draft-variants.json](mcp-draft-variants.json).

A jornada mantém seis verificações integradas. A solicitação humana na interface
continua ligada à instrução, corpo e estado retornados pela retomada MCP. Previews,
reapresentação, link anterior e ausência no noticiário permanecem no navegador.

Foram retiradas seis chamadas de ferramenta e a preparação do cliente/PAT/Delegação
limitado a Rascunho. Nenhum caso foi removido. O contrato existente recebeu prova
adicional; os tempos focais e suas limitações não demonstram economia integral.

## Paginação e auditoria MCP (#793)

PW081 foi removido como caso independente. As verificações de HTTP 401 e
envelope/requestId permanecem no cenário de hostname MCP; o cenário de rate
limit já exercita leituras autenticadas no endpoint real. Tamanho de página,
os dois IDs, paginação e auditoria por cliente ficam no contrato público com
novos clientes SDK a cada página.

Os 31 contratos e os dois cenários HTTP substitutos passaram antes da remoção;
as cinco jornadas restantes do arquivo passaram depois dela. Foram eliminados
uma execução de preparação do controle, usuário editor, Fonte, Captura, Pauta,
prioridade, cliente/PAT e conexão/percurso próprios desse caso. Nenhum caso
foi adicionado à integração.

Comandos, resultados e a implementação inicial superada estão em
[mcp-read-contracts.json](mcp-read-contracts.json). A redução de trabalho está
identificada; as medições com escopos distintos não demonstram ganho de tempo.

## Rate limit MCP (#794)

PW082 mantém as 41 chamadas e todas as cinco asserções, executando as chamadas
em sequência. O contrato público de integração passou com duas chamadas
concorrentes consumindo a cota e a seguinte bloqueada antes da alteração
definitiva do E2E. Nenhum caso ou chamada foi acrescentado à integração.

Na comparação focal, o caso passou de 18,157 s para 2,801 s e 2,642 s; com
startup, de 42,177 s para 26,244 s e 25,534 s. A concorrência transferida para
a integração também tem custo, registrado em
[mcp-rate-limit.json](mcp-rate-limit.json); economia integral depende da auditoria.

O limite efetivo comprovado pelo E2E é 20 em local/staging. Produção declara
120; nenhuma configuração foi alterada. Verifique com
`rg -n -A 2 EDITORIAL_MCP_READS_PER_MINUTE apphosting.yaml apphosting.staging.yaml bin/setTestEnvVars.ts`.
A prova de leitura autenticada compartilhada com PW081 permanece no caso.

## Unicidade de Fonte (#795)

PW095 foi removido após 17 integrações passarem. O contrato público existente
comprova reutilização por URL canônica, lista somente a Fonte original pelo
identificador único do teste e relê seu ID sem substituição. Os 16 unitários
de formulário, action e canonicalização também passaram.

A jornada PW097 mantém cadastro e leitura pela UI, uso da Fonte na Captura e
efeitos visíveis de mutação. As dez jornadas restantes do arquivo passaram,
sem retries ou skips. Um caso, sessão, navegação e duas tentativas de cadastro
foram removidos; duas leituras públicas foram acrescentadas à integração.

Resultados antes/depois, comandos e limitações estão em
[source-uniqueness.json](source-uniqueness.json). A comparação focal inclui
startup e não substitui a medição integral dos tiers na auditoria final.

## Componentes de Captura (#796)

PW098 e PW099 foram removidos como casos independentes. O CaptureForm real
comprova os seis labels e a ausência de seletor de origem; o componente real
do detalhe comprova texto literal e ausência de elemento img. Os 31 testes
unitários passaram antes da retirada.

PW097 incorpora o preenchimento e a leitura do mesmo trecho literal, preservando
sua passagem pelo formulário, servidor e detalhe sem repetir cadastro de Fonte
e Captura. As oito jornadas restantes passaram sem retries ou skips.

A soma dos casos foi de 12,178 s para 9,654 s, mas o tempo com startup foi de
34,833 s para 36,827 s. Essas amostras não demonstram economia integral. A
mudança remove dois setups e acrescenta um teste jsdom; resultados, comandos e
limitações estão em [capture-components.json](capture-components.json).
