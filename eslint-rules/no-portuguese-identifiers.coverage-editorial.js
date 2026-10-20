export const glossaryCoverageEditorial = [
  { glossaryTerm: "Rascunho de matéria", enforcedBy: [["materia", "Article"]] },
  { glossaryTerm: "Submissão de matéria", enforcedBy: [["materia", "Article"]] },
  { glossaryTerm: "Rejeição de matéria", enforcedBy: [["rejeicao", "Rejection"]] },
  {
    glossaryTerm: "Tentativa de publicação",
    excludedBecause: "Tentativa and publicação also name advertisement and upload operations; the compound distinguishes the editorial attempt.",
  },
  {
    glossaryTerm: "Recibo de publicação",
    excludedBecause: "Recibo also names validation receipts; the compound identifies the editorial publication record.",
  },
  {
    glossaryTerm: "Estado da submissão",
    excludedBecause:
      "Estado can mean state or status, while submissão is modeled only as part of a compound identifier.",
  },
  {
    glossaryTerm: "Fila de revisão",
    excludedBecause:
      "Fila and revisão are general words that do not carry one safe suggestion outside this compound concept.",
  },
  {
    glossaryTerm: "Instrução de revisão",
    excludedBecause:
      "Instrução and revisão are general words that do not carry one safe suggestion outside this compound concept.",
  },
  {
    glossaryTerm: "Manchete",
    excludedBecause:
      "Manchete is a context-dependent homepage position, so a global headline suggestion would be misleading elsewhere.",
  },
  { glossaryTerm: "Assunto", enforcedBy: [["assunto", "Topic"]] },
  { glossaryTerm: "Retificação", enforcedBy: [["retificacao", "Correction"]] },
  {
    glossaryTerm: "Retirada do ar",
    excludedBecause:
      "The domain name is decided, but its code identifier is intentionally deferred until the offline transition is implemented.",
  },
  {
    glossaryTerm: "Editor",
    excludedBecause:
      "Editor is an English homograph and banning it would reject the authorized identifier.",
  },
  {
    glossaryTerm: "Chamador editorial",
    excludedBecause:
      "Editorial is an English homograph and chamador is ambiguous outside the EditorialCaller concept.",
  },
  {
    glossaryTerm: "Cliente editorial",
    excludedBecause:
      "Cliente can mean a person or a technical client, so it cannot carry one safe global suggestion.",
  },
  {
    glossaryTerm: "Sessão de cliente editorial",
    excludedBecause:
      "Sessao and cliente are both broad outside the EditorialClientSession compound, so neither has one safe global suggestion.",
  },
  {
    glossaryTerm: "Perfil de credencial editorial",
    excludedBecause:
      "The compound maps to EditorialCredentialProfile; perfil and credencial are too general for safe standalone suggestions.",
  },
  {
    glossaryTerm: "Atividade editorial",
    excludedBecause:
      "Editorial is an English homograph and atividade is too general to identify this compound concept safely.",
  },
  { glossaryTerm: "Leitor", enforcedBy: [["leitor", "reader"]] },
  { glossaryTerm: "Repórter cidadão", enforcedBy: [["cidadao", "Citizen"]] },
  { glossaryTerm: "Redação", enforcedBy: [["redacao", "newsroom"]] },
  { glossaryTerm: "Mídia", enforcedBy: [["midia", "Media"]] },
  { glossaryTerm: "Acervo de mídia", enforcedBy: [["midia", "Media"]] },
  {
    glossaryTerm: "Imagem principal da matéria",
    enforcedBy: [["materia", "Article"]],
  },
  {
    glossaryTerm: "Imagem no corpo da matéria",
    enforcedBy: [["materia", "Article"]],
  },
  { glossaryTerm: "Estado da mídia", enforcedBy: [["midia", "Media"]] },
  {
    glossaryTerm: "Concessão de exibição da mídia",
    enforcedBy: [["midia", "Media"]],
  },
  { glossaryTerm: "Revisão da mídia", enforcedBy: [["midia", "Media"]] },
  {
    glossaryTerm: "Espécie de mídia",
    enforcedBy: [
      ["especie", "MediaKind"],
      ["midia", "Media"],
    ],
  },
  { glossaryTerm: "Ilustração editorial", enforcedBy: [["ilustracao", "Illustration"]] },
  { glossaryTerm: "Procedência", enforcedBy: [["procedencia", "provenance"]] },
  {
    glossaryTerm: "Crédito",
    excludedBecause:
      "Crédito can mean media attribution or a financial concept, so it cannot carry one safe global suggestion.",
  },
  {
    glossaryTerm: "Texto alternativo",
    excludedBecause:
      "The compound maps to Alternative Text (alt in HTML); texto and alternativo are generic words without a safe global identifier suggestion.",
  },
  {
    glossaryTerm: "Legenda",
    excludedBecause:
      "Legenda can mean an editorial Caption, a chart Legend or a video Subtitle, so it cannot carry one safe global suggestion.",
  },
  { glossaryTerm: "Administrador", enforcedBy: [["administrador", "Administrator"]] },
  {
    glossaryTerm: "Papel",
    excludedBecause: "Papel is a general homonym, so a global Role suggestion would be unsafe outside Administration.",
  },
  {
    glossaryTerm: "Conta de acesso",
    excludedBecause: "Conta and acesso are general words; only their compound identifies the account in Identity and Access.",
  },
  {
    glossaryTerm: "Aceite de condições",
    excludedBecause: "Aceite can also describe review or validation outcomes, so it has no safe global identifier suggestion.",
  },
  {
    glossaryTerm: "Fonte canônica",
    excludedBecause: "Fonte already maps to Source in Editorial; context distinguishes Canonical Source without a conflicting global ban.",
  },
  { glossaryTerm: "Adapter", excludedBecause: "Adapter is already English." },
  { glossaryTerm: "Skill", excludedBecause: "Skill is already English." },
  { glossaryTerm: "Hook", excludedBecause: "Hook is already English." },
  {
    glossaryTerm: "Ponteiro de contexto",
    excludedBecause: "The compound is context-specific and its component words have no safe global suggestion.",
  },
  {
    glossaryTerm: "Bloco de emuladores",
    excludedBecause: "The compound is specific to Test Harness; its component words are too general for global bans.",
  },
  {
    glossaryTerm: "Coleção de testes",
    excludedBecause: "Coleção also names persisted data, so Test Collection cannot become a global suggestion.",
  },
  { glossaryTerm: "Preflight", excludedBecause: "Preflight is already English." },
  {
    glossaryTerm: "Falha ambiental",
    excludedBecause: "The compound distinguishes a harness outcome; its component words are too general for global bans.",
  },
  {
    glossaryTerm: "Pacote social",
    excludedBecause:
      "Package is also a technical repository concept; the Social Package compound does not justify a global pacote ban before runtime code exists.",
  },
  {
    glossaryTerm: "Cadência social",
    excludedBecause:
      "Cadence may describe unrelated scheduling systems; the compound is currently an operational skill concept without a code identifier.",
  },
  {
    glossaryTerm: "Peça social",
    excludedBecause:
      "Peça is ambiguous outside Social Card, so a global Card suggestion would be misleading.",
  },
  {
    glossaryTerm: "Template social",
    excludedBecause:
      "Template is already English and social is an English homograph, leaving no Portuguese lexical term to ban.",
  },
  {
    glossaryTerm: "Variante de template",
    excludedBecause:
      "Variante is broad outside Template Variant and the compound currently belongs only to the publishing skill.",
  },
  {
    glossaryTerm: "Manifesto social",
    excludedBecause:
      "Manifesto can name unrelated declarations; the Social Manifest compound is operational rather than a runtime identifier.",
  },
  {
    glossaryTerm: "Validade social",
    excludedBecause:
      "Validade also describes credentials and ordinary validation, so it cannot safely map globally to Social Freshness.",
  },
  {
    glossaryTerm: "Fila social",
    excludedBecause:
      "Fila names several existing queues; context is required to distinguish Social Queue from editorial queues.",
  },
  {
    glossaryTerm: "Lote social",
    excludedBecause:
      "Lote can identify unrelated batches, so the Social Batch compound does not support one global suggestion.",
  },
  {
    glossaryTerm: "Painel de revisão social",
    excludedBecause:
      "Painel and revisão are general UI and workflow words that do not safely identify Social Review Board globally.",
  },
];
