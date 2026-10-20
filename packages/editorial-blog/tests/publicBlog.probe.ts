import type * as entry from "../publicBlog";
export async function run(module: typeof entry) {
  const blog = module.createPublicBlog({
    now: () => 100,
    readPublication: async () => ({ managed: false, article: null, receipt: null, grants: [] }),
    readArticle: async () => null,
    readMedia: async () => [],
    readStory: async () => null,
    readSources: async () => [],
    readEditorName: async () => null,
    listPublished: async () => ({ items: [] }),
  });
  await blog.article("article");
  await blog.page();
}
