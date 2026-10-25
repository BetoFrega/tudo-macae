import { z } from "zod";

const stateSchema = z.literal("claimable").default("claimable");
const pageShape = {
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().trim().min(1).optional(),
};
const contactSchema = z.strictObject({
  number: z.string().regex(/^\d{10,11}$/),
  isWhatsapp: z.boolean(),
});
const activityAreaSchema = z.strictObject({
  categoryId: z.string().trim().min(1),
  subcategoryId: z.string().trim().min(1),
});
const activityAreasSchema = z.array(activityAreaSchema).min(1).max(3).refine(
  areas => new Set(areas.map(area => `${area.categoryId}:${area.subcategoryId}`)).size === areas.length,
  "Não repita uma Área de atuação.",
);
const sourceUrlSchema = z.url().refine(
  value => ["http:", "https:"].includes(new URL(value).protocol),
);

export const listAdvertiserProfilesInputSchema = z.strictObject({
  filter: z.strictObject({ state: stateSchema.optional() }).optional(),
  ...pageShape,
});
export const getAdvertiserProfileAdministrationInputSchema = z.strictObject({
  id: z.string().trim().min(1),
  expectedState: stateSchema.optional(),
});
export const findAdvertiserProfileDuplicatesInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  contacts: z.array(contactSchema).min(1).max(3),
  ...pageShape,
});
const profileFieldsShape = {
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000),
  contacts: z.array(contactSchema).min(1).max(3),
  activityAreas: activityAreasSchema,
};
export const createAdvertiserProfileAdministrationInputSchema = z.strictObject({
  state: stateSchema.optional(),
  ...profileFieldsShape,
  sourceUrl: sourceUrlSchema,
  duplicateConfirmationToken: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1),
  actorId: z.string().trim().min(1),
  channel: z.literal("administration"),
  correlationId: z.string().trim().min(1).optional(),
});
const updatePatchSchema = z.strictObject({
  title: profileFieldsShape.title.optional(),
  description: profileFieldsShape.description.optional(),
  contacts: profileFieldsShape.contacts.optional(),
  activityAreas: profileFieldsShape.activityAreas.optional(),
}).refine(value => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");
export const updateAdvertiserProfileAdministrationInputSchema = z.strictObject({
  id: z.string().trim().min(1),
  expectedState: stateSchema.optional(),
  expectedRevision: z.number().int().min(1),
  patch: updatePatchSchema.optional(),
  verifySource: z.strictObject({ url: sourceUrlSchema }).optional(),
  idempotencyKey: z.string().trim().min(1),
  actorId: z.string().trim().min(1),
  channel: z.literal("administration"),
  correlationId: z.string().trim().min(1).optional(),
}).refine(value => value.patch !== undefined || value.verifySource !== undefined, {
  message: "Informe um patch ou uma verificação de fonte.",
});
export const deleteAdvertiserProfileAdministrationInputSchema = z.strictObject({
  id: z.string().trim().min(1),
  expectedState: stateSchema.optional(),
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(1),
  actorId: z.string().trim().min(1),
  channel: z.literal("administration"),
  correlationId: z.string().trim().min(1).optional(),
});

export const createAdvertiserProfileToolInputSchema
  = createAdvertiserProfileAdministrationInputSchema.omit({
    actorId: true,
    channel: true,
    correlationId: true,
  });
export const updateAdvertiserProfileToolInputSchema = z.strictObject({
  id: z.string().trim().min(1),
  expectedState: stateSchema.optional(),
  expectedRevision: z.number().int().min(1),
  patch: updatePatchSchema.optional(),
  verifySource: z.strictObject({ url: sourceUrlSchema }).optional(),
  idempotencyKey: z.string().trim().min(1),
}).refine(value => value.patch !== undefined || value.verifySource !== undefined, {
  message: "Informe um patch ou uma verificação de fonte.",
});
export const deleteAdvertiserProfileToolInputSchema
  = deleteAdvertiserProfileAdministrationInputSchema.omit({
    actorId: true,
    channel: true,
    correlationId: true,
  });
