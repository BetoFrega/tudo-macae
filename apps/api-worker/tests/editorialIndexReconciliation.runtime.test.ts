import { expect, test } from "vitest";
import { now, ok, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime("tests/editorialBlogFixtureWorker.ts");

const draft = (title: string, extra: object = {}) => ({ title, body: `Texto de ${title}.`, ...extra });
const summary = (id: string, extra: object = {}) => ({ id, storyId: id, title: id, slug: id, mediaIds: [], publishedAt: now - 5, updatedAt: now - 5, ...extra });

test("publishing and taking a post offline through the Worker leave nothing to reconcile", async () => {
  await ok("save", { ...draft("Praia"), publish: true }, { synchronization: "distribute" });
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
  await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, { synchronization: "distribute", now: now + 1 });
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});

test("a publication the index never confirmed is repaired from the D1, scheduled posts included", async () => {
  // A failing index stands in for any lost distribution; the save itself stays committed.
  await ok("save", { ...draft("Praia"), publish: true }, { synchronization: "distribute", index: "throw" });
  await ok("import", [{ kind: "article", id: "agendado", body: { status: "published", title: "Agendado", body: "Texto.", slug: "agendado", createdAt: now, updatedAt: now, publishedAt: now + 60_000 } }]);
  expect(await ok("reconcile")).toEqual({ found: ["count: canonical=2 index=0", "missing: agendado", "missing: new-post"], remaining: [] });
  expect(Object.keys(await ok("indexed")).sort()).toEqual(["agendado", "new-post"]);
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});

test("an index that drifted from the D1 converges: stale fields, hidden, deleted and unknown articles", async () => {
  await ok("import", [
    { kind: "article", id: "editado", body: { status: "published", title: "Novo título", body: "Texto.", slug: "editado", createdAt: now - 10, updatedAt: now - 5, publishedAt: now - 5 } },
    { kind: "article", id: "rascunho", body: { status: "draft", title: "Rascunho", body: "Texto.", slug: "rascunho", createdAt: now - 10, updatedAt: now - 1 } },
  ]);
  await ok("drift", { id: "editado", summary: summary("editado", { title: "Título antigo", updatedAt: now - 6 }) });
  await ok("drift", { id: "rascunho", summary: summary("rascunho", { updatedAt: now - 9 }) });
  await ok("drift", { id: "apagado", summary: summary("apagado", { updatedAt: now - 7 }) });
  const result = await ok("reconcile");
  expect(result.found).toEqual(expect.arrayContaining(["field: editado.title", "field: editado.updatedAt", "extra: rascunho", "extra: apagado"]));
  expect(result.remaining).toEqual([]);
  // Each retirement carries the newest version either side knows, so the tombstone keeps a delayed publish out.
  expect(await ok("indexed")).toEqual({
    editado: { updatedAt: now - 5, summary: expect.objectContaining({ title: "Novo título" }) },
    rascunho: { updatedAt: now - 1 },
    apagado: { updatedAt: now - 7 },
  });
});

test("an article published after the canonical scan keeps its publication instead of an equal-version tombstone", async () => {
  // A stale extra makes the run repair; the article appears in D1 and the index between the scan and the repair.
  await ok("drift", { id: "apagado", summary: summary("apagado", { updatedAt: now - 7 }) });
  const body = { status: "published", title: "Corrida", body: "Texto.", slug: "corrida", storyId: "corrida", mediaIds: [], createdAt: now - 3, updatedAt: now - 2, publishedAt: now - 2 };
  const result = await ok("reconcile", { publishDuringRepair: { kind: "article", id: "corrida", body } });
  // The second comparison still uses the earlier scan; the next run reads the publication and finds nothing.
  expect(result.remaining).toEqual(["count: canonical=0 index=1", "extra: corrida"]);
  expect(await ok("indexed")).toEqual({
    apagado: { updatedAt: now - 7 },
    corrida: { updatedAt: now - 2, summary: expect.objectContaining({ title: "Corrida" }) },
  });
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});

test("an article withdrawn after the canonical scan is not republished at its scanned version", async () => {
  // Its withdrawal commits in D1 between the scan and the repair while that withdrawal's own synchronization is lost.
  const body = { status: "published", title: "Recolhido", body: "Texto.", slug: "recolhido", storyId: "recolhido", mediaIds: [], createdAt: now - 4, updatedAt: now - 3, publishedAt: now - 3 };
  await ok("import", [{ kind: "article", id: "recolhido", body }]);
  const result = await ok("reconcile", { withdrawDuringRepair: { kind: "article", id: "recolhido", body: { ...body, status: "draft", updatedAt: now - 1 } } });
  expect(result.found).toEqual(["count: canonical=1 index=0", "missing: recolhido"]);
  expect(await ok("indexed")).toEqual({});
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});

test("an article withdrawn while the repair publishes it is retired at the withdrawal's version", async () => {
  const body = { status: "published", title: "Recolhido", body: "Texto.", slug: "recolhido", storyId: "recolhido", mediaIds: [], createdAt: now - 4, updatedAt: now - 3, publishedAt: now - 3 };
  await ok("import", [{ kind: "article", id: "recolhido", body }]);
  await ok("reconcile", { withdrawDuringPublish: { kind: "article", id: "recolhido", body: { ...body, status: "draft", updatedAt: now - 1 } } });
  expect(await ok("indexed")).toEqual({ recolhido: { updatedAt: now - 1 } });
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});

test("an indexed article that became a draft without public fields is retired instead of failing the run", async () => {
  await ok("import", [{ kind: "article", id: "rascunho", body: { status: "draft", title: "Rascunho", body: "Texto.", createdAt: now - 10, updatedAt: now - 1 } }]);
  await ok("drift", { id: "rascunho", summary: summary("rascunho", { updatedAt: now - 9 }) });
  expect((await ok("reconcile")).remaining).toEqual([]);
  expect(await ok("indexed")).toEqual({ rascunho: { updatedAt: now - 1 } });
});

test("an article edited while the repair publishes it ends indexed at the edited version", async () => {
  const body = { status: "published", title: "Antigo", body: "Texto.", slug: "editado", storyId: "editado", mediaIds: [], createdAt: now - 4, updatedAt: now - 3, publishedAt: now - 3 };
  await ok("import", [{ kind: "article", id: "editado", body }]);
  await ok("reconcile", { editDuringPublish: { kind: "article", id: "editado", body: { ...body, title: "Novo", updatedAt: now - 1 } } });
  expect(await ok("indexed")).toEqual({ editado: { updatedAt: now - 1, summary: expect.objectContaining({ title: "Novo" }) } });
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});

test("an article republished while the repair retires it ends indexed at the republished version", async () => {
  const body = { status: "draft", title: "Volta", body: "Texto.", slug: "volta", storyId: "volta", mediaIds: [], createdAt: now - 4, updatedAt: now - 3 };
  await ok("import", [{ kind: "article", id: "volta", body }]);
  await ok("drift", { id: "volta", summary: summary("volta", { updatedAt: now - 5 }) });
  await ok("reconcile", { republishDuringRetire: { kind: "article", id: "volta", body: { ...body, status: "published", updatedAt: now - 1, publishedAt: now - 1 } } });
  expect(await ok("indexed")).toEqual({ volta: { updatedAt: now - 1, summary: expect.objectContaining({ title: "Volta" }) } });
  expect(await ok("reconcile")).toEqual({ found: [], remaining: [] });
});
