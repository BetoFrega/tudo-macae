import { route } from "@/packages/classifieds-api/route";
import type { createPendingPublicationTransitions } from "@tudomacae/ads/pendingPublicationTransitions";
type Transitions = ReturnType<typeof createPendingPublicationTransitions>;

export const pendingPublicationTransitions = {
  publish: route<Transitions["publish"]>("publications.publish", (_userId, id, reviewed) => ({ id, reviewed }), true),
  delete: route<Transitions["delete"]>("publications.delete", (_userId, id) => ({ id }), true),
};
