import type * as entry from "../publicationGrants";
export async function run(module: typeof entry) {
  const reader = module.createGrantedMediaContent({ readAccess: async () => ({ grant: null, published: false, receiptGrants: [] }), readContent: async () => null });
  await reader.read("article", "media");
}
