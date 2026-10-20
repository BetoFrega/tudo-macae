import { listPublications } from "@/integrations/ads/publication";
import { hasPublishableProfile } from "@tudomacae/ads/client";
import { getUserAdvertiserProfiles } from "@/features/advertiser-profile/actions/getUserAdvertiserProfiles";
import Link from "next/link";
import { unauthorized } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { getCategoriesLive } from "@/features/categories/actions/getCategories";
import { listUserAds } from "../actions/listUserAds";
import { UserAdListClient } from "./UserAdListClient";
import { removeUndefinedFields } from "@/lib/utils";

export default async function UserAdList() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const [ads, categories, publications, profiles] = await Promise.all([
    listUserAds({ userId: user.uid }),
    getCategoriesLive(),
    listPublications(user.uid),
    getUserAdvertiserProfiles(),
  ]);

  // Map ads with category names
  const adsWithCategories = ads.map((ad) => {
    const category = categories.find(c => c.id === ad.categoryId);
    const subcategory = category?.subcategories.find(
      s => s.id === ad.subcategoryId,
    );
    return removeUndefinedFields({
      ...ad,
      categoryName: category?.name || "Sem categoria",
      subcategoryName: subcategory?.name || "Sem subcategoria",
    });
  });

  return adsWithCategories.length === 0 && publications.length === 0
    ? (
        <div className={`
          rounded-lg border border-dashed bg-muted/30 py-20 text-center
        `}
        >
          <h3 className="mb-2 text-lg font-semibold">
            Você ainda não tem anúncios
          </h3>
          <p className="mb-6 text-muted-foreground">
            Comece a vender hoje mesmo publicando seu primeiro anúncio.
          </p>
          <Button asChild variant="outline">
            <Link href="/publicar">Publicar Agora</Link>
          </Button>
        </div>
      )
    : (
        <UserAdListClient ads={adsWithCategories} publications={publications.map(item => ({ ...item, profilePending: !hasPublishableProfile(profiles.find(profile => profile.id === item.advertiserProfileId)) }))} />
      );
}
