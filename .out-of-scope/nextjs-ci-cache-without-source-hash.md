# Cache do build Next.js sem hash do código-fonte

O cache de build do Next.js na CI continuará usando uma chave que muda quando
o código-fonte relevante muda, acompanhada de uma chave de restauração baseada
nas dependências.

## Por que isto está fora de escopo

Remover o hash do código-fonte parece aumentar a quantidade de acertos exatos,
mas contraria o funcionamento combinado do Next.js e do `actions/cache`.

O cache do GitHub Actions é imutável. Quando há acerto exato, a entrada
existente é restaurada, mas não recebe o estado produzido pelo build atual.
Uma chave que mudasse somente com o lockfile congelaria a primeira versão de
`.next/cache` até a próxima alteração de dependências.

O padrão documentado pelo Next.js usa uma chave nova quando dependências ou
fontes mudam e uma chave de restauração menos específica. Assim, uma mudança de
fonte recupera o cache mais recente compatível, executa o build incremental e,
se o job terminar com sucesso, salva o resultado sob a nova chave. O workflow
do repositório já segue esse formato.

Referências:

- [Next.js: CI Build Caching](https://nextjs.org/docs/pages/guides/ci-build-caching)
- [GitHub Actions: Dependency caching reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)

Esta decisão não impede medir a duração dos builds nem ajustar quais arquivos
participam do hash quando houver evidência. Ela rejeita especificamente a
remoção do componente de fonte para produzir uma chave fixa por lockfile.

## Pedidos anteriores

- [#427](https://github.com/BetoFrega/macae-classificados/issues/427) — o outro
  problema reunido na issue, limitar os emuladores do job Vitest, foi entregue
  separadamente pela #509.
