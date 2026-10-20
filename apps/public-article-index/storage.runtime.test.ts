import { afterAll, beforeAll, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createArticleIndexTestRuntime, TEST_ARTICLE_INDEX_ORIGIN } from "@tudomacae/article-index-test-runtime";
let runtime: Awaited<ReturnType<typeof createArticleIndexTestRuntime>>;
let bearer: string;
beforeAll(async () => {
  runtime = await createArticleIndexTestRuntime({ build(directory) {
    execFileSync("npm", ["run", "build", "--", "--outdir", directory], {
      cwd: fileURLToPath(new URL(".", import.meta.url)), stdio: "pipe",
      env: { ...process.env, WRANGLER_LOG_PATH: join(directory, "wrangler.log") },
    });
  } });
  bearer = await runtime.identityToken(TEST_ARTICLE_INDEX_ORIGIN);
});
afterAll(async () => {
  await runtime?.dispose();
});
function request(path: string, method = "GET", body?: unknown) {
  return runtime.request(`${TEST_ARTICLE_INDEX_ORIGIN}${path}`, { method,
    headers: { "authorization": `Bearer ${bearer}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const row = { id: "article", storyId: "story", title: "Praça aberta", slug: "praca-aberta", mediaIds: ["media"], publishedAt: 100, updatedAt: 101 };

test("publishes, edits, removes and safely repeats against real D1; stale writes cannot resurrect removed articles", async () => {
  expect((await request("/articles/article", "PUT", row)).status).toBe(200);
  expect((await request("/articles/article", "PUT", row)).status).toBe(200);
  expect(await (await request("/summaries?at=100")).json()).toEqual([row]);
  const edited = { ...row, title: "Praça reformada", slug: "praca-reformada", updatedAt: 102 };
  expect((await request("/articles/article", "PUT", edited)).status).toBe(200);
  expect(await (await request("/summaries?at=100")).json()).toEqual([edited]);
  expect((await request("/articles/article", "DELETE", { updatedAt: 103 })).status).toBe(200);
  expect((await request("/articles/article", "DELETE", { updatedAt: 103 })).status).toBe(200);
  expect((await request("/articles/article", "PUT", row)).status).toBe(409);
  expect(await (await request("/summaries?at=100")).json()).toEqual([]);
});

test("rebuilds an ordered snapshot, includes scheduled summaries, and accepts empty reconstruction", async () => {
  const snapshot = [{ ...row, id: "a" }, { ...row, id: "z" }, { ...row, id: "scheduled", publishedAt: 200 }];
  expect((await request("/snapshot", "POST", snapshot)).status).toBe(200);
  expect((await request("/snapshot", "POST", snapshot)).status).toBe(200);
  expect(await (await request("/summaries?at=100")).json()).toEqual([snapshot[1], snapshot[0]]);
  expect(await (await request("/summaries?at=200")).json()).toEqual([snapshot[2], snapshot[1], snapshot[0]]);
  expect((await request("/snapshot", "POST", [])).status).toBe(200);
  expect(await (await request("/summaries?at=200")).json()).toEqual([]);
});

test("rejects malformed and oversized snapshots without changing the current projection", async () => {
  await request("/snapshot", "POST", [row]);
  for (const invalid of [[{}], [row, row], [{ ...row, extra: "private" }], [{ ...row, updatedAt: 0.1 }]]) expect((await request("/snapshot", "POST", invalid)).status).toBe(400);
  const response = await runtime.request(`${TEST_ARTICLE_INDEX_ORIGIN}/snapshot`, { method: "POST", headers: { authorization: `Bearer ${bearer}` }, body: "x".repeat(1_500_001) });
  expect(response.status).toBe(413);
  expect(await (await request("/summaries?at=100")).json()).toEqual([row]);
});

test("the bound writer entrypoint applies the same versions and tombstones as the HTTP routes", async () => {
  const row = { id: "bound", storyId: "story", title: "Praça", slug: "praca", mediaIds: [], publishedAt: 100, updatedAt: 101 };
  expect(await runtime.rpc("publish", row)).toEqual({ value: "confirmed" });
  expect(await runtime.rpc("publish", row)).toEqual({ value: "confirmed" });
  expect(await runtime.rpc("publish", { ...row, title: "Antigo", updatedAt: 100 })).toEqual({ value: "stale" });
  expect(await (await request("/summaries?at=100")).json()).toContainEqual(row);
  // A bound reconciler reads every summary, scheduled ones included, without the identity the HTTP route requires.
  const scheduled = { ...row, id: "scheduled", publishedAt: 9_000_000_000_000 };
  expect(await runtime.rpc("publish", scheduled)).toEqual({ value: "confirmed" });
  expect((await runtime.rpc("summaries")).value).toEqual(expect.arrayContaining([scheduled, row]));
  expect(await runtime.rpc("retire", "bound", 102, "operation-1")).toEqual({ value: "confirmed" });
  expect(await runtime.rpc("publish", { ...row, updatedAt: 102 })).toEqual({ value: "stale" });
  expect(await (await request("/summaries?at=100")).json()).not.toContainEqual(expect.objectContaining({ id: "bound" }));
  for (const invalid of [[{ ...row, extra: "private" }], [{ ...row, id: "a/b" }], [null]]) expect(await runtime.rpc("publish", ...invalid)).toEqual({ value: "invalid" });
  expect(await runtime.rpc("retire", "bound", -1)).toEqual({ value: "invalid" });
});

test("the bound reader entrypoint returns only summaries published by the requested instant and cannot write", async () => {
  const published = { id: "reader-published", storyId: "story", title: "Praça", slug: "praca", mediaIds: [], publishedAt: 100, updatedAt: 101 };
  const scheduled = { ...published, id: "reader-scheduled", publishedAt: 9_000_000_000_000 };
  await request("/snapshot", "POST", [published, scheduled]);
  expect(await runtime.readerRpc("summaries", 100)).toEqual({ value: [published] });
  expect(await runtime.readerRpc("summaries", Number.MAX_SAFE_INTEGER)).toEqual({ value: [published] });
  expect((await runtime.readerRpc("summaries", "100")).error).toBeDefined();
  expect((await runtime.readerRpc("publish" as "summaries", published)).error).toBeDefined();
});
