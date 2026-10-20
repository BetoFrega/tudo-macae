import { z } from "zod";
import {
  formatSaoPauloDateTimeInput,
  parseSaoPauloDateTime,
} from "@tudomacae/civil-time";
import {
  mediaKinds,
  mediaCaptionInputSchema,
  generatedMediaCreditSchema,
  type MediaMetadata,
} from "@tudomacae/media/model";

const requiredText = (message: string) => z
  .string({ error: message })
  .trim()
  .min(1, message);

export const mediaOrigins = [
  "own-production",
  "generated",
  "third-party",
] as const;

export const mediaOriginLabels: Record<(typeof mediaOrigins)[number], string> = {
  "own-production": "Produção própria",
  "generated": "Conteúdo gerado",
  "third-party": "Terceiro",
};

export const displayBases = [
  "own-production",
  "generated",
  "license",
  "permission",
] as const;

export const displayBasisLabels: Record<(typeof displayBases)[number], string> = {
  "own-production": "Produção própria",
  "generated": "Conteúdo gerado",
  "license": "Licença",
  "permission": "Permissão",
};

const mediaFormBaseSchema = z.strictObject({
  kind: z.enum(mediaKinds),
  alt: requiredText("Informe o texto alternativo da imagem."),
  caption: mediaCaptionInputSchema.pipe(z.string().trim()).default(""),
  origin: z.enum(mediaOrigins),
  creator: requiredText("Informe a autoria da mídia."),
  credit: requiredText("Informe o crédito público da mídia."),
  acquiredAt: z
    .string({ error: "Informe a data de aquisição da mídia." })
    .refine(
      value => Number.isFinite(parseSaoPauloDateTime(value)),
      "Informe a data de aquisição da mídia.",
    ),
  displayBasis: z.enum(displayBases),
  provider: z.string().trim().default(""),
  sourceUrl: z
    .string()
    .trim()
    .url("Informe uma URL de origem válida.")
    .or(z.literal("")),
  license: z.string().trim().default(""),
  permissionReference: z.string().trim().default(""),
});

type MediaFormShape = z.infer<typeof mediaFormBaseSchema>;
type RefinementContext = z.core.$RefinementCtx<MediaFormShape>;

function addCustomIssue(context: RefinementContext, field: keyof MediaFormShape, message: string) {
  context.addIssue({ code: "custom", path: [field], message });
}

function refineOwnProduction(input: MediaFormShape, context: RefinementContext) {
  if (input.displayBasis !== "own-production") {
    addCustomIssue(context, "displayBasis", "Produção própria exige fundamento de produção própria.");
  }
}

function refineGenerated(input: MediaFormShape, context: RefinementContext) {
  const credit = generatedMediaCreditSchema.safeParse(input.credit);
  if (!credit.success) {
    for (const issue of credit.error.issues) context.addIssue({ ...issue, path: ["credit"] });
  }
  if (input.displayBasis !== "generated") {
    addCustomIssue(context, "displayBasis", "Conteúdo gerado exige fundamento de conteúdo gerado.");
  }
}

function refineLicense(input: MediaFormShape, context: RefinementContext) {
  if (!input.sourceUrl) addCustomIssue(context, "sourceUrl", "Informe uma URL de origem válida.");
  if (!input.license) addCustomIssue(context, "license", "Informe a licença da mídia.");
}

function refinePermission(input: MediaFormShape, context: RefinementContext) {
  if (!input.permissionReference) {
    addCustomIssue(context, "permissionReference", "Informe a referência da permissão da mídia.");
  }
}

function refineThirdParty(input: MediaFormShape, context: RefinementContext) {
  if (!input.provider) addCustomIssue(context, "provider", "Informe o fornecedor original da mídia.");
  if (input.displayBasis === "license") refineLicense(input, context);
  else if (input.displayBasis === "permission") refinePermission(input, context);
  else addCustomIssue(context, "displayBasis", "Escolha licença ou permissão para uma mídia de terceiro.");
}

const provenanceRefinements: Record<MediaFormShape["origin"], typeof refineThirdParty> = {
  "own-production": refineOwnProduction,
  "generated": refineGenerated,
  "third-party": refineThirdParty,
};

export const mediaFormSchema = mediaFormBaseSchema.superRefine((input, context) => {
  provenanceRefinements[input.origin](input, context);
});

export type MediaFormInput = z.infer<typeof mediaFormSchema>;

export function mediaMetadataFromForm(input: MediaFormInput): MediaMetadata {
  const core = {
    creator: input.creator,
    credit: input.credit,
    acquiredAt: parseSaoPauloDateTime(input.acquiredAt),
  };
  const provenance = input.origin === "own-production"
    ? { origin: input.origin, ...core, displayBasis: "own-production" as const }
    : input.origin === "generated"
      ? { origin: input.origin, ...core, displayBasis: "generated" as const }
      : input.displayBasis === "license"
        ? {
            origin: input.origin,
            provider: input.provider,
            sourceUrl: input.sourceUrl,
            ...core,
            displayBasis: input.displayBasis,
            license: input.license,
          }
        : {
            origin: input.origin,
            provider: input.provider,
            ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
            ...core,
            displayBasis: "permission" as const,
            permissionReference: input.permissionReference,
          };
  return {
    kind: input.kind,
    alt: input.alt,
    caption: input.caption,
    provenance,
  };
}

export function mediaFormFromMetadata(metadata: MediaMetadata): MediaFormInput {
  const provenance = metadata.provenance;
  return {
    kind: metadata.kind,
    alt: metadata.alt,
    caption: metadata.caption,
    origin: provenance.origin,
    creator: provenance.creator,
    credit: provenance.credit,
    acquiredAt: formatSaoPauloDateTimeInput(provenance.acquiredAt),
    displayBasis: provenance.displayBasis,
    provider: provenance.origin === "third-party" ? provenance.provider : "",
    sourceUrl: provenance.origin === "third-party"
      ? provenance.sourceUrl ?? ""
      : "",
    license: provenance.origin === "third-party"
      && provenance.displayBasis === "license"
      ? provenance.license
      : "",
    permissionReference: provenance.origin === "third-party"
      && provenance.displayBasis === "permission"
      ? provenance.permissionReference
      : "",
  };
}

export type CreateMediaResult
  = | { success: true; mediaId: string }
    | { success: false; error: string; code?: string; details?: Record<string, unknown>; matches?: Array<{ id: string; alt: string }> };

export const updateMediaFormSchema = z.strictObject({
  id: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().max(1_000, "O motivo deve ter no máximo 1.000 caracteres.").optional(),
  form: mediaFormSchema,
});

export type UpdateMediaFormInput = z.infer<typeof updateMediaFormSchema>;

export type UpdateMediaResult
  = | { success: true }
    | { success: false; error: string };
