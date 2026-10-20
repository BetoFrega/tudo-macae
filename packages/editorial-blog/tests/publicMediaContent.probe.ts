import type * as entry from "../publicMediaContent";

export async function run(module: typeof entry) {
  const reader = module.createPublicMediaContent({
    now: () => 1,
    readMedia: async () => null,
    readGrants: async () => [],
    readPublication: async () => ({ managed: true, article: null, receipt: null, grants: [] }),
    readContent: async () => null,
  });
  await reader.isPublic("photo", "a".repeat(64));
  await reader.read("photo", "a".repeat(64));
}
