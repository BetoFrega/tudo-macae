import { z } from "zod";

import { MAX_TITLE_LENGTH, MIN_TEXT_LENGTH, MAX_TEXT_LENGTH } from "@tudomacae/ads/client";
import { adTextSchema } from "@tudomacae/ads/validation";
export { MAX_TITLE_LENGTH, MIN_TEXT_LENGTH, MAX_TEXT_LENGTH };

export const adFormSchema = z.object({
  title: z
    .string()
    .min(1, "O título do anúncio é obrigatório")
    .max(
      MAX_TITLE_LENGTH,
      `O título deve ter no máximo ${MAX_TITLE_LENGTH} caracteres`,
    ),
  categoryId: z.string().min(1, "Selecione uma categoria"),
  subcategoryId: z.string().min(1, "Selecione uma subcategoria"),
  text: adTextSchema,
  advertiserProfileId: z.string().optional(),
  status: z.enum(["paused", "active"]).optional(),
  images: z.array(
    z.object({
      id: z.string().optional(),
      path: z.string().optional(),
      pending: z.boolean().optional(),
      url: z.string(),
      file: z.custom<File>().optional(),
      originalFileName: z.string().optional(),
      title: z.string().default(""),
      description: z.string().default(""),
      order: z.number(),
    }),
  ).default([]),
});

export type AdFormSchema = z.infer<typeof adFormSchema>;
