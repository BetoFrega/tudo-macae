import type * as entry from "../flag";

export async function run(module: typeof entry) {
  const flag = module.createSiteSearchFlag({ evaluate: async () => true, now: () => 1 });
  await flag.enabled(module.siteSearchDistinctId(undefined));
}
