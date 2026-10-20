import { route } from "@/packages/classifieds-api/route";
import type { createPublicationDrafts } from "@tudomacae/ads/publicationDrafts";
import { publicationProfileInput, type PublicationProfileInput } from "@tudomacae/ads/validation";
import { pendingPublicationInput, type PendingPublicationInput } from "@tudomacae/ads/validation";
export { publicationReviewInput } from "@tudomacae/ads/validation";

export { pendingPublicationInput, publicationProfileInput };
export type { PendingPublicationInput, PublicationProfileInput };
type Drafts = ReturnType<typeof createPublicationDrafts>;

export async function savePublication(userId: string, input: PendingPublicationInput) {
  return route<Drafts["save"]>("publications.save", (_userId, value) => value, true)(userId, input);
}
export async function readPublication(userId: string, id: string) {
  return route<Drafts["read"]>("publications.read", (_userId, value) => ({ id: value }))(userId, id);
}
export async function listPublications(userId: string) {
  return route<Drafts["list"]>("publications.mine", () => null)(userId);
}
export async function savePublicationProfile(userId: string, input: PublicationProfileInput) {
  return route<Drafts["saveProfile"]>("publications.profile", (_userId, value) => value, true)(userId, input);
}
