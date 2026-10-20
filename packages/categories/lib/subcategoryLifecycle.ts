import { z } from "zod";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";

const subcategoryReferenceSchema = z.object({
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1),
});

export function createSubcategoryLifecycle(dependencies: {
  subcategories: {
    deactivateIfPresent(area: ActivityArea): Promise<void>;
    delete(area: ActivityArea): Promise<void>;
  };
  activityAreas: {
    removeAll(area: ActivityArea): Promise<void>;
  };
}) {
  return {
    async delete(input: ActivityArea): Promise<void> {
      const area = subcategoryReferenceSchema.parse(input);

      // The deletion marker closes new associations while cleanup is retried;
      // inactivity alone would allow a concurrent reactivation to reopen them.
      await dependencies.subcategories.deactivateIfPresent(area);
      await dependencies.activityAreas.removeAll(area);
      await dependencies.subcategories.delete(area);
    },
  };
}
