import { expect, test } from "vitest";
import { createClassifiedsPhotoClient } from "../photos";
import { PhotoError, photoByteLimit, photoDeliveryByteLimit } from "@tudomacae/classifieds-photos";

test("photo client preserves the binary body, session and stable upload intent without legacy retry", async () => {
  let calls = 0;
  const operationId = crypto.randomUUID();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const client = createClassifiedsPhotoClient({ origin: "https://api.test", publicOrigin: "https://www.test", request: async (_url, init) => {
    calls++;
    const headers = new Headers(init!.headers);
    expect(headers.get("cookie")).toBe("session=session");
    expect(JSON.parse(decodeURIComponent(headers.get("x-classifieds-photo")!))).toMatchObject({ operationId, expectedRevision: 1 });
    expect(init!.body).toEqual(bytes);
    return Response.json({ error: "conflict", message: "Releia o perfil." }, { status: 409, headers: { "x-classifieds-protocol": "1" } });
  } });
  await expect(client.upload({ ownerKind: "profile", ownerId: "profile", operationId, expectedRevision: 1, mimeType: "image/png", bytes }, { session: "session" })).rejects.toBeInstanceOf(PhotoError);
  expect(calls).toBe(1);
});

test("photo reads retain the pending route, accept a variant above the upload limit and reject an oversized response", async () => {
  let size = photoByteLimit + 1;
  const client = createClassifiedsPhotoClient({ origin: "https://api.test", publicOrigin: "https://www.test", request: async (url) => {
    expect(String(url)).toContain("/api/publicacoes-pendentes/ad/fotos/photo");
    return new Response(new Uint8Array(size), { headers: { "content-type": "image/png", "x-classifieds-protocol": "1" } });
  } });
  expect((await client.readAd("ad", "photo", true, { session: "session" }))?.bytes.byteLength).toBe(size);
  size = photoDeliveryByteLimit + 1;
  await expect(client.readAd("ad", "photo", true, { session: "session" })).rejects.toMatchObject({ code: "incompatible" });
});

test("upload throttling preserves the wait time without retrying or replacing the intent", async () => {
  let calls = 0;
  const client = createClassifiedsPhotoClient({ origin: "https://api.test", publicOrigin: "https://www.test", request: async () => {
    calls++;
    return Response.json({ error: "rate_limit", reason: "account_burst", retryAfterMs: 120_000 }, { status: 429, headers: { "x-classifieds-protocol": "1", "retry-after": "120" } });
  } });
  await expect(client.upload({ ownerKind: "profile", ownerId: "profile", operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) }, { session: "session" })).rejects.toMatchObject({ code: "rate_limit", reason: "account_burst", retryAfterMs: 120_000, message: expect.stringContaining("2 minuto") });
  expect(calls).toBe(1);
});

test.each([false, true])("photo transport preserves server reporting ownership (%s)", async (reported) => {
  const correlationId = crypto.randomUUID();
  let requestId = "";
  const client = createClassifiedsPhotoClient({ origin: "https://api.test", publicOrigin: "https://www.test", request: async (_url, init) => {
    requestId = new Headers(init?.headers).get("x-request-id")!;
    return Response.json({ error: "unavailable" }, {
      status: 503, headers: { "x-classifieds-protocol": "1", ...(reported ? { "x-classifieds-error-reported": "1" } : {}) },
    });
  } });
  await expect(client.readAd("ad", "photo", false, {}, correlationId)).rejects.toMatchObject({ code: "unavailable", requestId: correlationId, serverReportedFailure: reported });
  expect(requestId).toBe(correlationId);
});

test("photo reads forward the browser Accept header through both application aliases", async () => {
  const calls: string[] = [];
  const client = createClassifiedsPhotoClient({ origin: "https://api.test", publicOrigin: "https://www.test", request: async (_url, init) => {
    calls.push(new Headers(init?.headers).get("accept")!);
    return new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg", "x-classifieds-protocol": "1" } });
  } });
  expect(await client.readAd("ad", "photo", false, {}, crypto.randomUUID(), 128, "image/jpeg")).toMatchObject({ mimeType: "image/jpeg" });
  expect(await client.readPublic("profile-photos/profile/photo.jpg", 128, crypto.randomUUID(), "image/jpeg")).toMatchObject({ mimeType: "image/jpeg" });
  expect(calls).toEqual(["image/jpeg", "image/jpeg"]);
});
