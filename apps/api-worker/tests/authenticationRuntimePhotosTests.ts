import { expect, test, vi } from "vitest";
import z from "zod";
import { createClassifiedsPersistence } from "../classifieds";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { start, disposeRuntime, classifiedsDatabase } from "./authenticationRuntimeHarness";

test("qualified photo HTTP binds uploads to the session, preserves private/public routes and rejects controls or D1 failure", async () => {
  const worker = await start(true, true);
  const created = await worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", "origin": "http://authentication.test" }, body: JSON.stringify({ email: "photos@example.com", password: "abc123" }) });
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json()).user.id;
  const cookie = created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!;
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  await store.transact(null, async (tx) => {
    await tx.read("ad", "photo-ad");
    tx.put({ kind: "ad", id: "photo-ad", body: { userId: uid, status: "active", publicationState: "pending", createdAt: 1_800_000_000_000, images: [] } });
    return null;
  });
  const metadata = { ownerKind: "ad", ownerId: "photo-ad", operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png" };
  const bytes = await sharp({ create: { width: 512, height: 256, channels: 3, background: "red" } }).png().toBuffer();
  const send = (headers: object = {}) => worker.dispatchFetch("http://authentication.test/api/classifieds/photos/upload", { method: "POST", headers: { "origin": "http://authentication.test", cookie, "x-classifieds-photo": encodeURIComponent(JSON.stringify(metadata)), ...headers }, body: bytes });
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const requestId = crypto.randomUUID();
  const invalidPixels = await worker.dispatchFetch("http://authentication.test/api/classifieds/photos/upload", { method: "POST", headers: { "origin": "http://authentication.test", cookie, "x-request-id": requestId, "x-classifieds-photo": encodeURIComponent(JSON.stringify(metadata)) }, body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) });
  expect(invalidPixels.status).toBe(400);
  expect(messages.filter(message => message.includes("classifieds.request.unavailable"))).toHaveLength(0);
  metadata.operationId = crypto.randomUUID();
  // Upload cleanup swallows deletion failures; retirement reports them.
  for (const phase of ["upload", "verification"]) {
    messages.length = 0;
    const hostedUnavailable = await send({ "x-fixture-hosted-failure": phase, "x-request-id": requestId });
    expect(hostedUnavailable.status).toBe(503);
    const hostedEvents = messages.filter(message => message.includes("classifieds.request.unavailable"));
    expect(hostedEvents).toHaveLength(1);
    expect(hostedEvents[0]).toContain(`"causeCode":"hosted_photo_${phase}"`);
    expect(hostedEvents[0]).toContain(metadata.operationId);
    expect(hostedEvents[0]).toContain(requestId);
    expect(hostedEvents[0]).not.toContain(uid);
    expect(hostedEvents[0]).not.toContain("uploadURL");
    expect(await hostedUnavailable.text()).not.toContain(metadata.operationId);
  }
  messages.length = 0;
  expect((await send({ "x-fixture-hosted-failure": "busy" })).status).toBe(409);
  expect(messages.filter(message => message.includes("classifieds.request.unavailable"))).toHaveLength(0);
  expect((await send({ origin: "https://untrusted.test" })).status).toBe(403);
  expect((await send({ cookie: "" })).status).toBe(401);
  const uploaded = await send();
  expect(uploaded.status).toBe(200);
  const record = z.object({ path: z.string(), id: z.string() }).parse(await uploaded.json());
  const publicPath = `http://authentication.test/api/anuncios/photo-ad/fotos/${record.id}`;
  const privatePath = `http://authentication.test/api/publicacoes-pendentes/photo-ad/fotos/${record.id}`;
  expect((await worker.dispatchFetch(publicPath)).status).toBe(404);
  expect((await worker.dispatchFetch(privatePath)).status).toBe(404);
  expect((await worker.dispatchFetch(privatePath, { headers: { cookie } })).status).toBe(200);
  expect((await worker.dispatchFetch(`${privatePath}?w=1`, { headers: { cookie } })).status).toBe(400);
  const privateVariant = await worker.dispatchFetch(`${privatePath}?w=128`, { headers: { cookie, accept: "image/webp" } });
  expect(privateVariant.headers.get("content-type")).toBe("image/webp");
  expect(await sharp(Buffer.from(await privateVariant.arrayBuffer())).metadata()).toMatchObject({ width: 128, height: 64, format: "webp" });
  const gif = await sharp(bytes).gif().toBuffer();
  const gifResponse = await worker.dispatchFetch("http://authentication.test/api/classifieds/photos/upload", { method: "POST", headers: { "origin": "http://authentication.test", cookie, "x-classifieds-photo": encodeURIComponent(JSON.stringify({ ...metadata, operationId: crypto.randomUUID(), expectedRevision: 3, mimeType: "image/gif" })) }, body: gif });
  expect(gifResponse.status).toBe(200);
  const gifRecord = z.object({ id: z.string() }).parse(await gifResponse.json());
  await store.transact(null, async (tx) => {
    const ad = (await tx.read("ad", "photo-ad"))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "published" } });
    return null;
  });
  expect((await worker.dispatchFetch(publicPath, { method: "HEAD" })).status).toBe(200);
  expect((await worker.dispatchFetch(`${publicPath}?w=1`)).status).toBe(400);
  const variant = await worker.dispatchFetch(`${publicPath}?w=128`, { headers: { accept: "image/webp" } });
  expect(await sharp(Buffer.from(await variant.arrayBuffer())).metadata()).toMatchObject({ width: 128, height: 64, format: "webp" });
  expect((await worker.dispatchFetch(`${publicPath}?w=128`, { method: "HEAD", headers: { accept: "image/webp" } })).headers.get("content-type")).toBe("image/webp");
  const large = await worker.dispatchFetch(`${publicPath}?w=3840`);
  expect(await sharp(Buffer.from(await large.arrayBuffer())).metadata()).toMatchObject({ width: 512, height: 256 });
  // Hosted stores GIF uploads as static JPEG originals and delivers variants like any photo.
  const gifVariant = await worker.dispatchFetch(`http://authentication.test/api/anuncios/photo-ad/fotos/${gifRecord.id}?w=128`, { headers: { accept: "image/webp" } });
  expect(gifVariant.headers.get("content-type")).toBe("image/webp");
  expect(await sharp(Buffer.from(await gifVariant.arrayBuffer())).metadata()).toMatchObject({ width: 128, height: 64, format: "webp" });
  expect((await worker.dispatchFetch(publicPath, { headers: { "x-fixture-classifieds-unavailable": "true" } })).status).toBe(503);
  const remove = () => worker.dispatchFetch("http://authentication.test/api/classifieds/photos/remove", { method: "POST", headers: { origin: "http://authentication.test", cookie }, body: JSON.stringify({ path: record.path }) });
  await store.transact(null, async (tx) => {
    const ad = (await tx.read("ad", "photo-ad"))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "publishing" } });
    return null;
  });
  expect((await send()).status).toBe(409);
  expect((await remove()).status).toBe(409);
  await store.transact(null, async (tx) => {
    const ad = (await tx.read("ad", "photo-ad"))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "published" } });
    return null;
  });
  expect((await send()).status).toBe(200);
  expect((await worker.dispatchFetch(publicPath)).status).toBe(200);
  expect((await remove()).status).toBe(200);
  expect((await worker.dispatchFetch(publicPath)).status).toBe(404);
  expect((await store.read("ad", "photo-ad"))?.body.publicationState).toBe("published");
  expect((await worker.dispatchFetch(`http://authentication.test/api/classifieds/photos/public/${encodeURIComponent(record.path)}`)).status).toBe(410);
  await store.transact(null, async (tx) => {
    await tx.read("ad", "throttled-ad");
    tx.put({ kind: "ad", id: "throttled-ad", body: { userId: uid, status: "active", publicationState: "pending", createdAt: Date.now(), images: [] } });
    await tx.read("retirement", `account:${uid}`, "classifieds_photo_admission");
    tx.put({ kind: "retirement", id: `account:${uid}`, namespace: "classifieds_photo_admission", body: { uploads: Array.from({ length: 20 }, () => Date.now()) } });
    return null;
  });
  messages.length = 0;
  const throttled = await worker.dispatchFetch("http://authentication.test/api/classifieds/photos/upload", { method: "POST", headers: { "origin": "http://authentication.test", cookie, "x-classifieds-photo": encodeURIComponent(JSON.stringify({ ...metadata, ownerId: "throttled-ad", operationId: crypto.randomUUID(), expectedRevision: 1 })) }, body: bytes });
  expect(throttled.status).toBe(429);
  expect(Number(throttled.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(await throttled.json()).toMatchObject({ error: "rate_limit", reason: "account_burst", retryAfterMs: expect.any(Number) });
  expect(messages.filter(message => message.includes("classifieds.request.unavailable"))).toHaveLength(0);
  expect((await store.read("ad", "throttled-ad"))?.body.images).toEqual([]);
  expect((await worker.dispatchFetch(`http://authentication.test/api/anuncios/photo-ad/fotos/${gifRecord.id}`)).status).toBe(200);
});

test("photo qualification off exposes no R2 route", async () => {
  const worker = await start(true, false);
  const response = await worker.dispatchFetch("http://authentication.test/api/classifieds/photos/public/profile-photos%2Fprofile%2Fphoto.png");
  expect(response.status).toBe(404);
  await disposeRuntime();
});

test("qualified legacy photo routes preserve historical image IDs and raw Unicode owner paths", async () => {
  const worker = await start(true, true);
  const created = await worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", "origin": "http://authentication.test" }, body: JSON.stringify({ email: "legacy-photos@example.com", password: "abc123" }) });
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json()).user.id;
  const cookie = created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!;
  const database = await classifiedsDatabase();
  const store = createClassifiedsPersistence({ database });
  const ownerId = "negócio 1";
  const path = `ad-images/${ownerId}/old.png`;
  await store.transact(null, async (tx) => {
    await tx.read("ad", ownerId);
    tx.put({ kind: "ad", id: ownerId, body: { userId: uid, status: "active", publicationState: "pending", createdAt: 1_800_000_000_000, images: [{ id: "image", path, order: 0, pending: false }] } });
    return null;
  });
  const bytes = await sharp({ create: { width: 128, height: 64, channels: 3, background: "white" } }).png().toBuffer();
  const imported = await worker.dispatchFetch("http://authentication.test/__fixture/photos/import", { method: "POST", body: JSON.stringify({ item: { path, id: "image", ownerKind: "ad", ownerId, operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png", size: bytes.length, digest: createHash("sha256").update(bytes).digest("hex"), sourceGeneration: "legacy-generation", title: "", description: "" }, bytes: [...bytes] }) });
  expect(await imported.json()).toMatchObject({ status: "imported" });
  const privatePath = `http://authentication.test/api/publicacoes-pendentes/${encodeURIComponent(ownerId)}/fotos/image`;
  expect((await worker.dispatchFetch(privatePath)).status).toBe(404);
  expect((await worker.dispatchFetch(privatePath, { headers: { cookie } })).status).toBe(200);
  expect((await worker.dispatchFetch(privatePath, { method: "HEAD", headers: { cookie } })).status).toBe(200);
  await store.transact(null, async (tx) => {
    const ad = (await tx.read("ad", ownerId))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "published" } });
    return null;
  });
  const publicPath = `http://authentication.test/api/anuncios/${encodeURIComponent(ownerId)}/fotos/image`;
  expect((await worker.dispatchFetch(publicPath, { method: "HEAD" })).status).toBe(200);
  const delivered = await worker.dispatchFetch(publicPath);
  expect(delivered.status).toBe(200);
  expect(await sharp(Buffer.from(await delivered.arrayBuffer())).metadata()).toMatchObject({ width: 128, height: 64 });
  expect((await worker.dispatchFetch(`http://authentication.test/api/classifieds/photos/public/${encodeURIComponent(path)}`)).status).toBe(200);
});
