import type * as entry from "../articleMediaBody";

export async function run(module: typeof entry) {
  const bodyMedia = module.createArticleMediaBody();
  const body = bodyMedia.formatArticleMediaReference("photo-1");
  await bodyMedia.parseArticleBodyMediaReferences(body);
  await bodyMedia.articleMediaUseIds({ body, leadMediaId: "photo-1" });
  await bodyMedia.resolveArticleMediaReferences({
    body,
    leadMediaId: "photo-1",
    references: [{ mediaId: "photo-1", expectedRevision: 1 }],
  });
}
