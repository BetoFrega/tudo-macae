import { z } from "zod";

export const mediaKinds = ["article-image"] as const;

export type MediaKind = (typeof mediaKinds)[number];

export const mediaKindLabels: Record<MediaKind, string> = {
  "article-image": "Imagem de matéria",
};

export const mediaStatuses = ["staged", "active"] as const;

export type MediaStatus = (typeof mediaStatuses)[number];

const requiredText = (message: string) => z
  .string({ error: message })
  .refine(value => value.trim().length > 0, message);

const provenanceCore = {
  creator: requiredText("Informe a autoria da mídia."),
  credit: requiredText("Informe o crédito público da mídia.")
    .describe("Atribuição pública confirmada da autoria, exibida dentro da imagem. Não é legenda nem texto alternativo. Identifique geração por IA quando confirmada; aceita Tudo Macaé AI para conteúdo gerado."),
  legacyStatement: requiredText("Informe a Procedência legada da mídia.").optional(),
  acquiredAt: z
    .number({ error: "Informe a data de aquisição da mídia." })
    .int("Informe a data de aquisição da mídia.")
    .positive("Informe a data de aquisição da mídia."),
};

const ownProductionProvenanceSchema = z.strictObject({
  origin: z.literal("own-production"),
  ...provenanceCore,
  displayBasis: z.literal("own-production"),
});

const generatedProvenanceSchema = z.strictObject({
  origin: z.literal("generated"),
  ...provenanceCore,
  displayBasis: z.literal("generated"),
});

const licensedProvenanceSchema = z.strictObject({
  origin: z.literal("third-party"),
  provider: requiredText("Informe o fornecedor original da mídia."),
  sourceUrl: z.url("Informe uma URL de origem válida."),
  ...provenanceCore,
  displayBasis: z.literal("license"),
  license: requiredText("Informe a licença da mídia."),
});

const permittedProvenanceSchema = z.strictObject({
  origin: z.literal("third-party"),
  provider: requiredText("Informe o fornecedor original da mídia."),
  sourceUrl: z.url("Informe uma URL de origem válida.").optional(),
  ...provenanceCore,
  displayBasis: z.literal("permission"),
  permissionReference: requiredText("Informe a referência da permissão da mídia."),
});

export const mediaProvenanceSchema = z.union([
  ownProductionProvenanceSchema,
  generatedProvenanceSchema,
  licensedProvenanceSchema,
  permittedProvenanceSchema,
], {
  error: "Informe a origem estruturada da mídia.",
});

export type MediaProvenance = z.infer<typeof mediaProvenanceSchema>;

const altSchema = requiredText("Informe o texto alternativo da imagem.")
  .describe("Descrição visual acessível no atributo alt da imagem. Não usar como legenda ou crédito. Não exige aviso de geração por IA.");

export const mediaCaptionInputSchema = z.string().refine(
  value => !/(?:^|[.!?]\s+)(?:(?:imagem|imagens|ilustração|ilustrações|arte|artes|foto|fotos|fotografia|fotografias)\s+)?(?:gerad[ao]s?|criad[ao]s?|produzid[ao]s?)\s+(?:por|com)\s+(?:IA|intelig[eê]ncia\s+artificial)(?:[.!?](?:\s|$)|$)/i.test(value.trim()),
  "Deixe na legenda apenas o contexto editorial, sem aviso de geração por IA.",
);

export const articleImageSchema = z.strictObject({
  kind: z.literal("article-image"),
  alt: altSchema,
  caption: z.string().default("")
    .describe("Legenda editorial exibida junto da imagem. Pode ficar vazia; não preencher com alt ou crédito."),
  provenance: mediaProvenanceSchema,
});

export const mediaMetadataSchema = z.discriminatedUnion("kind", [
  articleImageSchema,
]);

export const generatedMediaCreditSchema = z.string()
  .regex(/\bIA\b|inteligência\s+artificial|\bTudo Macaé AI\b/i, "Identifique a geração por IA no crédito.");

export const articleImageMetadataInputSchema = articleImageSchema.omit({ kind: true }).extend({
  caption: mediaCaptionInputSchema.default(""),
}).superRefine((metadata, context) => {
  if (metadata.provenance.origin !== "generated") return;
  const credit = generatedMediaCreditSchema.safeParse(metadata.provenance.credit);
  if (!credit.success) {
    for (const issue of credit.error.issues) context.addIssue({ ...issue, path: ["provenance", "credit"] });
  }
});

export const articleImageInputSchema = articleImageMetadataInputSchema.safeExtend({
  kind: z.literal("article-image"),
});

export const mediaMetadataInputSchema = z.discriminatedUnion("kind", [
  articleImageInputSchema,
]);

export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;

export const updateMediaMetadataSchema = z.strictObject({
  id: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
  metadata: mediaMetadataInputSchema,
  actorId: z.string().trim().min(1),
});

export type UpdateMediaMetadataInput = z.infer<typeof updateMediaMetadataSchema>;

interface BaseMedia {
  id: string;
  status: MediaStatus;
  revision: number;
  storagePath: string;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  digest?: string;
}

export type Media = BaseMedia & MediaMetadata;

export interface MediaRevision {
  mediaId: string;
  revision: number;
  metadata: MediaMetadata;
  replacedAt: number;
  replacedBy: string;
}
