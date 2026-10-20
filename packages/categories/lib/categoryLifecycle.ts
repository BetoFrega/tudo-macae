import { z } from "zod";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";

const categoryReferenceSchema = z.object({
  id: z.string().min(1, "Category ID is required"),
});

export function createCategoryLifecycle(dependencies: {
  categories: {
    beginDeletion(id: string): Promise<void>;
    listSubcategories(id: string): Promise<ActivityArea[]>;
    delete(id: string): Promise<void>;
  };
  subcategories: { delete(area: ActivityArea): Promise<void> };
}) {
  return {
    async delete(input: { id: string }): Promise<void> {
      const { id } = categoryReferenceSchema.parse(input);
      await dependencies.categories.beginDeletion(id);
      for (const area of await dependencies.categories.listSubcategories(id)) {
        await dependencies.subcategories.delete(area);
      }
      await dependencies.categories.delete(id);
    },
  };
}
