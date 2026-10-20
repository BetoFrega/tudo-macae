# demoSeed

Massa de demonstração para o servidor de desenvolvimento. `npm run dev` sobe com
o site cheio em vez de vazio.

## Onde a massa vive

Contas, papéis, Categorias, Negócios, Anúncios, suas fotos e as Matérias ficam no
fixture do API Worker que `bin/dev.mjs` sobe junto do app (Better Auth,
Classificados e Blog em D1, fotos em R2, tudo em memória). O seed os cria pelas
procedures do Worker, autenticado como a conta dona de cada registro, então a massa
passa pelas mesmas validações da produção. As Matérias viram posts do Blog,
gravados pela conta `editor`. Fontes, Capturas, Assuntos, Pautas, correções e Mídias
de Matéria não são semeados, porque nenhuma procedure do Worker os grava. Um post já
existente com o mesmo título é mantido.

O fixture não persiste: cada boot começa vazio e o seed o preenche de novo.
Se o fixture não sobe, o app não sobe; se o seed não alcança o Worker, o erro
aparece no log do boot.

O controller do fixture cobre o que nenhuma procedure oferece: `/create` cria a
conta já verificada com seus papéis, e `/backdate` reescreve o `createdAt` de um
Anúncio ou Negócio para o deslocamento do JSON. `/backdate-post` faz o mesmo com
as datas de um post do Blog. Essas duas rotas são as únicas escritas diretas no D1.

## Entrar no app

Todas as contas usam a mesma senha, **`demo1234`**. As três nomeadas:

| E-mail                  | Papel        |
| ----------------------- | ------------ |
| `admin@demo.local`      | `admin`      |
| `editor@demo.local`     | `editor`     |
| `advertiser@demo.local` | anunciante   |

Cada conta tem um Perfil de anunciante próprio, inclusive as de `editor` e
`admin` — o papel editorial não impede ninguém de anunciar, e assim toda tela de
"meus anúncios" tem o que mostrar.

O catálogo também inclui Negócios de “Informações públicas”, sem conta e sem
titular, para exercitar a distinção de origem. A massa cobre as 11 Categorias e
54 Subcategorias da taxonomia inicial; cada Categoria tem ao menos um Negócio
elegível, embora Subcategorias sem inventário continuem omitidas em `/negocios`.

Os anunciantes de massa seguem o mesmo padrão — `<nome>@demo.local`, a mesma
senha — e estão listados em `lib/data/accounts.json`. O seed imprime as três
nomeadas no log a cada boot, junto das URLs que o `npm run dev` já mostra.

A conta `editor` também abre `/redacao/materias`, que sobe com as Matérias de
`lib/data/articles.json`.

As Matérias cobrem `published` e `draft`. As publicadas preenchem o bloco de
noticiário da home; o rascunho só aparece na Redação. `publishedAt` nasce sempre de um
`publishedDaysAgo` relativo ao instante do boot, nunca de epoch absoluto, para
que uma Matéria da massa não vença uma publicação feita depois pelo Playwright.
A Manchete considera o banco inteiro. Epochs fixos dariam igualdade entre boots,
mas fariam a massa envelhecer; deslocamentos no passado preservam o comportamento
sem depender de alguém corrigir as datas.

Isso não é credencial vazada: `shouldSeedDemoData` só deixa o seed rodar num
`next dev` ao lado do fixture local do API Worker, e as contas existem apenas nele.

## Interface

Dois entry points:

```ts
seedDemoData(): Promise<DemoSeedSummary>;
seedDemoImages(): Promise<DemoImageSeedSummary>;
```

O guarda de ambiente é do pacote, não do chamador — `instrumentation.ts` roda em
todo ambiente e nos dois runtimes, e um chamador que precisasse lembrar do
guarda um dia esqueceria. O `await import` depois do guarda mantém o código do
seed, que usa APIs de Node, fora do bundle de edge.

`seedDemoImages` também exige `DEMO_SEED_IMAGES=1`.
`instrumentation.ts` só o dispara depois que `seedDemoData` termina, e não
aguarda o job: o servidor fica pronto enquanto as imagens aparecem. Sem a flag,
nenhum download começa. Um boot sem a flag preserva tudo que um job anterior já
concluiu.

O seed de categorias é chamado daqui, como o administrador, pela mesma operação
`categories.seed` do botão de `/admin/categorias`: catálogo antes de anúncio é
ordem de implementação, não algo que o chamador deva saber.

## Por que não há teste de ponta a ponta

Duas camadas, não três, e é de propósito. Este pacote define o Seed de demonstração
como dado de desenvolvimento, não de produção nem de teste: um spec que dependesse
desta massa passaria a quebrar sempre que alguém editasse um JSON daqui. Além
disso a stack do Playwright serve o app com `next build && next start`, onde
`NODE_ENV` é `production` e `shouldSeedDemoData` recusa — o seed nem roda ali.

## O que as próximas fatias copiam

- **Um JSON por coleção** em `lib/data/`, referenciando outras coleções por
  **chave estável** (`accountKey`, `businessKey`), que o seed resolve para o id real. Nenhum id
  gerado aparece nos dados.
- **Idempotência por chave**: nos Classificados, o Anúncio usa o id `demo-<chave>` e o Negócio usa
  `demo-<chave>` como `operationId` ou `idempotencyKey`, então repetir o seed
  contra o mesmo fixture repete a operação em vez de duplicar. Contas são
  reusadas pelo e-mail. Sem chave estável não há como distinguir uma segunda
  execução de uma duplicata.
- **Data por deslocamento**, nunca epoch absoluto: `createdDaysAgo` no JSON,
  resolvido por `timestampDaysBeforeBoot` contra o instante do boot, conforme a
  regra acima. Um deslocamento negativo é recusado, não corrigido.
- **Papéis por `updateRoles`**, a operação de `/admin`: uma conta reusada cujos
  papéis divergem do JSON é corrigida pelo administrador.

## Negócios

`lib/data/businesses.json` define a identidade pública e as Áreas de atuação de
cada negócio pelos slugs da taxonomia. O seed resolve os ids por
`subcategories.resolve` depois de criar as categorias. Negócios com titular nascem
por `profiles.create` como o dono; os de “Informações públicas”, por
`profiles.admin.create` como o administrador. Assim, a home, o catálogo e as
páginas individuais já abrem com uma massa completa no `dev:full`.

Imperial Imóveis demonstra um negócio com anúncios ativos. Pet Shop Lagoa tem
somente anúncios pausados e demonstra a página de um negócio útil por si só,
sem bloco de Anúncios.

## O registro deliberadamente vazio

O registro de chave `bare` (`bare@demo.local`) fica **sem foto, sem contatos e
sem anúncios**, para que o estado vazio da página de anunciante apareça sem
ninguém precisar montá-lo. Quem for preencher fotos depois passa por ele. Não dê
anúncios a ele: o Worker só cria anúncio para perfil com contato válido.

## Anúncios

`lib/data/ads.json` lista cada anúncio por `businessKey` (uma chave de
`businesses.json`) e por `categorySlug`/`subcategorySlug`. O dono do
anúncio nunca é escrito à parte: é sempre a conta por trás do perfil que ele
anuncia, resolvida a partir do `accountKey` daquele perfil — os dois nunca
podem discordar.

Categoria e subcategoria também não guardam id no JSON: o Worker gera os ids,
então o único jeito de apontar para uma é pelo par de slugs que o catálogo já
conhece. `lib/activityAreas.ts` resolve o par e guarda o resultado em cache pela
duração do boot.

Cada anúncio nasce por `ads.create` como o dono, sempre `active`; os pausados
passam depois por `ads.status`.

O corpo (`text`) de cada anúncio vem de um `.md` em `lib/data/ad-bodies/`, um
arquivo por subcategoria, reusado por todo anúncio que o referencia — é o que
evita escrever texto corrido em massa à mão. Título e status são o que muda
por anúncio.

A massa cobre `active` e `paused`, e a subcategoria `imoveis/comercial` fica
sem nenhum anúncio de propósito: o estado vazio de uma página de subcategoria
é caso de teste tanto quanto o cheio.

## Imagens curadas

Use `DEMO_SEED_IMAGES=1 npm run dev` para preencher progressivamente as duas
trilhas: uma foto por anúncio e fotos para os Negócios selecionados. O perfil `bare`
continua sem foto.

O manifesto em `lib/data/images.ts` fixa chave, arquivo, SHA-1, autoria,
licença e página de origem. Ele não conhece a API de nenhum fornecedor e não
faz busca em runtime. O job baixa cada arquivo com timeout e uma repetição e
confere os bytes. Fotos de Anúncio e de Negócio são reencodadas em WebP até caber
no limite de 1MB e enviadas pelo upload de fotos do Worker, como o dono; um alvo
que já tem foto é pulado. Falhas ficam no terminal e não interrompem o
restante do lote; outro boot retoma o que faltar sem duplicar. Um boot de conteúdo
preserva fotos já concluídas.

Toda avaliação local com Impeccable usa `npm run dev:full`, com imagens. Confira o
fim do job antes de julgar a composição. A massa inclui manchete longa, categorias
com inventário desigual e negócios sem anúncio.

## Verificação

Verifique com `npm run test:integration -- demoSeed.integration.test.ts demoSeedBlog.integration.test.ts`.
A integração do seed lê os Classificados e o Blog pelo Worker e aceita um fixture
vazio ou já preenchido pelo dev:full. Ela remove a massa de Classificados ao terminar.
