import type * as entry from "../publicArticleIndexReconciliation";
export async function run(module: typeof entry) {
  await module.createPublicArticleIndexReconciliation({ listCanonical: async () => [], replace: async () => {}, listProjection: async () => [] }).run(true);
}
