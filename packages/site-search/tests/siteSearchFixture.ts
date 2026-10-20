import {
  createSiteSearch,
  type SiteSearchProviderReply,
  type SiteSearchRecord,
} from "../search";

export const origin = "https://www.tudomacae.com.br";

export function searchWith(reply: SiteSearchProviderReply | (() => Promise<SiteSearchProviderReply>)) {
  const records: SiteSearchRecord[] = [];
  let clock = 1_000;
  const search = createSiteSearch({
    siteOrigin: origin,
    now: () => (clock += 25),
    provider: {
      search: typeof reply === "function" ? reply : async () => reply,
    },
    record: record => records.push(record),
  });
  return { search, records };
}
