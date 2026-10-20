import { expect, test } from "vitest";
import { createPublishedSubmissionReader } from "../publishedArticle";
import type { ArticleEditionReceipt } from "../publishedArticle";
import type { Media } from "@tudomacae/media/model";

test("public reading uses the receipt and never falls back for an incomplete managed Article", async () => {
  const fixture = publicationFixture();
  const receipt = fixture.receipt;
  let available = false;
  const reader = createPublishedSubmissionReader({
    now: () => 100,
    readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, grants: [], receipt: available ? receipt : null }),
    readMedia: async () => [],
  });
  expect(await reader.read("story")).toEqual({ kind: "unavailable" });
  available = true;

  expect(await reader.read("story")).toMatchObject({ kind: "published", publishedAt: 100, content: { body: "Texto revisado." } });
});

import type { PublicationReadState } from "../publishedArticle";

test.each([
  ["unpublished Article", (state: PublicationReadState) => { state.article!.status = "draft"; }],
  ["foreign receipt", (state: PublicationReadState) => { state.article!.receiptId = "foreign"; }],
  ["foreign Article", (state: PublicationReadState) => { state.receipt!.articleId = "foreign"; }],
  ["incomplete receipt", (state: PublicationReadState) => { state.receipt!.status = "granted"; }],
  ["missing grants", (state: PublicationReadState) => { state.grants = []; }],
  ["foreign grant", (state: PublicationReadState) => { state.grants[0].operationId = "foreign"; }],
] as const)("public policy refuses %s from persisted facts", async (_label, change) => {
  const fixture = publicationFixture();
  addPublicationMedia(fixture);
  const receipt = fixture.receipt;
  const state: PublicationReadState = { managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, receipt, grants: structuredClone(receipt.grants) };
  const reader = createPublishedSubmissionReader({ now: () => 100, readPublication: async () => state, readMedia: async () => fixture.media });
  expect(await reader.read("story")).toMatchObject({ kind: "published" });
  change(state);
  expect(await reader.read("story")).toEqual({ kind: "unavailable" });
});

test("public reading removes an email from an already persisted byline", async () => {
  const fixture = publicationFixture();
  const receipt = fixture.receipt;
  receipt.content.editorName = "editor@example.com";
  const reader = createPublishedSubmissionReader({
    now: () => 100,
    readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, grants: [], receipt }),
    readMedia: async () => [],
  });
  expect(await reader.read("story")).toMatchObject({ kind: "published", content: { editorName: "Redação Tudo Macaé" } });
  expect(receipt.content.editorName).toBe("editor@example.com");
});

test("public reading preserves an absent legacy byline", async () => {
  const fixture = publicationFixture();
  const receipt = fixture.receipt;
  delete receipt.content.editorName;
  const reader = createPublishedSubmissionReader({
    now: () => 100,
    readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, grants: [], receipt }),
    readMedia: async () => [],
  });
  const result = await reader.read("story");
  expect(result).toMatchObject({ kind: "published" });
  expect(result).not.toHaveProperty("content.editorName");
});

test("public reading keeps the published bytes but reflects current Media metadata", async () => {
  const fixture = publicationFixture();
  addPublicationMedia(fixture);
  const receipt = fixture.receipt;
  const record = fixture.media[0]!;
  record.alt = "Metadado alterado depois";
  const reader = createPublishedSubmissionReader({
    now: () => 100,
    readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, grants: receipt.grants, receipt }),
    readMedia: async () => [record],
  });
  expect(await reader.read("story")).toMatchObject({
    kind: "published",
    content: { media: [{ alt: "Metadado alterado depois", generated: false }] },
  });
  record.provenance = { origin: "generated", displayBasis: "generated", creator: "Tudo Macaé", credit: "Tudo Macaé / IA", acquiredAt: 1 };
  expect(await reader.read("story")).toMatchObject({
    kind: "published",
    content: { media: [{ generated: true, credit: "Tudo Macaé / IA" }] },
  });
});

test("public reading follows the current Article time, including hiding an already visible Article", async () => {
  const fixture = publicationFixture();
  const receipt = fixture.receipt;
  let now = 499;
  const article = { status: "published", receiptId: "operation", publishedAt: 500 };
  const reader = createPublishedSubmissionReader({ now: () => now, readPublication: async () => ({ managed: true, article, grants: [], receipt }), readMedia: async () => [] });
  expect(await reader.read("story")).toEqual({ kind: "unavailable" });
  now = 500;
  expect(await reader.read("story")).toMatchObject({ kind: "published", publishedAt: 500 });
  article.publishedAt = 600;
  expect(await reader.read("story")).toEqual({ kind: "unavailable" });
});

test("public reading exposes only the latest public update time and keeps correction history", async () => {
  const fixture = publicationFixture();
  const receipt = fixture.receipt;
  receipt.publicUpdatedAt = 700;
  receipt.corrections = [
    { summary: "Primeira correção.", createdAt: 600, editorId: "editor" },
    { summary: "Segunda correção.", createdAt: 700, editorId: "editor" },
  ];
  const reader = createPublishedSubmissionReader({
    now: () => 800,
    readPublication: async () => ({ managed: true, article: { status: "published", receiptId: "operation", publishedAt: 100 }, grants: [], receipt }),
    readMedia: async () => [],
  });
  expect(await reader.read("story")).toMatchObject({
    kind: "published",
    publishedAt: 100,
    updatedAt: 700,
    content: { corrections: [
      { summary: "Primeira correção.", createdAt: 600 },
      { summary: "Segunda correção.", createdAt: 700 },
    ] },
  });
});

function publicationFixture() {
  const receipt: ArticleEditionReceipt = {
    operationId: "operation", articleId: "story", status: "completed",
    content: { title: "Praça aberta", body: "Texto revisado.", path: "/noticia/story/praca-aberta", sources: [], media: [] },
    grants: [],
  };
  return { receipt, media: [] as Media[] };
}
function addPublicationMedia(fixture: ReturnType<typeof publicationFixture>) {
  const digest = "a".repeat(64);
  fixture.media.push({ id: "image", kind: "article-image", status: "staged", revision: 1, digest,
    storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp", createdAt: 1, updatedAt: 1,
    alt: "Praça", caption: "Praça aberta", provenance: { origin: "third-party", displayBasis: "permission", provider: "Prefeitura", permissionReference: "permission", creator: "Ana", credit: "Foto: Ana", acquiredAt: 1 } });
  fixture.receipt.grants.push({ operationId: "operation", articleId: "story", mediaId: "image", revision: 1, digest });
  fixture.receipt.content.media.push({ id: "image", digest, alt: "Praça", caption: "Praça aberta", credit: "Foto: Ana", generated: false });
}
