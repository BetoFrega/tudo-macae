import type * as entry from "../articleCatalog";
export async function run(module: typeof entry) {
  const catalog = module.createArticleCatalog({ now: () => 100, read: async () => null, listVisible: async () => [] });
  await catalog.read("article");
  await catalog.list(5);
}
