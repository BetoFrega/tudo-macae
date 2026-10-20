import type * as entry from "../mediaCleanup";

export async function run(module: typeof entry) {
  const workflow = module.createArticleMediaCleanup({
    readPending: async () => ({ version: 1, keys: [] }),
    isPublic: async () => false,
    purge: async () => ({ success: true }),
    complete: async () => true,
    failed: () => {},
  });
  await workflow.synchronize("article");
}
