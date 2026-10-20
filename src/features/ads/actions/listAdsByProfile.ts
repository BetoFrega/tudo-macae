import { cacheLife, cacheTag } from "next/cache";
import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { transformAdWithImages } from "../utils/adTransformations";
import type { Ad } from "../../../integrations/ads/use-cases/listAdsUseCase";

export type { Ad };

async function readPage(input: ReturnType<typeof publicAdDiscovery.canonical>) {
  const page = await publicAdDiscovery.read(input);
  return { ...page, items: page.items.map(transformAdWithImages) };
}

async function cachedPage(input: ReturnType<typeof publicAdDiscovery.canonical>) {
  "use cache";
  cacheLife("minutes");
  if (input.scope.kind === "profile") cacheTag(`ads-by-profile-${input.scope.profileId}`);
  return readPage(input);
}

export async function listAdsByProfilePage(profileId: string, cursor?: unknown) {
  const input = publicAdDiscovery.canonical({ scope: { kind: "profile", profileId }, cursor });
  return input.after ? readPage(input) : cachedPage(input);
}

export async function listAdsByProfile(profileId: string): Promise<Ad[]> {
  return (await listAdsByProfilePage(profileId)).items;
}
