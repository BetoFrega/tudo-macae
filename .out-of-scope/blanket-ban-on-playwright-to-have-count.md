# Proibição indiscriminada de `toHaveCount` nos testes Playwright

O harness não terá uma regra de lint que proíba todo uso de `toHaveCount`.

## Por que isto está fora de escopo

A regra comportamental do repositório proíbe contagens e ausências sobre listas
globais compartilhadas, pois outros testes podem alterar essas listas. Ela não
proíbe cardinalidade sobre dados isolados pelo próprio teste.

`toHaveCount` também expressa invariantes legítimos que não dependem do estado
global: ausência de um elemento depois de uma ação do próprio teste,
cardinalidade de uma relação criada sob uma chave única e tamanho de página ao
testar paginação. O matcher sozinho não contém informação suficiente para uma
regra estática distinguir esses casos de uma contagem global instável.

Uma proibição sintática produziria falsos positivos ou empurraria as mesmas
asserções para formas menos claras. A revisão deve avaliar a propriedade e o
escopo dos dados observados, conforme a orientação canônica de autoria E2E.

Esta decisão não impede uma verificação futura que consiga provar, pela API da
Page Object ou por uma anotação estrutural confiável, que o locator representa
uma lista global. Ela rejeita especificamente tratar todo `toHaveCount` como
violação.

## Pedidos anteriores

- [#439](https://github.com/BetoFrega/macae-classificados/issues/439) — a
  afirmação numérica desatualizada foi removida quando a orientação de testes
  foi separada em ramos pela #512.
