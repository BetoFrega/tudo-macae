import { z } from "zod";
import { sameUploadValue as isDeepStrictEqual } from "./sameUploadValue";
import {
  mediaProvenanceSchema,
  mediaStatuses,
  type MediaProvenance,
  type MediaStatus,
  mediaMetadataSchema,
} from "../model";

const nonBlankText = z.string().refine(value => value.trim().length > 0);

const transitionPlanSchema = z.strictObject({
  id: nonBlankText,
  legacyProvenance: nonBlankText,
  status: z.enum(mediaStatuses),
  provenance: mediaProvenanceSchema,
});

export interface LegacyMediaTransitionPlan {
  id: string;
  legacyProvenance: string;
  status: MediaStatus;
  provenance: MediaProvenance;
}

export function validateLegacyMediaTransitionPlans(
  plans: LegacyMediaTransitionPlan[],
) {
  const parsed = plans.map(plan => transitionPlanSchema.parse(plan));
  const ids = new Set<string>();
  for (const plan of parsed) {
    if (ids.has(plan.id)) {
      throw new TypeError(`A Mídia ${plan.id} aparece duas vezes no plano de transição.`);
    }
    ids.add(plan.id);
  }
  return parsed;
}

export const mediaDocumentSchema = mediaMetadataSchema.and(z.strictObject({
  status: z.enum(mediaStatuses),
  revision: z.number().int().positive(),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}));

const legacyMediaDocumentSchema = z.strictObject({
  kind: z.literal("article-image"),
  alt: z.string().refine(value => value.trim().length > 0),
  provenance: z.string().refine(value => value.trim().length > 0),
  storagePath: z.string().refine(value => value.trim().length > 0),
  mimeType: z.string().refine(value => value.trim().length > 0),
  caption: z.string().default(""),
  credit: z.string().default(""),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

type MediaDocument = z.infer<typeof mediaDocumentSchema>;
type LegacyMediaDocument = z.infer<typeof legacyMediaDocumentSchema>;

function assertCanonicalMatchesPlan(
  id: string,
  document: MediaDocument,
  plan: LegacyMediaTransitionPlan,
) {
  const expectedProvenance = {
    ...plan.provenance,
    legacyStatement: plan.legacyProvenance,
  };
  if (document.status !== plan.status
    || !isDeepStrictEqual(document.provenance, expectedProvenance)) {
    throw new Error(
      `A Mídia canônica ${id} diverge do plano de transição.`,
    );
  }
}

function parseLegacyDocument(id: string, raw: unknown): LegacyMediaDocument {
  const legacy = legacyMediaDocumentSchema.safeParse(raw);
  if (!legacy.success) {
    throw new Error(
      `A Mídia ${id} está em estado ambíguo e não foi alterada.`,
    );
  }
  return legacy.data;
}

function assertLegacyMatchesPlan(
  id: string,
  legacy: LegacyMediaDocument,
  plan: LegacyMediaTransitionPlan | undefined,
): asserts plan is LegacyMediaTransitionPlan {
  if (!plan) {
    throw new Error(
      `A Mídia legada ${id} não tem plano de transição.`,
    );
  }
  if (plan.legacyProvenance !== legacy.provenance) {
    throw new Error(
      `A Procedência legada da Mídia ${id} diverge do plano.`,
    );
  }
  if (legacy.credit
    && legacy.credit !== plan.provenance.credit) {
    throw new Error(
      `O crédito legado da Mídia ${id} diverge do plano.`,
    );
  }
}

function canonicalFromLegacy(
  legacy: LegacyMediaDocument,
  plan: LegacyMediaTransitionPlan,
): MediaDocument {
  return mediaDocumentSchema.parse({
    kind: legacy.kind,
    alt: legacy.alt,
    caption: legacy.caption,
    provenance: {
      ...plan.provenance,
      legacyStatement: legacy.provenance,
    },
    status: plan.status,
    revision: 1,
    storagePath: legacy.storagePath,
    mimeType: legacy.mimeType,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  });
}

export function planLegacyMediaTransitions(documents: Array<{ id: string; data: unknown }>, plans: LegacyMediaTransitionPlan[]) {
  const plansById = new Map(validateLegacyMediaTransitionPlans(plans).map(plan => [plan.id, plan]));
  const transitions: Array<{
    id: string;
    document: MediaDocument;
  }> = [];
  let alreadyCanonical = 0;

  for (const snapshot of documents) {
    const plan = plansById.get(snapshot.id);
    const canonical = mediaDocumentSchema.safeParse(snapshot.data);
    if (canonical.success) {
      if (plan) {
        assertCanonicalMatchesPlan(snapshot.id, canonical.data, plan);
        alreadyCanonical += 1;
        plansById.delete(snapshot.id);
      }
      continue;
    }

    const legacy = parseLegacyDocument(snapshot.id, snapshot.data);
    assertLegacyMatchesPlan(snapshot.id, legacy, plan);
    transitions.push({
      id: snapshot.id,
      document: canonicalFromLegacy(legacy, plan),
    });
    plansById.delete(snapshot.id);
  }

  if (plansById.size > 0) {
    const [unknownId] = plansById.keys();
    throw new Error(`O plano cita a Mídia inexistente ${unknownId}.`);
  }

  return { transitions, alreadyCanonical };
}
