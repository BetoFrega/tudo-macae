import { expect, test } from "vitest";
import { now, ok, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime("tests/editorialBlogFixtureWorker.ts");

const digest = "a".repeat(64);
const key = `editorial/lead/${digest}`;
const lead = { kind: "media", id: "lead", body: {
  kind: "article-image", alt: "Foto", caption: "", status: "staged", revision: 1,
  provenance: { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: now },
  storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp", digest, createdAt: now, updatedAt: now,
} };
const post = { title: "Praia", body: "Texto de Praia.", leadMediaId: "lead" };
const purge = (cleanup: "purge" | "purgeFailure" | "purgeStalled", at = now) => ({ synchronization: "distribute", cleanup, now: at });
const pending = async () => (await ok("record", { kind: "article", id: "new-post" })).body.pendingMediaPurges;

test("taking the last post of a Media offline purges its image and clears the intent", async () => {
  await ok("import", [lead]);
  const published = await ok("save", { ...post, publish: true }, purge("purge"));
  expect(published).toMatchObject({ synchronization: "confirmed", purged: [] });

  const offline = await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, purge("purge", now + 1));
  expect(offline).toMatchObject({ synchronization: "confirmed", purged: [[key]] });
  expect(await pending()).toEqual([]);
});

test("a failed purge keeps the intent, and a later save repeats it", async () => {
  await ok("import", [lead]);
  await ok("save", { ...post, publish: true }, purge("purge"));
  const offline = await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, purge("purgeFailure", now + 1));
  expect(offline).toMatchObject({ synchronization: "unconfirmed", purged: [[key]] });
  expect(await pending()).toEqual([key]);

  const edited = await ok("save", { ...post, title: "Praia nova", id: "new-post", expectedRevision: 2 }, purge("purge", now + 2));
  expect(edited).toMatchObject({ synchronization: "confirmed", purged: [[key]] });
  expect(await pending()).toEqual([]);
});

test("an image published again is not purged, and its pending intent clears", async () => {
  await ok("import", [lead]);
  await ok("save", { ...post, publish: true }, purge("purge"));
  await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, purge("purgeFailure", now + 1));

  const republished = await ok("save", { ...post, id: "new-post", expectedRevision: 2, publish: true }, purge("purge", now + 2));
  expect(republished).toMatchObject({ synchronization: "confirmed", purged: [] });
  expect(await pending()).toEqual([]);
});

test("a purge past the cleanup budget answers unconfirmed and keeps the intent", async () => {
  await ok("import", [lead]);
  await ok("save", { ...post, publish: true }, purge("purge"));
  const offline = await ok("takeOffline", { id: "new-post", expectedRevision: 1 }, purge("purgeStalled", now + 1));
  expect(offline).toMatchObject({ synchronization: "unconfirmed", purged: [[key]] });
  expect(await pending()).toEqual([key]);
});
