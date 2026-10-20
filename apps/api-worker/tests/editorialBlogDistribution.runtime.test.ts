import { expect, test } from "vitest";
import { now, ok, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime("tests/editorialBlogFixtureWorker.ts");

const distribute = (options: object = {}) => ({ synchronization: "distribute", ...options });
const draft = (title: string, extra: object = {}) => ({ title, body: `Texto de ${title}.`, ...extra });

test("publishing, editing and taking a post offline converge the public index to the D1", async () => {
  const published = await ok("save", { ...draft("Praia"), publish: true }, distribute());
  expect(published.synchronization).toBe("confirmed");
  const summary = { id: "new-post", storyId: "new-post", title: "Praia", slug: "praia", mediaIds: [], publishedAt: now, updatedAt: now };
  expect(await ok("indexed")).toEqual({ "new-post": { updatedAt: now, summary } });

  const edited = await ok("save", { ...draft("Praia reformada"), id: "new-post", expectedRevision: 1 }, distribute({ now: now + 1 }));
  expect(edited.synchronization).toBe("confirmed");
  expect((await ok("indexed"))["new-post"].summary).toMatchObject({ title: "Praia reformada", slug: "praia", updatedAt: now + 1, publishedAt: now });

  const offline = await ok("takeOffline", { id: "new-post", expectedRevision: 2 }, distribute({ now: now + 2 }));
  expect(offline.synchronization).toBe("confirmed");
  expect(await ok("indexed")).toEqual({ "new-post": { updatedAt: now + 2 } });
});

test("a draft retires nothing it never published, and the tombstone keeps it out", async () => {
  expect((await ok("save", draft("Rascunho"), distribute())).synchronization).toBe("confirmed");
  expect(await ok("indexed")).toEqual({ "new-post": { updatedAt: now } });
});

for (const [name, options] of [["an unbound index", { index: "absent" }], ["a failing index", { index: "throw" }], ["an unconfirmed cleanup", { cleanup: "unconfirmed" }]] as const) {
  test(`${name} leaves the save unconfirmed but kept`, async () => {
    const saved = await ok("save", { ...draft("Praia"), publish: true }, distribute(options));
    expect(saved.synchronization).toBe("unconfirmed");
    expect((await ok("record", { kind: "article", id: "new-post" })).body).toMatchObject({ title: "Praia", status: "published", revision: 1 });
  });
}

test("a save under an earlier clock still advances the version the index holds", async () => {
  await ok("save", { ...draft("Nova"), publish: true }, distribute({ now: now + 10 }));
  const later = await ok("save", { ...draft("Mais nova"), id: "new-post", expectedRevision: 1 }, distribute({ now: now + 5 }));
  expect(later.synchronization).toBe("confirmed");
  expect((await ok("indexed"))["new-post"].summary).toMatchObject({ title: "Mais nova", updatedAt: now + 11 });
});
