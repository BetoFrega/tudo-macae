import { connection } from "next/server";
import { listAllAds } from "@/features/ads/actions/listAllAds";
import { AdminAdList } from "@/features/ads/components/AdminAdList";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";

export default async function AdminAdsPage() {
  // The admin panel must always reflect live data, so it reads the
  // persistence uncached. That requires opting out of prerendering.
  await connection();
  const [ads, categories] = await Promise.all([listAllAds(), getCategoriesLive()]);

  // Map ads with category names
  const adsWithCategories = ads.map((ad) => {
    const category = categories.find(c => c.id === ad.categoryId);
    const subcategory = category?.subcategories.find(
      s => s.id === ad.subcategoryId,
    );
    return {
      id: ad.id,
      title: ad.title,
      slug: ad.slug,
      text: ad.text,
      status: ad.status,
      createdAt: ad.createdAt,
      categoryName: category?.name || "Sem categoria",
      subcategoryName: subcategory?.name || "Sem subcategoria",
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Anúncios</h2>
      </div>

      <AdminAdList ads={adsWithCategories} />
    </div>
  );
}
