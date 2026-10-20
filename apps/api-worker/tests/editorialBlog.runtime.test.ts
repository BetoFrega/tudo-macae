import { describe, expect, test } from "vitest";
import { barrier, call, now, ok, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime("tests/editorialBlogFixtureWorker.ts");

const digest = (seed: string) => seed.repeat(64).slice(0, 64);
const provenance = { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: now };
const licensed = { origin: "third-party", provider: "Agência", creator: "Ana Souza", credit: "Foto: Agência", displayBasis: "permission", permissionReference: "licença", acquiredAt: now };
function media(id: string, seed: string, status = "staged", origin: object = provenance) {
  return { kind: "media", id, body: {
    kind: "article-image", alt: `Foto ${id}`, caption: "", provenance: origin, status, revision: 1,
    storagePath: `media-staged/sha256-${digest(seed)}.webp`, mimeType: "image/webp", digest: digest(seed), createdAt: now, updatedAt: now,
  } };
}
const legacy = (namespace: string, id: string, body: object) => ({ kind: "legacy", namespace, id, body });
const draft = (title: string, extra: object = {}) => ({ title, body: `Texto de ${title}.`, ...extra });
const record = (kind: string, id: string, namespace?: string) => ok("record", { kind, id, namespace });
const save = (input: object, options: object = {}) => ok("save", input, options);

describe("drafts and publication", () => {
  test("creates a draft, then publishes it with its lead Media granted, activated and receipted", async () => {
    await ok("import", [media("lead", "a")]);
    const created = await save(draft("Praia", { leadMediaId: "lead" }));
    expect(created.post).toMatchObject({ id: "new-post", status: "draft", revision: 1, createdBy: "editor", mediaIds: ["lead"] });
    expect(created.synchronization).toBe("confirmed");
    expect(await ok("grants", "new-post")).toEqual([]);
    expect((await record("media", "lead")).body.status).toBe("staged");

    const published = await save({ ...draft("Praia", { leadMediaId: "lead" }), id: "new-post", expectedRevision: 1, publish: true }, { now: now + 1 });
    expect(published.post).toMatchObject({ status: "published", revision: 2, publishedAt: now + 1, content: { media: [{ id: "lead", digest: digest("a") }] } });
    expect(published.synchronized).toEqual(["new-post"]);
    const grant = { operationId: "blog-new-post", articleId: "new-post", mediaId: "lead", revision: 1, digest: digest("a") };
    expect(await ok("grants", "new-post")).toEqual([grant]);
    expect((await record("media", "lead")).body).toMatchObject({ status: "active", updatedAt: now + 1 });
    expect((await record("publicationReceipt", "blog-new-post")).body).toMatchObject({ articleId: "new-post", status: "completed", grants: [grant], publishedAt: now + 1 });
    expect((await record("article", "new-post")).body).toMatchObject({ blog: true, publicationReceiptId: "blog-new-post", slug: "praia", pendingMediaPurges: [] });
    expect((await record("article", "new-post")).body).not.toHaveProperty("body");
    // The receipt's empty correction list reaches the reader, as in the Firestore store.
    expect(await ok("read", "new-post", { now: now + 1 })).toEqual({ ...published.post, content: { ...published.post.content, corrections: [] } });
    expect(await ok("list", undefined, { now: now + 1 })).toEqual({ items: [{ id: "new-post", title: "Praia", status: "published", publishedAt: now + 1 }] });
    expect((await ok("list")).items[0].scheduled).toBe(true);
  });

  test("keeps the write when synchronization fails", async () => {
    const result = await save(draft("Rascunho"), { synchronization: "throw" });
    expect(result.synchronization).toBe("unconfirmed");
    expect((await record("article", "new-post")).body).toMatchObject({ title: "Rascunho", revision: 1 });
  });

  test("takes a post offline, retires its grants and queues the purge of the last use", async () => {
    await ok("import", [media("lead", "a", "active")]);
    await save({ ...draft("Praia", { leadMediaId: "lead" }), publish: true });
    const offline = await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, { now: now + 1 });
    expect(offline.post).toMatchObject({ status: "draft", revision: 2, publishedAt: now });
    expect(await ok("grants", "new-post")).toEqual([]);
    expect((await record("article", "new-post")).body.pendingMediaPurges).toEqual([`editorial/lead/${digest("a")}`]);
  });
});

describe("refusals", () => {
  test("refuses non-operators, stale revisions and unavailable Media", async () => {
    expect((await call("save", draft("Praia"), { actorId: "visitor" })).message).toMatch(/Acesso restrito/);
    await save(draft("Praia"));
    expect(await call("save", { ...draft("Praia"), id: "new-post", expectedRevision: 0 })).toMatchObject({ error: "BlogError", code: "conflict" });
    expect(await call("save", { ...draft("Praia"), id: "missing", expectedRevision: 0 })).toMatchObject({ error: "BlogError", code: "notFound" });
    expect(await call("save", draft("Outro", { leadMediaId: "absent" }))).toMatchObject({ error: "BlogError", code: "media", details: "leadMediaId" });
  });

  test("requires a valid imported Source Permission for licensed Media", async () => {
    await ok("import", [media("licensed", "b", "staged", licensed)]);
    const input = { ...draft("Licença", { leadMediaId: "licensed" }), publish: true };
    expect(await call("save", input)).toMatchObject({ error: "BlogError", code: "media", message: expect.stringMatching(/permissão/) });
    await ok("import", [legacy("news_source_permissions", "licença", { capability: "mediaUse", validFrom: now - 10, expiresAt: now + 10 })]);
    expect((await save(input)).post.status).toBe("published");
    await ok("import", [legacy("news_source_permission_revocations", "licença", { revokedAt: now + 1 })]);
    expect(await call("save", { ...input, id: "new-post", expectedRevision: 1 }, { now: now + 2 })).toMatchObject({ error: "BlogError", code: "media" });
  });
});

describe("concurrency", () => {
  test("a save that lost the race re-decides and reports the revision conflict", async () => {
    await save(draft("Praia"));
    const gate = barrier("first");
    const paused = call("save", { ...draft("Primeira"), id: "new-post", expectedRevision: 1 }, { barrier: "first" });
    await gate.ready;
    await save({ ...draft("Segunda"), id: "new-post", expectedRevision: 1 });
    gate.release();
    expect(await paused).toMatchObject({ error: "BlogError", code: "conflict" });
    expect((await ok("read", "new-post")).content.title).toBe("Segunda");
  });

  test("taking offline races a publication of the same revision", async () => {
    await save({ ...draft("Praia"), publish: true });
    const gate = barrier("offline");
    const paused = call("takeOffline", { id: "new-post", expectedRevision: 1 }, { barrier: "offline" });
    await gate.ready;
    await save({ ...draft("Atualizada"), id: "new-post", expectedRevision: 1 });
    gate.release();
    expect(await paused).toMatchObject({ error: "BlogError", code: "conflict" });
    expect(await ok("read", "new-post")).toMatchObject({ status: "published", revision: 2 });
  });

  test("two posts publishing the same staged Media both keep their grants", async () => {
    await ok("import", [media("shared", "c"), { kind: "article", id: "other", body: { blog: true, status: "draft", revision: 1, title: "Outra", body: "Texto.", slug: "outra", createdAt: now, updatedAt: now, mediaIds: [] } }]);
    const gate = barrier("shared");
    const paused = call("save", { ...draft("Outra", { leadMediaId: "shared" }), id: "other", expectedRevision: 1, publish: true }, { barrier: "shared" });
    await gate.ready;
    await save({ ...draft("Nova", { leadMediaId: "shared" }), publish: true }, { now: now + 1 });
    gate.release();
    expect((await paused).value.post).toMatchObject({ id: "other", status: "published", revision: 2 });
    expect(await ok("grants", "other")).toHaveLength(1);
    expect(await ok("grants", "new-post")).toHaveLength(1);
    expect((await record("media", "shared")).body).toMatchObject({ status: "active", updatedAt: now + 1 });
  });
});

describe("legacy articles", () => {
  test("reads attribution from imported Redação records and the editor's public name", async () => {
    await ok("import", [
      { kind: "article", id: "antigo", body: { status: "published", title: "Antigo", body: "Texto.", slug: "antigo", createdAt: now - 10, updatedAt: now - 5, publishedAt: now - 5, storyId: "story", publishedBy: "author", mediaIds: [], corrections: [{ summary: "Ajuste", correctedAt: now - 1 }] } },
      legacy("news_stories", "story", { captureIds: ["c1", "c2", "missing"] }),
      legacy("news_captures", "c1", { sourceId: "s1", sourceUrl: "https://captura.test" }),
      legacy("news_captures", "c2", { sourceUrl: "https://sem-fonte.test" }),
      legacy("news_sources", "s1", { name: "Prefeitura", canonicalUrl: "https://prefeitura.test" }),
    ]);
    expect(await ok("read", "antigo", { names: { author: "Ana Lima" } })).toMatchObject({
      id: "antigo", status: "published", revision: 0, createdBy: "author",
      content: {
        path: "/noticia/antigo/antigo", editorName: "Ana Lima", legacyHeaderMediaIds: [],
        sources: [{ name: "Prefeitura", url: "https://prefeitura.test" }, { name: "Referência", url: "https://sem-fonte.test" }],
        corrections: [{ summary: "Ajuste", createdAt: now - 1 }],
      },
    });
    const edited = await save({ title: "Antigo revisto", body: "Texto.", id: "antigo", expectedRevision: 0 }, { now: now + 1, names: { author: "Ana Lima" } });
    expect(edited.post).toMatchObject({ status: "published", revision: 1, publishedAt: now - 5, content: { editorName: "Ana Lima" } });
    expect((await record("article", "antigo")).body).toMatchObject({ storyId: "story", publishedBy: "author", publicationReceiptId: "blog-antigo" });
    expect((await record("article", "antigo")).body).not.toHaveProperty("body");
  });

  test("lists twenty posts per page, newest first, skipping non-Blog articles", async () => {
    const articles = Array.from({ length: 22 }, (_, index) => ({ kind: "article", id: `post-${String(index).padStart(2, "0")}`, body: { blog: true, status: "draft", title: `Post ${index}`, body: "Texto.", createdAt: now + index, updatedAt: now + index } }));
    await ok("import", [...articles, { kind: "article", id: "pauta", body: { status: "draft", title: "Pauta", body: "Texto.", createdAt: now + 30, updatedAt: now + 30 } }]);
    const first = await ok("list");
    expect(first.items).toHaveLength(19);
    expect(first.items[0].id).toBe("post-21");
    const second = await ok("list", first.nextCursor);
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(["post-02", "post-01", "post-00"]);
    expect(second.nextCursor).toBeUndefined();
  });
});
