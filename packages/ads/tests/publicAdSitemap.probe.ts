import { strict as assert } from "node:assert";
import type { createAdSitemap } from "../publicAdSitemap";
export async function run(module: { createAdSitemap: typeof createAdSitemap }) {
  const sitemap = module.createAdSitemap({ entries: async () => [{ id: "ad", slug: "anuncio", lastModified: 100 }] });
  assert.deepEqual(await sitemap.read(), { entries: [{ id: "ad", slug: "anuncio", lastModified: 100 }], truncated: false });
}
