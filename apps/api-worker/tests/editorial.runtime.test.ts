import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Miniflare, Response as RuntimeResponse } from "miniflare";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

let directory: string;
let runtime: Miniflare;
const gates = new Map<string, { entered(): void; wait: Promise<void> }>();
const now = 1_800_000_000_000;
const response = z.object({ value: z.any().optional(), error: z.string().optional(), message: z.string().optional(), metrics: z.array(z.object({ operation: z.string(), statements: z.number(), rowsRead: z.number() })) });

async function call(input: object) {
  const result = await runtime.dispatchFetch("http://editorial.test/", { method: "POST", body: JSON.stringify(input) });
  return response.parse(await result.json());
}
async function ok(input: object) {
  const result = await call(input);
  expect(result.error, result.message).toBeUndefined();
  return result.value;
}
function barrier(id: string) {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set(id, { entered, wait });
  return { ready, release };
}
const article = (id: string, body: object = {}) => ({ kind: "article", id, body: { status: "draft", title: id, createdAt: now, mediaIds: [], ...body } });
const media = (id: string, body: object = {}) => ({ kind: "media", id, body: { kind: "article-image", status: "staged", createdAt: now, ...body } });
const grant = (articleId: string, mediaId: string) => ({ kind: "publicationGrant", id: `${articleId}:${mediaId}`, body: { operationId: `blog-${articleId}`, articleId, mediaId, revision: 1, digest: "sha256" } });
const intent = (key: string, input: object = { title: "Post" }) => ({ actorId: "editor", key, operation: "savePost", input });
const save = (...records: object[]) => ok({ action: "transaction", records });
const page = (query: object, version?: number) => ok({ action: "page", query, version });
const ids = (value: { items: { id: string }[] }) => value.items.map(item => item.id);

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "editorial-d1-"));
  execFileSync("pnpm", ["--filter", "@tudomacae/api-worker", "run", "build", "--outdir", directory, "--entry", "tests/editorialFixtureWorker.ts"], { stdio: "pipe" });
});
beforeEach(async () => {
  const bundle = (await readdir(directory)).find(file => file.endsWith(".js"))!;
  runtime = new Miniflare({
    workers: [{ config: {
      name: "editorial-test", compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
      env: { EDITORIAL_DB: { type: "d1", id: "editorial-test" }, GATE: { type: "fetcher", handler: async (request) => {
        const gate = gates.get(new URL(request.url).pathname.slice(1));
        gate?.entered();
        await gate?.wait;
        return new RuntimeResponse(null, { status: 200 });
      } } },
      manifest: { mainModule: bundle, modules: { [bundle]: { type: "esm", contents: await readFile(join(directory, bundle), "utf8") } }, modulesRoot: directory },
    } }],
  });
  await runtime.ready;
  // D1 exec requires each complete statement/trigger on one line.
  const database = await runtime.getD1Database("EDITORIAL_DB");
  for (const file of (await readdir("apps/api-worker/migrations-editorial")).sort()) {
    await database.exec(await readFile(join("apps/api-worker/migrations-editorial", file), "utf8"));
  }
});
afterEach(async () => {
  gates.clear();
  await runtime.dispose();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("records", () => {
  test("stores and reads a record with an opaque write version", async () => {
    await save(article("post", { title: "Primeiro" }));
    const stored = await ok({ action: "read", kind: "article", id: "post" });
    expect(stored).toMatchObject({ kind: "article", id: "post", body: { title: "Primeiro" } });
    expect(stored.version).toMatch(/^[0-9a-f]{32}$/);
    expect(await ok({ action: "read", kind: "article", id: "missing" })).toBeNull();
  });

  test("requires the scope of revisions and legacy records and rejects it elsewhere", async () => {
    expect((await call({ action: "transaction", records: [{ kind: "mediaRevision", id: "1", body: { revision: 1 } }] })).error).toBe("TypeError");
    expect((await call({ action: "transaction", records: [{ ...article("post"), namespace: "x" }] })).error).toBe("TypeError");
    expect((await call({ action: "transaction", records: [{ kind: "legacy", namespace: "News Stories", id: "s", body: {} }] })).error).toBe("ZodError");
    await save({ kind: "legacy", namespace: "news_stories", id: "story", body: { captureIds: ["capture"] } });
    expect(await ok({ action: "read", kind: "legacy", namespace: "news_stories", id: "story" })).toMatchObject({ body: { captureIds: ["capture"] } });
  });

  test("rejects non-epoch timestamps", async () => {
    expect((await call({ action: "transaction", records: [article("post", { publishedAt: "2026-10-13" })] })).error).toBe("ZodError");
  });

  test("removes records", async () => {
    await save(article("post"));
    await ok({ action: "transaction", remove: [{ kind: "article", id: "post" }] });
    expect(await ok({ action: "read", kind: "article", id: "post" })).toBeNull();
  });
});

describe("transactions", () => {
  test("retries a decision whose read absence was invalidated before commit", async () => {
    const gate = barrier("absent");
    const pending = ok({ action: "transaction", reads: [{ kind: "article", id: "post" }], records: [media("media")], barrier: "absent" });
    await gate.ready;
    await save(article("post"));
    gate.release();
    const { value: result } = await pending;
    expect(result.attempts).toBe(2);
    expect(result.read[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  test("retries a decision whose page became stale", async () => {
    await save(article("post"));
    const gate = barrier("grants");
    const pending = ok({ action: "transaction", pages: [{ kind: "publicationGrant", articleId: "post" }], records: [article("post", { title: "Publicado" })], barrier: "grants" });
    await gate.ready;
    await save(grant("post", "media"));
    gate.release();
    const { value: result } = await pending;
    expect(result.attempts).toBe(2);
    expect(result.pages).toEqual([["post:media"]]);
  });

  test("leaves a decision alone when only an unrelated scope changes", async () => {
    await save(article("post"));
    const gate = barrier("unrelated");
    const pending = ok({ action: "transaction", pages: [{ kind: "publicationGrant", articleId: "post" }], records: [article("post", { title: "Publicado" })], barrier: "unrelated" });
    await gate.ready;
    await save(grant("other", "media"));
    gate.release();
    expect((await pending).value.attempts).toBe(1);
  });

  test("detects a concurrent change to a record read in the same decision", async () => {
    await save(article("post"));
    const gate = barrier("edit");
    const pending = ok({ action: "transaction", records: [article("post", { title: "A" })], barrier: "edit" });
    await gate.ready;
    await save(article("post", { title: "B" }));
    gate.release();
    expect((await pending).value.attempts).toBe(2);
    expect(await ok({ action: "read", kind: "article", id: "post" })).toMatchObject({ body: { title: "A" } });
  });

  test("commits nothing when the decision fails", async () => {
    expect((await call({ action: "transaction", records: [article("post")], fail: true })).error).toBe("Error");
    expect(await ok({ action: "read", kind: "article", id: "post" })).toBeNull();
  });

  test("rolls back every write when one statement of the commit fails", async () => {
    const result = await call({ action: "transaction", records: [article("post"), media("media")], intent: intent("broken"), breakCommit: true });
    expect(result.error).toBeDefined();
    expect(await ok({ action: "read", kind: "article", id: "post" })).toBeNull();
    expect(await ok({ action: "read", kind: "media", id: "media" })).toBeNull();
    expect(await ok({ action: "readReceipt", intent: intent("broken") })).toBeNull();
  });

  test("replays the receipt of the same intent and rejects a reused key", async () => {
    const first = await ok({ action: "transaction", records: [article("post")], intent: intent("save-1"), result: { id: "post" } });
    expect(first).toMatchObject({ value: { id: "post" }, replayed: false });
    const replay = await ok({ action: "transaction", records: [article("post", { title: "Outro" })], intent: intent("save-1"), result: { id: "other" } });
    expect(replay).toMatchObject({ value: { id: "post" }, replayed: true });
    expect(await ok({ action: "read", kind: "article", id: "post" })).toMatchObject({ body: { title: "post" } });
    expect((await call({ action: "transaction", records: [], intent: intent("save-1", { title: "Diferente" }) })).error).toBe("IdempotencyConflict");
  });

  test("snapshot returns coherent point reads including absences", async () => {
    await save(article("post"));
    expect(await ok({ action: "snapshot", reads: [{ kind: "article", id: "post" }, { kind: "media", id: "missing" }] }))
      .toEqual([expect.objectContaining({ id: "post" }), null]);
  });

  test("reports aggregate metrics for each batch", async () => {
    const result = await call({ action: "transaction", records: [article("post")] });
    expect(result.metrics.map(item => item.operation)).toEqual(["read", "commit"]);
    expect(result.metrics[1]!.statements).toBe(3);
  });
});

describe("queries", () => {
  test("pages articles by creation, newest first, across cursors", async () => {
    await save(...Array.from({ length: 12 }, (_, index) => article(`a${String(index).padStart(2, "0")}`, { createdAt: now + index })));
    await save(...Array.from({ length: 12 }, (_, index) => article(`b${String(index).padStart(2, "0")}`, { createdAt: now + 100 + index })));
    await save(article("tie-a", { createdAt: now + 50 }), article("tie-b", { createdAt: now + 50 }));
    const seen: string[] = [];
    let next: string | undefined;
    let version: number | undefined;
    do {
      const result = await page({ kind: "article", order: "createdDesc", limit: 10, ...(next ? { after: next } : {}) }, version);
      version ??= result.version;
      seen.push(...ids(result));
      next = result.items.length ? result.next : undefined;
    } while (next);
    expect(seen).toHaveLength(26);
    expect(seen.slice(0, 2)).toEqual(["b11", "b10"]);
    expect(seen.indexOf("tie-b")).toBe(seen.indexOf("tie-a") - 1);
    expect(seen.at(-1)).toBe("a00");
  });

  test("lists only articles published at or before the instant, newest first", async () => {
    await save(
      article("old", { status: "published", publishedAt: now - 2 }),
      article("recent", { status: "published", publishedAt: now - 1 }),
      article("scheduled", { status: "published", publishedAt: now + 1 }),
      article("draft"),
    );
    expect(ids(await page({ kind: "article", status: "published", order: "publishedDesc", publishedAtOrBefore: now }))).toEqual(["recent", "old"]);
  });

  test("finds grants by article and by Media, and articles that reference a Media", async () => {
    await save(article("one", { mediaIds: ["m1", "m2"] }), article("two", { mediaIds: ["m2"] }), grant("one", "m1"), grant("one", "m2"), grant("two", "m2"));
    expect(ids(await page({ kind: "publicationGrant", articleId: "one" }))).toEqual(["one:m1", "one:m2"]);
    expect(ids(await page({ kind: "publicationGrant", mediaId: "m2" }))).toEqual(["one:m2", "two:m2"]);
    expect(ids(await page({ kind: "article", mediaId: "m2" }))).toEqual(["one", "two"]);
    await save(article("one", { mediaIds: ["m1"] }));
    expect(ids(await page({ kind: "article", mediaId: "m2" }))).toEqual(["two"]);
    await ok({ action: "transaction", remove: [{ kind: "article", id: "two" }] });
    expect(ids(await page({ kind: "article", mediaId: "m2" }))).toEqual([]);
  });

  test("invalidates a Media-scoped page when an article starts or stops referencing it", async () => {
    await save(article("one", { mediaIds: [] }));
    const before = await page({ kind: "article", mediaId: "m1" });
    await save(article("one", { mediaIds: ["m1"] }));
    expect((await call({ action: "page", query: { kind: "article", mediaId: "m1" }, version: before.version })).error).toBe("PersistenceConflict");
  });

  test("filters Media by kind and status, newest first", async () => {
    await save(media("staged", { createdAt: now }), media("active", { status: "active", createdAt: now + 1 }), media("other", { kind: "logo", createdAt: now + 2 }));
    expect(ids(await page({ kind: "media", mediaKind: "article-image", order: "createdDesc" }))).toEqual(["active", "staged"]);
    expect(ids(await page({ kind: "media", status: "staged", order: "createdDesc" }))).toEqual(["other", "staged"]);
  });

  test("lists Media revisions in order and pending cleanups by due time", async () => {
    await save(...[3, 1, 2].map(revision => ({ kind: "mediaRevision", namespace: "media", id: String(revision), body: { revision } })));
    expect(ids(await page({ kind: "mediaRevision", namespace: "media", order: "revision" }))).toEqual(["1", "2", "3"]);
    await save(
      { kind: "uploadReservation", id: "late", body: { cleanupPending: true, cleanupAt: now + 10 } },
      { kind: "uploadReservation", id: "due", body: { cleanupPending: true, cleanupAt: now - 10 } },
      { kind: "uploadReservation", id: "done", body: { cleanupPending: false, cleanupAt: now - 20 } },
    );
    expect(ids(await page({ kind: "uploadReservation", order: "cleanupAt", cleanupDueBy: now }))).toEqual(["due"]);
  });

  test("rejects incompatible filters, orders and oversized pages", async () => {
    expect((await call({ action: "page", query: { kind: "media", order: "publishedDesc", publishedAtOrBefore: now } })).error).toBe("TypeError");
    expect((await call({ action: "page", query: { kind: "article", order: "publishedDesc" } })).error).toBe("TypeError");
    expect((await call({ action: "page", query: { kind: "activity", mediaId: "m" } })).error).toBe("TypeError");
    expect((await call({ action: "page", query: { kind: "article", limit: 26 } })).error).toBe("PersistenceLimit");
  });
});

describe("transfer", () => {
  test("imports absent records once with their source version and refuses a divergent copy", async () => {
    const record = { ...article("post", { status: "published", publishedAt: now }), sourceVersion: "2026-10-13T00:00:00.000000Z" };
    expect(await ok({ action: "import", records: [record] })).toEqual(["imported"]);
    expect(await ok({ action: "import", records: [record] })).toEqual(["unchanged"]);
    expect(await ok({ action: "read", kind: "article", id: "post" })).toMatchObject({ sourceVersion: record.sourceVersion });
    expect((await call({ action: "import", records: [{ ...record, body: { ...record.body, title: "Outro" } }] })).error).toBe("PersistenceConflict");
    expect(ids(await page({ kind: "article", status: "published", order: "publishedDesc", publishedAtOrBefore: now }))).toEqual(["post"]);
  });

  test("imports receipts idempotently and replays them", async () => {
    const receipt = { intent: intent("legacy-1"), result: { id: "post" } };
    expect(await ok({ action: "importReceipt", receipt })).toBe("imported");
    expect(await ok({ action: "importReceipt", receipt })).toBe("unchanged");
    expect(await ok({ action: "readReceipt", intent: intent("legacy-1") })).toEqual(receipt);
    expect((await call({ action: "importReceipt", receipt: { ...receipt, result: { id: "other" } } })).error).toBe("IdempotencyConflict");
    expect(await ok({ action: "transaction", records: [], intent: intent("legacy-1"), result: { id: "new" } })).toMatchObject({ value: { id: "post" }, replayed: true });
  });
});

describe("Activity expiry", () => {
  const activity = (id: string, expiresAt?: number) => ({ kind: "activity", id, body: { operation: "media.searchRead", createdAt: now, ...(expiresAt === undefined ? {} : { expiresAt }) } });
  const expire = (at: number) => ok({ action: "expireActivity", now: at });
  test("removes due Activity in bounded batches, including imported records, and keeps the rest", async () => {
    expect(await ok({ action: "import", records: Array.from({ length: 66 }, (_, index) => activity(`imported-${index}`, now - index)) })).toHaveLength(66);
    await save(activity("due", now), activity("future", now + 1), activity("no-deadline"), { ...media("media"), body: { ...media("media").body, expiresAt: now } });
    const before = await page({ kind: "activity" }) as { version: number };
    expect(await expire(now - 1_000)).toBe(0);
    expect(await expire(now)).toBe(64);
    expect([await expire(now), await expire(now)]).toEqual([3, 0]);
    expect((await call({ action: "page", query: { kind: "activity" }, version: before.version })).error).toBe("PersistenceConflict");
    expect(ids(await page({ kind: "activity" })).sort()).toEqual(["future", "no-deadline"]);
    expect(await ok({ action: "read", kind: "media", id: "media" })).not.toBeNull();
    expect((await call({ action: "expireActivity", now: -1 })).error).toBe("TypeError");
  });

  test("reads only due Activity, not every retained record", async () => {
    const rowsRead = async () => (await call({ action: "expireActivity", now })).metrics[0]!.rowsRead;
    const baseline = await rowsRead();
    await ok({ action: "import", records: Array.from({ length: 100 }, (_, index) => activity(`future-${index}`, now + 1)) });
    expect(await rowsRead()).toBe(baseline);
  });
});
