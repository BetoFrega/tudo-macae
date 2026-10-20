# Mapa de contextos / Context Map

O Tudo Macaé aproxima pessoas da região por meio de classificados e de uma
blog secundário de registros ocasionais.
Este mapa identifica quem possui cada linguagem e regra. Caminhos ajudam a localizar
o contexto; a fronteira não é determinada pela estrutura de diretórios.

## Convenção de idioma

Cada conceito tem um nome canônico em português brasileiro e outro em inglês,
registrados juntos como `Português / English`. O português governa a conversa de
domínio, a interface, as validações, as URLs e o conteúdo persistido; o inglês governa
os identificadores de código. Coleções, campos, valores de enum e outras representações
técnicas pertencem às fontes técnicas que as implementam.

Um conceito tem um contexto proprietário para a mesma semântica. Homônimos com
significados locais diferentes podem existir quando a diferença estiver explícita.

## Contextos do produto

### [Classificados / Classifieds](docs/contexts/classifieds/CONTEXT.md)

Publica e descobre Anúncios e mantém a descoberta pública de Pessoas e Negócios; possui Anunciantes, Identidades anunciantes, Categorias e a
jornada de publicação. Abrange principalmente `ads`, `categories` e
`advertiser-profile`, sem transformar esses packages planos numa hierarquia.

Carregue para conceitos de classificados ou mudanças nessas capacidades e nas
superfícies de anúncio, categoria, perfil e publicação.
Para comportamento, siga os contratos de [Identidades anunciantes](https://app.notion.com/p/3ff84301eab3819283bcd1295e219c59),
[publicação](https://app.notion.com/p/3f684301eab381d0bf85e7b9f92c1b17),
[Categorias](https://app.notion.com/p/3ff84301eab38105b082fe689a5682cd),
[perfis reivindicáveis](https://app.notion.com/p/3ff84301eab381debc5fe4e1c3f9b837) ou
[moderação](https://app.notion.com/p/3ff84301eab38103889bdfd23dee84b9), conforme a capacidade tocada.

### [Editorial / Editorial](docs/contexts/editorial/CONTEXT.md)

Mantém Posts do Blog e a leitura do acervo. O painel humano existente é operado por
Administradores e Editores; o fluxo anterior e suas credenciais não fazem parte da
operação atual do blog.

Carregue para posts, Blog, acervo editorial ou mídia vinculada a essas publicações.
O [Blog](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a?pvs=204) possui o
comportamento vigente; siga o [roteamento do cânone de produto](docs/agents/product.md).
Os contratos locais anteriores registram apenas regras históricas.

### [Mensagens / Messaging](docs/contexts/messaging/CONTEXT.md)

Define Conversas e Mensagens privadas entre Perfis de usuário ou entre um Perfil de
usuário e um Negócio. A capacidade está especificada na
[#1488](https://github.com/BetoFrega/macae-classificados/issues/1488); Anúncios e
páginas de perfil são pontos de entrada, não participantes da Conversa.

Carregue para contato interno, caixa de entrada, Conversa, Mensagem e avisos de novas
Mensagens.
O [contrato de Mensagens](https://app.notion.com/p/3ff84301eab381e3a659d34aedf37331) possui participantes,
continuidade e revisão após Denúncia; a spec conserva histórias e estado de entrega.

### [Mídia / Media](docs/contexts/media/CONTEXT.md)

Mantém arquivos visuais canônicos, seus metadados, Procedência, revisões e concessões
de exibição. Não possui a ordem ou o limite de imagens dentro de outro contexto.

Carregue para `media`, Ilustração editorial, upload, metadados, Procedência, revisão
ou entrega pública de arquivos visuais.
O [contrato de Mídia](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835) possui efeitos, direitos de
uso e correções; os ADRs relacionados possuem suas escolhas técnicas.

### [Distribuição social / Social Distribution](docs/contexts/social-distribution/CONTEXT.md)

Transforma conteúdo verificado dos contextos do produto em Pacotes sociais para os
canais oficiais do Tudo Macaé. Possui a cadência, a adaptação por canal, a ordem das
peças e a programação externa; não possui a apuração editorial nem a Mídia canônica.

Carregue para calendário social, Instagram, Facebook, Meta Business Suite, carrossel,
legenda social, programação ou publicação em rede social.

### [Administração / Administration](docs/contexts/administration/CONTEXT.md)

Governa a autoridade administrativa e a concessão ou revogação dos papéis atuais.
Administrar uma entidade não transfere sua propriedade para este contexto.

Carregue para o papel de Administrador, custom claims, gestão de papéis ou guardas
das superfícies administrativas. Carregue também o contexto dono da entidade operada.

### [Identidade e acesso / Identity and Access](docs/contexts/identity-access/CONTEXT.md)

Reconhece a Conta de acesso usada nas áreas autenticadas, seus métodos de entrada
e o Aceite de condições. Não possui Anúncios, Negócios, Matérias nem a concessão
de papéis administrativos ou editoriais.

Carregue para login, cadastro, vinculação de provedores, recuperação de acesso,
sessão autenticada ou aceite dos Termos de Uso e da Política de Privacidade.

## Contextos de suporte interno

### [Harness de Agentes / Agent Harness](docs/contexts/agent-harness/CONTEXT.md)

Governa as fontes comportamentais dos agentes, seus adapters, skills, hooks, ponteiros
e verificação de integridade. Não possui regras do produto.

Carregue para mudanças em `AGENTS.md`, `.agents/`, `.claude/`, `.codex/`,
`skills-lock.json` ou documentos de roteamento do harness.

### [Orquestração de Testes / Test Harness](docs/contexts/test-harness/CONTEXT.md)

Governa preparação, isolamento, execução e diagnóstico do ambiente compartilhado de
testes. Estratégia de cobertura e autoria de testes continuam em suas fontes próprias.

Carregue para emuladores, portas derivadas, coleções Playwright, fixtures, preflight,
supervisão de processos ou logs do harness.

## Relações

### Domínio atual

- **Editorial → Mídia — consumo**: Matérias referenciam Mídias; publicação cria e
  remove concessões para seus usos públicos.
- **Administração → Editorial — autoridade**: Administração concede ou revoga o papel
  de Editor; Editorial possui a semântica do papel e das credenciais editoriais.
- **Administração → contextos do produto — autoridade**: opera capacidades
  administrativas sem possuir Anúncios, Categorias, Perfis, Matérias ou Mídias.
- **Identidade e acesso → contextos do produto — identificação**: fornece a
  Conta de acesso usada para autorizar ações; cada contexto mantém a
  titularidade e as regras do seu conteúdo.
- **Administração → Identidade e acesso — concessão de papéis**: papéis são
  concedidos à Conta de acesso sem que Administração possua sua identidade ou
  seus métodos de entrada.
- **Classificados ↔ Editorial — independência**: compartilhar a aplicação não cria
  uma integração de domínio.
- **Contextos do produto → Distribuição social — adaptação**: Distribuição social
  transforma conteúdo canônico e verificado em Pacotes sociais sem assumir a
  propriedade dos fatos, Anúncios, Matérias ou Mídias de origem.

### Promessa arquitetural

- **Mensagens → Classificados — referência planejada**: Conversas podem envolver um
  Negócio; Anúncios podem iniciar o contato sem possuir as Conversas ou Mensagens.
- **Mensagens → Identidade e acesso — autenticação planejada**: a Conta de acesso
  autoriza a pessoa a agir por um participante, sem ser ela própria parte da Conversa.
- **Classificados → Mídia — consumo planejado**: o ADR 0004 decidiu migrar imagens de
  Anúncios para Mídia. A integração ainda não existe; [#1071](https://github.com/BetoFrega/macae-classificados/issues/1071)
  acompanha a migração.

### Suporte

- **Orquestração de Testes → contextos da aplicação — verificação**: exercita
  contratos públicos e coordena o ambiente, sem possuir os dados de negócio criados.
- **Harness de Agentes → todos os contextos — descoberta**: roteia mapa, glossários e
  instruções; não participa das regras que carrega.

## Carregamento e fallback

Comece por este mapa quando a tarefa nomear um conceito de domínio, alterar
vocabulário ou tocar um caminho associado. Carregue apenas os glossários dos contextos
afetados. Uma referência cruzada não carrega transitivamente todos os outros contextos.

Quando a propriedade permanecer ambígua, amplie a leitura aos contextos candidatos.
Se nenhum candidato puder ser excluído com segurança, leia todos os glossários antes
de nomear ou alterar o conceito.
