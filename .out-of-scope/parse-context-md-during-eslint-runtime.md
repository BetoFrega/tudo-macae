# Parse de `CONTEXT.md` durante a execução do ESLint

A regra de identificadores em português não derivará sua política lendo e
interpretando `CONTEXT.md` em cada execução do ESLint.

## Por que isto está fora de escopo

O glossário é a fonte canônica dos conceitos e de suas traduções autorizadas,
mas não é uma tabela lexical de correspondência um-para-um.

Há termos compostos que compartilham palavras, como os diferentes “Estado de
…”, termos deliberadamente sem identificador e sinônimos proibidos que aparecem
em `_Evitar_`, como “usuário” e “notícia”. Uma palavra portuguesa isolada pode
portanto ter tradução ambígua ou representar apenas parte de um conceito. O
formato atual não permite gerar todas as sugestões do lint sem heurísticas e
exceções.

Ler Markdown durante o lint também acoplaria a regra ao diretório de execução e
ao formato editorial do documento. Uma mudança legítima de redação poderia
quebrar toda a análise estática antes de um teste explicar a inconsistência.

A alternativa adotada é manter a política lexical explícita e compará-la ao
glossário em teste. Toda entrada nova precisa ser coberta ou receber uma
exclusão explícita e justificada; toda sugestão existente precisa continuar
coerente com o vocabulário canônico.

Esta decisão pode ser revista se o domínio ganhar uma representação estruturada
que seja canônica por si só e da qual tanto a documentação quanto o lint sejam
gerados. Ela rejeita especificamente usar o Markdown editorial como arquivo de
configuração em runtime.

## Pedidos anteriores

- [#373](https://github.com/BetoFrega/macae-classificados/issues/373) — propôs
  derivar a tabela do glossário ou validar a consistência entre as duas.
