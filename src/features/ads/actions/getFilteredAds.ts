"use server";

import { identityDeletionCacheTag } from "@tudomacae/advertiser-identity/identityDeletion";

import { cacheLife, cacheTag } from "next/cache";
import { adListingTags } from "@tudomacae/ads";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { transformAdWithImages } from "../utils/adTransformations";
async function readPage(input: Awaited<ReturnType<typeof publicAdDiscovery.filtered>>) {
  const page = await publicAdDiscovery.read(input);
  return { ...page, items: page.items.map(transformAdWithImages) };
}

async function cachedPage(input: Awaited<ReturnType<typeof publicAdDiscovery.filtered>>) {
  "use cache";

  cacheLife("minutes");
  if (input.scope.kind === "category" || input.scope.kind === "subcategory") {
    cacheTag(identityDeletionCacheTag, ...adListingTags(input.scope));
  }
  return readPage(input);
}

export async function getFilteredAdsPage(params: {
  categoryId: string;
  subcategoryId?: string | undefined;
  cursor?: unknown;
}) {
  const input = await publicAdDiscovery.filtered(params);
  return input.after ? readPage(input) : cachedPage(input);
}

export async function getFilteredAds(params: {
  categoryId: string;
  subcategoryId?: string | undefined;
}) {
  return (await getFilteredAdsPage(params)).items;
}
