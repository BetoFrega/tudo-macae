import type * as entry from "../articleSitemap";
export async function run(module: typeof entry) {
  await module.createArticleSitemap({ listProjection: async () => [] }).list();
}
