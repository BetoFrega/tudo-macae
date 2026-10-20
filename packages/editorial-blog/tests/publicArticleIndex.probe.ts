import type * as entry from "../publicArticleIndex";

export async function run(module: typeof entry) {
  const index = module.createPublicArticleIndex({ listCandidates: async () => [] });
  await index.list(100);
}
