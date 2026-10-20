import type * as entry from "../articleDistribution";
export async function run(module: typeof entry) {
  await module.createArticleDistribution({ readCandidate: async () => null, apply: async () => {} }).synchronize("article");
}
