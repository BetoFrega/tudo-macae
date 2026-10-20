import type { AdvertiserIdentityType } from "@tudomacae/advertiser-identity/model";
import { getUserAdvertiserProfiles } from "./actions/getUserAdvertiserProfiles";

export async function identityTypeChoices(current?: { id: string }) {
  const profiles = await getUserAdvertiserProfiles();
  const personalAvailable = !profiles.some(profile => profile.identityType === "personal" && profile.id !== current?.id);
  return { personalAvailable };
}

export function withCurrentIdentityType(choices: Awaited<ReturnType<typeof identityTypeChoices>>, current: AdvertiserIdentityType | undefined) {
  return choices && current ? { ...choices, current } : choices;
}
