import { cacheLife, cacheTag } from "next/cache";
import { getCategories } from "@/features/categories/actions/getCategories";
import { listAds } from "../actions/listAds";
import { AdGrid } from "./AdGrid";
import { HOMEPAGE_AD_LIMIT, selectHomepageAds } from "./selectHomepageAds";

export default async function AdList() {
  "use cache";
  cacheLife("minutes");
  cacheTag("ads");
  const [ads, categories] = await Promise.all([
    listAds({ maximumResults: HOMEPAGE_AD_LIMIT }),
    getCategories(),
  ]);

  if (ads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center">
        <p className="text-lg">Nenhum anúncio encontrado.</p>
        <p className="mt-2 text-sm">Seja o primeiro a publicar!</p>
      </div>
    );
  }

  const selection = selectHomepageAds(ads);

  return (
    <AdGrid
      ads={selection.ads}
      categories={categories}
      desktopOnlyFromIndex={selection.desktopOnlyFromIndex}
    />
  );
}
