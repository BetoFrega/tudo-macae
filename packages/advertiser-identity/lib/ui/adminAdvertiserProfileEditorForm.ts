import { z } from "zod";

import { adminAdvertiserProfileFormSchema } from "../../client";

export const editorFormSchema = adminAdvertiserProfileFormSchema.extend({
  sourceUrl: z.string().optional(),
});
export type AdminAdvertiserProfileFormValues = z.input<typeof editorFormSchema>;
