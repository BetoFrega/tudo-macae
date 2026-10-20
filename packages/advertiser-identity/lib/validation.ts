import { z } from "zod";

export const activityAreaSchema = z.object({
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  subcategoryId: z.string().min(1, "Subcategoria é obrigatória"),
});

export const activityAreasSchema = z
  .array(activityAreaSchema)
  .max(3, "Máximo de 3 áreas de atuação")
  .superRefine((areas, context) => {
    const pairs = new Set<string>();
    areas.forEach((area, index) => {
      const key = `${area.categoryId}:${area.subcategoryId}`;
      if (pairs.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Uma área de atuação não pode ser selecionada duas vezes",
        });
      }
      pairs.add(key);
    });
  });

export const advertiserProfileContactSchema = z.object({
  number: z
    .string()
    .regex(
      /^\d{10,11}$/,
      "Telefone inválido (apenas números com DDD, 10 ou 11 dígitos)",
    ),
  isWhatsapp: z.boolean().default(false),
});

export const advertiserProfileContactsSchema = z
  .array(advertiserProfileContactSchema)
  .max(3, "Máximo de 3 contatos");

const publicSourceUrlSchema = z
  .url("Informe uma URL pública válida")
  .refine(url => ["http:", "https:"].includes(new URL(url).protocol), {
    message: "A fonte pública deve usar HTTP ou HTTPS",
  });

// Base schemas
export const advertiserProfileRecordSchema = z.object({
  title: z
    .string()
    .min(1, "Título é obrigatório")
    .max(100, "Título deve ter menos de 100 caracteres"),
  description: z
    .string()
    .max(1000, "Descrição deve ter menos de 1000 caracteres")
    .optional()
    .default(""),
  photoPath: z.string().optional(),
  contacts: advertiserProfileContactsSchema
    .optional()
    .default([]),
  activityAreas: activityAreasSchema.optional(),
});

export const advertiserIdentityTypeSchema = z.enum(["personal", "business"]);

// Use-case specific schemas
export const createAdvertiserProfileSchema = advertiserProfileRecordSchema.extend({
  identityType: advertiserIdentityTypeSchema.optional(),
});

export const classifyAdvertiserProfileSchema = z.object({
  id: z.string().min(1, "Profile ID is required"),
  userId: z.string().min(1),
  identityType: advertiserIdentityTypeSchema,
});

export const claimableAdvertiserProfileSchema = advertiserProfileRecordSchema.extend({
  contacts: advertiserProfileContactsSchema.min(1, "Informe pelo menos um contato"),
  activityAreas: activityAreasSchema.min(1, "Informe pelo menos uma área de atuação"),
  sourceUrl: publicSourceUrlSchema,
});

export const updateClaimableAdvertiserProfileSchema
  = claimableAdvertiserProfileSchema.extend({
    id: z.string().min(1, "Profile ID is required"),
  });

export const updateAdvertiserProfileSchema
  = advertiserProfileRecordSchema.extend({
    id: z.string().min(1, "Profile ID is required"),
    expectedRevision: z.number().int().min(1).optional(),
    contacts: advertiserProfileContactsSchema.optional(),
    activityAreas: activityAreasSchema.optional(),
  });

export const getAdvertiserProfileSchema = z.object({
  id: z.string().min(1, "Profile ID is required"),
});

export const deleteAdvertiserProfileSchema = z.object({
  id: z.string().min(1, "Profile ID is required"),
});

// Type exports
export type CreateAdvertiserProfileInput = z.infer<
  typeof createAdvertiserProfileSchema
>;
export type ClaimableAdvertiserProfileInput = z.infer<
  typeof claimableAdvertiserProfileSchema
>;
export type UpdateClaimableAdvertiserProfileInput = z.infer<
  typeof updateClaimableAdvertiserProfileSchema
>;
export type UpdateAdvertiserProfileInput = z.infer<
  typeof updateAdvertiserProfileSchema
>;
export type ClassifyAdvertiserProfileInput = z.infer<
  typeof classifyAdvertiserProfileSchema
>;
export type GetAdvertiserProfileInput = z.infer<
  typeof getAdvertiserProfileSchema
>;
export type DeleteAdvertiserProfileInput = z.infer<
  typeof deleteAdvertiserProfileSchema
>;

export const advertiserProfileFormSchema = z.object({
  title: z
    .string()
    .min(3, "O título deve ter pelo menos 3 caracteres")
    .max(100, "Título deve ter menos de 100 caracteres"),
  description: z
    .string()
    .max(1000, "Descrição deve ter menos de 1000 caracteres"),
  contacts: z
    .array(
      z.object({
        number: z
          .string()
          .regex(
            /^\d{10,11}$/,
            "Telefone inválido (apenas números com DDD, 10 ou 11 dígitos)",
          ),
        isWhatsapp: z.boolean(),
      }),
    )
    .max(3, "Máximo de 3 contatos"),
  activityAreas: activityAreasSchema,
});

export const adminAdvertiserProfileFormSchema
  = advertiserProfileFormSchema.extend({
    description: z.string().optional(),
  });

export const adminClaimableAdvertiserProfileFormSchema
  = adminAdvertiserProfileFormSchema.extend({
    contacts: adminAdvertiserProfileFormSchema.shape.contacts.min(
      1,
      "Informe pelo menos um contato",
    ),
    activityAreas: activityAreasSchema.min(
      1,
      "Informe pelo menos uma área de atuação",
    ),
    sourceUrl: publicSourceUrlSchema,
  });
