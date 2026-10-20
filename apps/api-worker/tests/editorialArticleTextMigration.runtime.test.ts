import { expect, test } from "vitest";
import { now, ok, provenance, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime("tests/editorialBlogFixtureWorker.ts");

const digest = (seed: string) => seed.repeat(64).slice(0, 64);
const readerMedia = { id: "lead", digest: digest("a"), alt: "Foto lead", caption: "Legenda lead", credit: provenance.credit, generated: false };
const media = { kind: "media", id: "lead", body: {
  kind: "article-image", alt: "Foto lead", caption: "Legenda lead", provenance, status: "active", revision: 1,
  storagePath: `media-staged/sha256-${digest("a")}.webp`, mimeType: "image/webp", digest: digest("a"), createdAt: now, updatedAt: now,
} };
const grant = { operationId: "blog-antigo", articleId: "antigo", mediaId: "lead", revision: 1, digest: digest("a") };
const published = { title: "Antigo", body: "Texto publicado.", path: "/noticia/antigo/antigo", sources: [{ name: "Prefeitura" }], media: [readerMedia] };
// A Redação article published through a receipt, then edited in its own fields without republishing.
const legacyPublished = [media,
  { kind: "publicationGrant", id: `${grant.operationId.length}-${grant.operationId}${grant.mediaId}`, body: grant },
  { kind: "publicationReceipt", id: "blog-antigo", body: { operationId: "blog-antigo", articleId: "antigo", status: "completed", content: published, grants: [grant] } },
  { kind: "article", id: "antigo", body: { status: "published", title: "Antigo", body: "Texto editado depois.", slug: "antigo", mediaIds: ["lead"],
    createdAt: now - 10, updatedAt: now - 5, publishedAt: now - 10, publicationReceiptId: "blog-antigo" } }];
const record = async (id: string) => (await ok("record", { kind: "article", id })).body;

test("keeps a published article's edition and its later edit, with the text only in blogContent", async () => {
  await ok("import", legacyPublished);
  const before = await ok("publicArticle", "antigo");
  expect(await ok("migrateText")).toEqual({ migrated: 1, remaining: 0 });
  const migrated = await record("antigo");
  expect(migrated).not.toHaveProperty("body");
  expect(migrated.blogContent).toEqual({ ...published, body: "Texto editado depois." });
  expect(migrated).toMatchObject({ updatedAt: now - 5, publicationReceiptId: "blog-antigo" });
  // Readers still see the published edition; the editor now sees the pending edit.
  expect(await ok("publicArticle", "antigo")).toEqual(before);
  expect((await ok("read", "antigo")).content).toMatchObject({ body: "Texto editado depois.", media: [readerMedia] });
  expect(await ok("migrateText")).toEqual({ migrated: 0, remaining: 0 });
});

test("gives a Redação draft without a receipt or slug its content from its own fields", async () => {
  await ok("import", [{ kind: "article", id: "pauta", body: { status: "draft", title: "Pauta da Câmara", body: "Rascunho.", storyId: "pauta", createdAt: now, updatedAt: now } }]);
  expect(await ok("migrateText")).toEqual({ migrated: 1, remaining: 0 });
  const migrated = await record("pauta");
  expect(migrated).not.toHaveProperty("body");
  expect(migrated.blogContent).toEqual({ title: "Pauta da Câmara", body: "Rascunho.", path: "/noticia/pauta/pauta-da-camara", media: [], sources: [], legacyHeaderMediaIds: [] });
});

test("only drops the copy from an article that already has blogContent, and stops at the run's limit", async () => {
  const content = { title: "Post", body: "Texto.", path: "/noticia/post/post", sources: [], media: [] };
  await ok("import", [
    { kind: "article", id: "post", body: { blog: true, status: "draft", title: "Post", body: "Cópia antiga.", blogContent: content, createdAt: now, updatedAt: now } },
    { kind: "article", id: "outro", body: { status: "draft", title: "Outro", body: "Texto.", createdAt: now, updatedAt: now } },
  ]);
  expect(await ok("migrateText", 1)).toEqual({ migrated: 1, remaining: 1 });
  expect(await ok("migrateText")).toEqual({ migrated: 1, remaining: 0 });
  expect(await record("post")).toEqual({ blog: true, status: "draft", title: "Post", blogContent: content, createdAt: now, updatedAt: now });
});
