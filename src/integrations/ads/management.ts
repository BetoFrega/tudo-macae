import { route } from "@/packages/classifieds-api/route";
import type { createAdManagement } from "@tudomacae/ads/management";
type Management = ReturnType<typeof createAdManagement>;

export const adManagement = {
  create: route<Management["create"]>("ads.create", input => ({ ...input, id: input.id ?? crypto.randomUUID() }), true),
  delete: route<Management["delete"]>("ads.delete", input => input, true),
  read: route<Management["read"]>("ads.read", input => input),
  readOwned: route<Management["readOwned"]>("ads.owned", input => input),
  listAll: route<Management["listAll"]>("ads.all", () => null),
  listForUser: route<Management["listForUser"]>("ads.forOwner", input => input),
  listForProfile: route<Management["listForProfile"]>("ads.forProfile", input => input),
};
