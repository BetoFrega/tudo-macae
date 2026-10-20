import { route } from "@/packages/classifieds-api/route";
import { getCategories } from "@/features/categories/actions/getCategories";
import { createPublicAdDiscovery } from "@tudomacae/ads/publicDiscovery";

// Only `read` touches the store, and it is served by the API Worker instead.
const discovery = createPublicAdDiscovery({
  store: { read: async () => { throw new Error("Public Anúncio pages are read through the API Worker."); } },
  taxonomy: getCategories,
});
export const publicAdDiscovery = { canonical: discovery.canonical, filtered: discovery.filtered, read: route<typeof discovery.read>("ads.page", input => input) };
