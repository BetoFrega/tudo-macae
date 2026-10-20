import { cacheLife, cacheTag } from "next/cache";
import {
  activityAreaCivilDate,
  listCategoryBusinessPreviewUseCase,
} from "@/packages/classifieds-api";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import { businessCatalogTaxonomyTag } from "@/features/advertiser-profile/actions/activityAreas";

export async function getCategoryBusinessPreview(
  categoryId: string,
): Promise<BusinessPublicData[]> {
  return getCachedCategoryBusinessPreview({
    categoryId,
    civilDate: activityAreaCivilDate(Date.now()),
  });
}

export async function getCategoryBusinessPreviewOrEmpty(
  categoryId: string,
): Promise<BusinessPublicData[]> {
  try {
    return await getCategoryBusinessPreview(categoryId);
  }
  catch (error) {
    // The category page stays up without Businesses; a failure the Worker logged is not logged twice.
    if (!(error instanceof ClassifiedsRequestError && error.serverReportedFailure)) {
      console.error(JSON.stringify({
        event: "business.category_preview.read_failed", ...publicImageRuntimeContext(), outcome: "failed",
        cause: error instanceof ClassifiedsRequestError ? error.code : "unexpected",
        correlationId: error instanceof ClassifiedsRequestError ? error.requestId : crypto.randomUUID(),
        route: "/categoria/[categoryId]/[categorySlug]",
      }));
    }
    return [];
  }
}

async function getCachedCategoryBusinessPreview(input: {
  categoryId: string;
  civilDate: string;
}): Promise<BusinessPublicData[]> {
  "use cache";

  cacheLife("hours");
  cacheTag("categories", businessCatalogTaxonomyTag);
  return listCategoryBusinessPreviewUseCase(input);
}
