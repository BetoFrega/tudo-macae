import type * as entry from "../publishedArticle";
export async function run(module: typeof entry) {
  const reader = module.createPublishedSubmissionReader({ now: () => 100, readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, grants: [], receipt: null }), readMedia: async () => [] });
  await reader.read("article");
}
