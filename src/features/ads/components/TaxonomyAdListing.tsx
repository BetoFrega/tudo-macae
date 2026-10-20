import type { PublicAdPage } from "@tudomacae/ads/publicDiscovery";
import type { Category } from "@tudomacae/categories/model";
import type { Ad } from "../../../integrations/ads/use-cases/listAdsUseCase";
import { AdCursorRecovery } from "./AdCursorRecovery";
import { AdGrid } from "./AdGrid";
import { AdPageHeading } from "./AdPageHeading";
import { AdPagination } from "./AdPagination";
import { FilteredAdEmptyState } from "./FilteredAdList";

interface TaxonomyAdListingProps {
  headingId: string;
  scopeName: string;
  path: string;
  adPage: PublicAdPage<Ad> & { invalidCursor?: true };
  cursor: string | string[] | undefined;
  categories: Category[];
  compactEmptyState: boolean;
}

/** Ads section of a category or subcategory page; the empty state replaces it when nothing is listed. */
export function TaxonomyAdListing({
  headingId,
  scopeName,
  path,
  adPage,
  cursor,
  categories,
  compactEmptyState,
}: TaxonomyAdListingProps) {
  const listed = adPage.items.length > 0 || cursor || adPage.nextCursor || adPage.invalidCursor;
  if (!listed) return <FilteredAdEmptyState scopeName={scopeName} compact={compactEmptyState} />;
  const currentCursor = typeof cursor === "string" ? cursor : undefined;
  return (
    <section
      id="anuncios"
      aria-labelledby={headingId}
      className="scroll-mt-36"
    >
      <AdPageHeading
        id={headingId}
        className="mb-5 text-2xl font-semibold tracking-tight"
        cursor={currentCursor}
        invalidCursor={adPage.invalidCursor === true}
      >
        Anúncios de
        {" "}
        {scopeName}
      </AdPageHeading>
      {adPage.invalidCursor
        ? <AdCursorRecovery path={path} />
        : (
            <>
              <AdGrid ads={adPage.items} categories={categories} />
              <AdPagination path={path} nextCursor={adPage.nextCursor} currentCursor={currentCursor} />
            </>
          )}
    </section>
  );
}
