export const glossaryCoverageGeneral = [
  { glossaryTerm: "Post", excludedBecause: "Post is already the canonical English identifier for a blog publication." },
  { glossaryTerm: "Horário de publicação da matéria", excludedBecause: "The multiword term maps to publishedAt; generic date and time words are not globally banned identifiers." },
  { glossaryTerm: "Data de rechecagem", enforcedBy: [["rechecagem", "recheckAt"]] },
  { glossaryTerm: "Anúncio", enforcedBy: [["anuncio", "Ad"]] },
  { glossaryTerm: "Anunciante", enforcedBy: [["anunciante", "advertiser"]] },
  { glossaryTerm: "Identidade anunciante", enforcedBy: [["anunciante", "advertiser"]] },
  { glossaryTerm: "Exclusão de identidade anunciante", enforcedBy: [["anunciante", "advertiser"]] },
  { glossaryTerm: "Perfil público pessoal", enforcedBy: [["perfil", "Profile"]] },
  { glossaryTerm: "Interessado", enforcedBy: [["interessado", "interestedParty"]] },
  {
    glossaryTerm: "Visitante",
    excludedBecause:
      "The glossary deliberately declares that an unauthenticated visitor has no code identifier.",
  },
  {
    glossaryTerm: "Perfil de anunciante",
    enforcedBy: [
      ["anunciante", "advertiser"],
      ["perfil", "Profile"],
      ["usuario", "user"],
    ],
  },
  { glossaryTerm: "Negócio", enforcedBy: [["negocio", "Business"]] },
  {
    glossaryTerm: "Catálogo de ofertas",
    excludedBecause: "The compound maps to OfferingCatalog; catálogo also names public identity discovery, so it has no single global suggestion.",
  },
  {
    glossaryTerm: "Item de catálogo",
    excludedBecause: "The compound maps to OfferingItem; item is an English homograph and catálogo also names the public Business catalog.",
  },
  {
    glossaryTerm: "Seleção de interesse",
    excludedBecause: "The compound maps to InterestSelection; seleção also names media selection and interesse alone does not distinguish this message composition.",
  },
  {
    glossaryTerm: "Grupo de catálogo",
    excludedBecause: "The compound maps to OfferingGroup; grupo is generic grouping vocabulary and catálogo also names the public Business catalog.",
  },
  {
    glossaryTerm: "Habilitação de catálogo",
    excludedBecause: "The compound maps to CatalogEnablement; habilitação is generic authority vocabulary and catálogo alone cannot identify this permission.",
  },
  {
    glossaryTerm: "Perfil reivindicável",
    enforcedBy: [["reivindicavel", "claimable"]],
  },
  {
    glossaryTerm: "Negócio sem titular em revisão",
    enforcedBy: [["negocio", "Business"]],
  },
  {
    glossaryTerm: "Mudança administrativa de titularidade",
    excludedBecause: "The compound maps to AdministrativeOwnershipChange; its individual words describe broader changes and authority rather than one global identifier.",
  },
  { glossaryTerm: "Categoria", enforcedBy: [["categoria", "Category"]] },
  { glossaryTerm: "Categoria ativa", enforcedBy: [["categoria", "Category"]] },
  { glossaryTerm: "Subcategoria", enforcedBy: [["subcategoria", "Subcategory"]] },
  { glossaryTerm: "Subcategoria ativa", enforcedBy: [["subcategoria", "Subcategory"]] },
  { glossaryTerm: "Área de atuação", enforcedBy: [["atuacao", "ActivityArea"]] },
  { glossaryTerm: "Anúncio ativo", enforcedBy: [["anuncio", "Ad"]] },
  { glossaryTerm: "Anúncio pausado", enforcedBy: [["anuncio", "Ad"]] },
  { glossaryTerm: "Publicação pendente de anúncio", enforcedBy: [["anuncio", "Ad"]] },
  {
    glossaryTerm: "Negociação",
    excludedBecause:
      "The product does not model negotiations and the glossary deliberately declares no identifier.",
  },
  { glossaryTerm: "Denúncia", enforcedBy: [["denuncia", "Report"]] },
  { glossaryTerm: "Denúncia anônima", enforcedBy: [["denuncia", "Report"]] },
  { glossaryTerm: "Conversa", enforcedBy: [["conversa", "Conversation"]] },
  { glossaryTerm: "Mensagem", enforcedBy: [["mensagem", "Message"]] },
  { glossaryTerm: "Bloqueio", enforcedBy: [["bloqueio", "Block"]] },
  {
    glossaryTerm: "Denúncia de mensagem",
    enforcedBy: [["denuncia", "Report"], ["mensagem", "Message"]],
  },
  { glossaryTerm: "Arquivamento", enforcedBy: [["arquivamento", "Archiving"]] },
  {
    glossaryTerm: "Caso de moderação",
    enforcedBy: [["moderacao", "Moderation"]],
  },
  {
    glossaryTerm: "Ocultação por moderação",
    enforcedBy: [["moderacao", "Moderation"]],
  },
  {
    glossaryTerm: "Pedido de revisão da moderação",
    enforcedBy: [["moderacao", "Moderation"]],
  },
  {
    glossaryTerm: "Fixture",
    excludedBecause:
      "Fixture is an English homograph and banning it would reject the authorized identifier.",
  },
  { glossaryTerm: "Fonte", enforcedBy: [["fonte", "Source"]] },
  { glossaryTerm: "Permissão da fonte", enforcedBy: [["fonte", "Source"]] },
  { glossaryTerm: "Captura", enforcedBy: [["captura", "Capture"]] },
  { glossaryTerm: "Invalidação de captura", enforcedBy: [["captura", "Capture"]] },
  { glossaryTerm: "Consequência de invalidação de captura", enforcedBy: [["captura", "Capture"]] },
  { glossaryTerm: "Origem da captura", enforcedBy: [["captura", "Capture"]] },
  {
    glossaryTerm: "Proposta editorial",
    excludedBecause:
      "The compound maps to Editorial Pitch; proposta also describes proposals outside Editorial, so it has no single global suggestion.",
  },
  {
    glossaryTerm: "Disposição da proposta",
    excludedBecause:
      "The compound maps to Pitch Disposition; its individual words also describe disposition and proposals outside Editorial.",
  },
  {
    glossaryTerm: "Mesa de pauta",
    excludedBecause:
      "The compound maps to Story Desk; mesa is a general word, while pauta already maps to Story.",
  },
  {
    glossaryTerm: "Notícia",
    excludedBecause:
      "The editorial format maps to News Report, while noticia already maps to Article as a discouraged synonym of Matéria; a global suggestion cannot distinguish those uses.",
  },
  {
    glossaryTerm: "Reportagem",
    excludedBecause:
      "The editorial format maps to In-depth Report; reportagem also describes journalistic work beyond this format classification.",
  },
  {
    glossaryTerm: "Guia de serviço",
    excludedBecause:
      "The compound maps to Service Guide; guia and serviço also name guides and services outside Editorial.",
  },
  {
    glossaryTerm: "Análise",
    excludedBecause:
      "The editorial format maps to Analysis; análise also names analysis outside this format classification.",
  },
  {
    glossaryTerm: "Opinião",
    excludedBecause:
      "The editorial format maps to Opinion; opinião also describes views outside this format classification.",
  },
  {
    glossaryTerm: "Entrevista",
    excludedBecause:
      "The editorial format maps to Interview; entrevista also names an evidence-gathering activity independently of the resulting format.",
  },
  { glossaryTerm: "Pauta", enforcedBy: [["pauta", "Story"]] },
  { glossaryTerm: "Editoria", enforcedBy: [["editoria", "EditorialSection"]] },
  {
    glossaryTerm: "Formato editorial",
    excludedBecause:
      "The planning classification has no runtime identifier, while formato and editorial are too broad for safe global suggestions.",
  },
  {
    glossaryTerm: "Voz editorial",
    excludedBecause:
      "The writing identity is editorial guidance, while voz and editorial are too broad for safe global identifier suggestions.",
  },
  {
    glossaryTerm: "Tom da matéria",
    excludedBecause:
      "The article register is editorial guidance, while tom is too broad and matéria already has its own mapping.",
  },
  {
    glossaryTerm: "Função no portfólio",
    excludedBecause:
      "The planning role has no runtime identifier, while função and portfólio are too broad for safe global suggestions.",
  },
  {
    glossaryTerm: "Linha de cobertura",
    excludedBecause:
      "The recurring editorial promise has no runtime identifier, while linha and cobertura are too broad for safe global suggestions.",
  },
  {
    glossaryTerm: "Prioridade editorial",
    excludedBecause:
      "Editorial is an English homograph and prioridade is too general to identify this compound concept safely.",
  },
  {
    glossaryTerm: "Matéria",
    enforcedBy: [
      ["materia", "Article"],
      ["noticia", "Article"],
    ],
  },
  {
    glossaryTerm: "Estado da matéria",
    excludedBecause:
      "The compound maps to ArticleLifecycleStatus; estado is too general for a safe standalone suggestion.",
  },
  {
    glossaryTerm: "Edição da matéria",
    excludedBecause:
      "The compound maps to ArticleEditionSnapshot; edição is too general for a safe standalone suggestion.",
  },
  {
    glossaryTerm: "Ajuste editorial",
    excludedBecause:
      "The classification is the English homograph adjustment; editorial is already an English homograph.",
  },
  {
    glossaryTerm: "Atualização da matéria",
    excludedBecause:
      "The classification is update; atualização is too general for a safe standalone suggestion.",
  },
];
