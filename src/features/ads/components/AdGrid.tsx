import { AdCard } from "./AdCard";
import type { Ad } from "../../../integrations/ads/use-cases/listAdsUseCase";
import type { Category } from "@tudomacae/categories/model";

interface AdGridProps {
  ads: Ad[];
  categories: Category[];
  desktopOnlyFromIndex?: number;
}

function categoryProps(ad: Ad, categories: Category[]) {
  const category = categories.find(c => c.id === ad.categoryId);
  const subcategory = category?.subcategories.find(
    s => s.id === ad.subcategoryId,
  );
  return {
    categorySlug: category?.slug || "",
    categoryName: category?.name || "Sem categoria",
    subcategorySlug: subcategory?.slug || "",
    subcategoryName: subcategory?.name || "Sem subcategoria",
  };
}

export function AdGrid({ ads, categories, desktopOnlyFromIndex }: AdGridProps) {
  return (
    <div className={`
      grid gap-4
      md:grid-cols-2
      lg:grid-cols-3
    `}
    >
      {ads.map((ad, index) => {
        const { categorySlug, categoryName, subcategorySlug, subcategoryName } = categoryProps(ad, categories);

        return (
          <AdCard
            key={ad.id}
            id={ad.id}
            title={ad.title}
            slug={ad.slug}
            categoryId={ad.categoryId}
            categorySlug={categorySlug}
            categoryName={categoryName}
            subcategoryId={ad.subcategoryId}
            subcategorySlug={subcategorySlug}
            subcategoryName={subcategoryName}
            text={ad.text}
            createdAt={ad.createdAt}
            imageUrl={ad.images?.[0]?.url}
            {...desktopOnlyFromIndex !== undefined && index >= desktopOnlyFromIndex
              ? {
                  className: `
                    hidden
                    lg:flex
                  `,
                }
              : {}}
          />
        );
      })}
    </div>
  );
}
