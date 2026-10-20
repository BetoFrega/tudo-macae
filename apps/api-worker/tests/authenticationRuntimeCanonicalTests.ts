import { expect, test } from "vitest";
import z from "zod";
import { createClassifiedsClient } from "@tudomacae/classifieds-client/client";
import { canonicalLookupFreshHeader } from "@tudomacae/classifieds-client/canonical";
import { createClassifiedsPersistence } from "../classifieds";
import { start, authenticationDatabase, classifiedsDatabase } from "./authenticationRuntimeHarness";

type Worker = Awaited<ReturnType<typeof start>>;
const origin = "http://authentication.test";
const createdAt = 1_800_000_000_000;
const contacts = [{ number: "(22) 99999-9999", isWhatsapp: true }];
const records = [
  { kind: "category", id: "category", body: { name: "Veículos", slug: "veiculos", order: 1, isActive: true } },
  { kind: "subcategory", id: "subcategory", namespace: "category", body: { name: "Motos", slug: "motos", order: 1, isActive: true, categoryId: "category" } },
  { kind: "profile", id: "business", body: { title: "Café com Arte", description: "", userId: "owner", contacts, activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }], createdAt } },
  { kind: "ad", id: "ad", body: { userId: "owner", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "business", title: "Bicicleta", text: "Texto", slug: "bicicleta", status: "active", createdAt, images: [] } },
  { kind: "ad", id: "paused", body: { userId: "owner", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "business", title: "Pausado", text: "Texto", slug: "pausado", status: "paused", createdAt, images: [] } },
  { kind: "ad", id: "draft", body: { userId: "owner", categoryId: "category", subcategoryId: "subcategory", title: "Rascunho", text: "Texto", slug: "rascunho", status: "active", publicationState: "pending", createdAt, images: [] } },
  { kind: "ad", id: "removing", body: { userId: "owner", categoryId: "category", subcategoryId: "subcategory", title: "Removendo", text: "Texto", slug: "removendo", status: "active", deleting: true, createdAt, images: [] } },
];

async function put(...values: { kind: string; id: string; namespace?: string; body: object }[]) {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  await store.transact(null, async (tx) => {
    for (const value of values) await tx.read(value.kind as never, value.id, value.namespace);
    for (const value of values) tx.put(value as never);
    return null;
  });
}

async function administrator(worker: Worker) {
  const created = await worker.dispatchFetch(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email: "canonical@example.com", password: "abc123" }) });
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json()).user.id;
  const cookie = created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!.slice("session=".length);
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify({ admin: true }), uid).run();
  const client = createClassifiedsClient({ origin, publicOrigin: origin, allowLocal: true, request: async (input, init) => {
    const result = await worker.dispatchFetch(String(input), { method: init?.method, headers: Object.fromEntries(new Headers(init?.headers).entries()), ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    return new Response(await result.text(), { status: result.status, headers: Object.fromEntries(result.headers.entries()) });
  } });
  return { client, credential: { session: decodeURIComponent(cookie) } };
}

async function lookup(worker: Worker, path: string, headers: Record<string, string> = {}) {
  const response = await worker.dispatchFetch(`${origin}/api/classifieds/canonical/${path}`, { headers });
  return { status: response.status, cacheControl: response.headers.get("cache-control"), protocol: response.headers.get("x-classifieds-protocol"),
    body: response.status === 200 ? await response.json() : await response.text() };
}

test("canonical lookups answer existence and slug as the public reads see them, publicly cacheable", async () => {
  const worker = await start(true, true);
  await put(...records);
  const client = createClassifiedsClient({ origin, publicOrigin: origin, allowLocal: true, request: async (input, init) => {
    const result = await worker.dispatchFetch(String(input), { method: init?.method, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return new Response(await result.text(), { status: result.status, headers: Object.fromEntries(result.headers.entries()) });
  } });
  const answers = {
    "ads/ad": { exists: true, slug: "bicicleta" },
    "ads/paused": { exists: true, slug: "pausado" },
    "ads/draft": { exists: false },
    "ads/removing": { exists: false },
    "ads/missing": { exists: false },
    "categories/category": { exists: true, slug: "veiculos" },
    "categories/missing": { exists: false },
    "categories/category/subcategories/subcategory": { exists: true, categorySlug: "veiculos", slug: "motos" },
    "categories/category/subcategories/missing": { exists: false },
    "categories/missing/subcategories/subcategory": { exists: false },
    "profiles/business": { exists: true, businessTitle: "Café com Arte" },
    "profiles/missing": { exists: false },
  };
  for (const [path, expected] of Object.entries(answers)) {
    expect(await lookup(worker, path), path).toEqual({ status: 200, cacheControl: "public, max-age=30", protocol: "1", body: expected });
  }
  // The lookups mirror the anonymous reads the public pages render.
  for (const id of ["ad", "paused", "draft", "removing"]) {
    expect(Boolean(await client.read("ads.read", { id })), id).toBe(answers[`ads/${id}` as keyof typeof answers].exists);
  }
  expect(await client.read("business.read", { id: "business" })).toMatchObject({ title: "Café com Arte" });
  expect(await client.read("profiles.public", { id: "business" })).toMatchObject({ id: "business" });
}, 20_000);

test("a cached answer stands until a fresh lookup replaces it, whatever the HTTP cache directives", async () => {
  const worker = await start(true, true);
  await put(...records);
  expect((await lookup(worker, "ads/ad")).body).toEqual({ exists: true, slug: "bicicleta" });
  await put({ ...records[3]!, body: { ...records[3]!.body, title: "Bicicleta aro 29", slug: "bicicleta-aro-29" } });
  expect((await lookup(worker, "ads/ad")).body).toEqual({ exists: true, slug: "bicicleta" });
  expect((await lookup(worker, "ads/ad", { "cache-control": "no-cache", "pragma": "no-cache" })).body).toEqual({ exists: true, slug: "bicicleta" });
  expect((await lookup(worker, "ads/ad", { [canonicalLookupFreshHeader]: "1" })).body).toEqual({ exists: true, slug: "bicicleta-aro-29" });
  expect((await lookup(worker, "ads/ad")).body).toEqual({ exists: true, slug: "bicicleta-aro-29" });
}, 20_000);

test("canonical lookups refuse other methods and shapes and fail uncached without the authority or D1", async () => {
  const closed = await start(true, false);
  expect(await lookup(closed, "ads/ad")).toMatchObject({ status: 503, cacheControl: "private, no-store" });
  const worker = await start(true, true);
  for (const path of ["ads", "ads/a/b", "unknown/a", "categories/a/b/c", "ads/%E0%A4%A"]) {
    expect(await lookup(worker, path), path).toMatchObject({ status: 404, cacheControl: "private, no-store" });
  }
  const post = await worker.dispatchFetch(`${origin}/api/classifieds/canonical/ads/ad`, { method: "POST", headers: { origin } });
  expect(post.status).toBe(405);
  expect(await lookup(worker, "ads/unseen", { "x-fixture-classifieds-unavailable": "true" })).toMatchObject({ status: 503, cacheControl: "private, no-store" });
}, 20_000);

test("removing an ad, a profile or a profile's identity drops their stored answers, so the proxy answers 404 at once", async () => {
  const worker = await start(true, true);
  await put(...records);
  const { client, credential } = await administrator(worker);
  for (const path of ["ads/ad", "ads/paused", "profiles/business"]) expect((await lookup(worker, path)).body, path).toMatchObject({ exists: true });
  await put({ kind: "profile", id: "claimable", body: { title: "Reivindicável", claimable: true, source: { url: "https://example.com/fonte", checkedAt: createdAt }, contacts, activityAreas: [], createdAt } });
  expect((await lookup(worker, "profiles/claimable")).body).toMatchObject({ exists: true });
  await client.write("profiles.admin.delete", { id: "claimable", expectedRevision: 1, idempotencyKey: "claimable" }, credential);
  expect((await lookup(worker, "profiles/claimable")).body).toEqual({ exists: false });
  await client.write("ads.delete", { id: "paused" }, credential);
  expect((await lookup(worker, "ads/paused")).body).toEqual({ exists: false });
  const preview = z.object({ title: z.string(), confirmationToken: z.string() }).parse(await client.read("profiles.identity.preview", { id: "business" }, credential));
  await client.write("profiles.identity.delete", { id: " business ", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "canonical" }, credential);
  for (const path of ["ads/ad", "profiles/business"]) expect((await lookup(worker, path)).body, path).toEqual({ exists: false });
}, 20_000);
