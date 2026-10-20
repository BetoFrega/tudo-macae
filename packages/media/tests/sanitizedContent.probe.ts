import type * as entry from "../sanitizedContent";
export async function run(module: typeof entry) {
  const content = module.createSanitizedMediaContent({ digest: async () => "", readMedia: async () => null, readBytes: async () => null });
  await content.read("missing", "a".repeat(64));
}
