import { z } from "zod";

import { MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, MIN_TEXT_LENGTH } from "./client";

export const adStatusSchema = z.enum(["paused", "active"]);
export const adTitleSchema = z
  .string()
  .min(1, "O título do anúncio é obrigatório")
  .max(MAX_TITLE_LENGTH, `O título deve ter no máximo ${MAX_TITLE_LENGTH} caracteres`);
export const adTextSchema = z
  .string()
  .min(MIN_TEXT_LENGTH, `O anúncio deve ter pelo menos ${MIN_TEXT_LENGTH} caracteres`)
  .max(MAX_TEXT_LENGTH, `O anúncio deve ter no máximo ${MAX_TEXT_LENGTH} caracteres`);
export const publicationIdentifier = z.string().min(1).max(200).regex(/^(?!\.{1,2}$)[^/]+$/);

export const adImageSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  order: z.number(),
});

export const createAdInput = z.object({
  categoryId: z.string().min(1, "Category ID is required"),
  subcategoryId: z.string().min(1, "Subcategory ID is required"),
  advertiserProfileId: z.string().min(1, "Advertiser profile ID is required"),
  title: adTitleSchema,
  text: adTextSchema,
});

export const updateAdInput = z.object({
  id: z.string().min(1, "Ad ID is required"),
  advertiserProfileId: z.string().min(1, "Advertiser profile ID is required").optional(),
  categoryId: z.string().min(1, "Category ID is required"),
  subcategoryId: z.string().min(1, "Subcategory ID is required"),
  title: adTitleSchema,
  text: adTextSchema,
  status: adStatusSchema.optional(),
  images: z.array(adImageSchema).optional(),
  observedImageIds: z.array(z.string()).max(3).optional(),
});

export const pendingPublicationInput = z.object({
  id: publicationIdentifier,
  title: z.string().trim().min(1, "Informe o título do anúncio").max(MAX_TITLE_LENGTH),
  text: adTextSchema,
  categoryId: publicationIdentifier,
  subcategoryId: publicationIdentifier,
  advertiserProfileId: publicationIdentifier.optional(),
});

export const publicationReviewInput = pendingPublicationInput.omit({ id: true }).extend({
  images: z.array(z.object({ id: z.string().min(1), title: z.string(), description: z.string(), order: z.number().int().min(0) })).max(3),
  advertiserProfile: z.object({
    title: z.string().max(100),
    contacts: z.array(z.object({ number: z.string().max(32), isWhatsapp: z.boolean() })).max(3),
  }),
});

export type CreateAdInput = z.infer<typeof createAdInput>;
export type UpdateAdInput = z.infer<typeof updateAdInput>;
export type PendingPublicationInput = z.infer<typeof pendingPublicationInput>;

export { createAdInput as createAdSchema, updateAdInput as updateAdSchema };
export const adRecordSchema = z.object({
  categoryId: z.string().min(1, "Category ID is required"),
  subcategoryId: z.string().min(1, "Subcategory ID is required"),
  advertiserProfileId: z.string().min(1, "Advertiser profile ID is required"),
  title: adTitleSchema,
  text: createAdInput.shape.text,
  userId: z.string().min(1, "User ID is required"),
  status: adStatusSchema,
});

export const updateAdStatusSchema = z.object({
  id: z.string().min(1, "Ad ID is required"),
  status: adStatusSchema,
});
export const deleteAdSchema = z.object({ id: z.string().min(1, "Ad ID is required") });
export const getAdSchema = z.object({ id: z.string().min(1, "Ad ID is required") });
export const listAdsByUserSchema = z.object({ userId: z.string().min(1, "User ID is required") });
export const listAdsByProfileSchema = z.object({ profileId: z.string().min(1, "Profile ID is required") });

export type AdStatusType = z.infer<typeof adStatusSchema>;
export type UpdateAdStatusInput = z.infer<typeof updateAdStatusSchema>;
export type DeleteAdInput = z.infer<typeof deleteAdSchema>;
export type GetAdInput = z.infer<typeof getAdSchema>;
export type ListAdsByUserInput = z.infer<typeof listAdsByUserSchema>;
export type ListAdsByProfileInput = z.infer<typeof listAdsByProfileSchema>;

export const publicationProfileInput = z.object({
  publicationId: publicationIdentifier,
  profileId: publicationIdentifier.optional(),
  title: z.string().trim().min(1, "Informe o nome de quem anuncia").max(100),
  contacts: z.array(z.object({ number: z.string().regex(/^\d{10,11}$/), isWhatsapp: z.boolean() })).min(1).max(3),
  /** Applies only when this save creates the profile; a confirmed type never changes. */
  identityType: z.enum(["personal", "business"]).optional(),
  /** Declares the publication's subcategory as an Área de atuação of the profile, so it can enter the business catalog. */
  declareActivityArea: z.boolean().optional(),
});
export type PublicationProfileInput = z.infer<typeof publicationProfileInput>;
