import { expect, test, vi } from "vitest";
import z from "zod";
import { createClassifiedsClient } from "@tudomacae/classifieds-client/client";
import { AdvertiserProfileRevisionConflict } from "@tudomacae/advertiser-identity/profiles";
import { createClassifiedsPersistence } from "../classifieds";
import { start, serviceToken, authenticationDatabase, classifiedsDatabase } from "./authenticationRuntimeHarness";

test("public authentication accepts parent correlation only from the verified runtime service", async () => {
  const worker = await start();
  const parent = "8f1e2d3c4b5a6978-GRU";
  const native = "0123456789abcdef-GRU";
  const requestId = "ffffffff-0000-4000-8000-000000000001";
  const tokens = [
    [await serviceToken(), parent],
    [await serviceToken({ audience: "https://other-api.test" }), native],
    [await serviceToken({ email: "other@test.iam.gserviceaccount.com" }), native],
    [await serviceToken({ expiration: "-1s" }), native],
    ["forged", native],
    [undefined, native],
  ] as const;
  for (const [token, root] of tokens) {
    const response = await worker.dispatchFetch("http://authentication.test/api/trpc/session", {
      headers: { "x-correlation-id": parent, "cf-ray": native, "x-request-id": requestId,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { data: { status: "missing" } } });
    expect(response.headers.get("x-correlation-id")).toBe(root);
    expect(response.headers.get("x-request-id")).toBe(requestId);
  }
  for (const cfRay of [undefined, "invalid-ray", requestId]) {
    const response = await worker.dispatchFetch("http://authentication.test/api/trpc/session", {
      headers: { "x-correlation-id": parent, "x-request-id": requestId,
        ...(cfRay ? { "cf-ray": cfRay } : {}),
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu);
    expect(response.headers.get("x-correlation-id")).not.toBe(requestId);
    expect(response.headers.get("x-correlation-id")).not.toBe(parent);
  }
  const direct = await worker.dispatchFetch("http://authentication.test/api/trpc/session", {
    headers: { "cf-ray": native, "x-request-id": requestId },
  });
  expect(direct.status).toBe(200);
  expect(direct.headers.get("x-correlation-id")).toBe(native);
});

test("a call through the web renderer binding is the runtime service without a Google token", async () => {
  const worker = await start();
  const parent = "8f1e2d3c4b5a6978-GRU";
  const response = await worker.dispatchFetch("http://authentication.test/api/trpc/session", {
    headers: { "x-correlation-id": parent, "cf-ray": "0123456789abcdef-GRU", "x-fixture-bound-renderer": "1" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("x-correlation-id")).toBe(parent);
});

test("Classifieds HTTP binds actor and roles to session/service identity and preserves typed conflicts", async () => {
  const worker = await start(true, true);
  const created = await worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", "origin": "http://authentication.test" }, body: JSON.stringify({ email: "classifieds@example.com", password: "abc123" }) });
  expect(created.status).toBe(200);
  const account = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json());
  const uid = account.user.id;
  const cookie = created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!.slice("session=".length);
  const client = createClassifiedsClient({ origin: "http://authentication.test", publicOrigin: "http://authentication.test", allowLocal: true, request: async (input, options) => {
    const result = await worker.dispatchFetch(String(input), { method: options?.method, headers: Object.fromEntries(new Headers(options?.headers).entries()), ...(typeof options?.body === "string" ? { body: options.body } : {}) });
    return new Response(await result.text(), { status: result.status, headers: Object.fromEntries(result.headers.entries()) });
  } });
  const credential = { session: decodeURIComponent(cookie) };
  await expect(client.read("profiles.forOwner", { userId: "another-owner" }, credential)).rejects.toMatchObject({ reason: "forbidden" });
  await expect(client.write("categories.create", { name: "Sem permissão", isActive: true, idempotencyKey: "forged", actorId: "admin" }, credential)).rejects.toMatchObject({ reason: "forbidden" });
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify({ admin: true, unrelated: true }), uid).run();
  const category = await client.write<{ record: { id: string } }>("categories.create", { name: "Categoria", isActive: true, idempotencyKey: "category" }, credential);
  const subcategory = await client.write<{ record: { id: string } }>("subcategories.create", { categoryId: category.record.id, name: "Área", isActive: true, idempotencyKey: "subcategory" }, credential);
  const profileId = await client.write<string>("profiles.create", { userId: "another-owner", title: "Meu perfil", contacts: [], activityAreas: [], operationId: "owned" }, credential);
  expect(await client.read("profiles.owned", { id: profileId }, credential)).toMatchObject({ userId: uid, revision: 1 });
  expect(await client.read("profiles.forOwner", { userId: uid }, credential)).toMatchObject([{ id: profileId }]);
  const publication = { id: "http-draft", title: "Anúncio HTTP", text: "Descrição completa do anúncio publicado via API.", categoryId: category.record.id, subcategoryId: subcategory.record.id, advertiserProfileId: profileId };
  await client.write("publications.save", publication, credential);
  await client.write("publications.profile", { publicationId: publication.id, profileId, title: "Meu perfil", contacts: [{ number: "22999998888", isWhatsapp: true }] }, credential);
  await expect(client.write("publications.publish", { id: publication.id, emailVerified: true }, credential)).rejects.toMatchObject({ requirement: "email" });
  await (await authenticationDatabase()).prepare("UPDATE user SET emailVerified=1 WHERE id=?").bind(uid).run();
  const published = await client.write("publications.publish", { id: publication.id }, credential);
  expect(await client.write("publications.publish", { id: publication.id }, credential)).toEqual(published);
  expect(await client.read("ads.forOwner", { userId: uid }, credential)).toMatchObject([{ id: publication.id, status: "active" }]);
  await client.write("ads.status", { id: publication.id, status: "paused" }, credential);
  await expect(client.write("publications.publish", { id: publication.id }, credential)).rejects.toMatchObject({ code: "conflict" });
  await client.write("ads.status", { id: publication.id, status: "active" }, credential);
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const otherSignup = await worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", "origin": "http://authentication.test" }, body: JSON.stringify({ email: "other-classifieds@example.com", password: "abc123" }) });
  expect(otherSignup.status).toBe(200);
  const otherUid = z.object({ user: z.object({ id: z.string() }) }).parse(await otherSignup.json()).user.id;
  const otherSession = otherSignup.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!.slice("session=".length);
  const otherProfileId = await client.write<string>("profiles.create", { title: "Outro", contacts: [], activityAreas: [], operationId: "other-owned" }, { session: decodeURIComponent(otherSession) });
  expect(await client.read("profiles.forOwner", { userId: otherUid }, credential)).toMatchObject([{ id: otherProfileId }]);
  expect(await client.read("profiles.public", { id: profileId })).not.toHaveProperty("userId");
  await expect(client.write("profiles.update", { id: profileId, title: "Conflito", expectedRevision: 5 }, credential)).rejects.toBeInstanceOf(AdvertiserProfileRevisionConflict);
  await expect(client.write("profiles.update", { id: profileId, title: "Conflito", expectedRevision: 5 }, credential)).rejects.toMatchObject({ currentRevision: 2 });
  expect(await client.write("profiles.update", { id: profileId, title: "Meu perfil", contacts: [], expectedRevision: 2 }, credential)).toBeNull();
  expect(await client.read("profiles.private", { id: profileId }, credential)).toMatchObject({ revision: 3, contacts: [] });
  expect(await client.write("profiles.classify", { id: profileId, identityType: "personal" }, credential)).toBeNull();
  await expect(client.write("profiles.create", { title: "Segundo", contacts: [], activityAreas: [], identityType: "personal", operationId: "second-personal" }, credential)).rejects.toMatchObject({ name: "AdvertiserIdentityTypeConflict", reason: "personal-exists" });
  const machine = { service: { token: await serviceToken(), actorId: uid } };
  await expect(client.read("profiles.identity.preview", { id: otherProfileId, actorId: "admin" }, machine)).rejects.toMatchObject({ reason: "forbidden" });
  await expect(client.read("profiles.identity.preview", { id: otherProfileId, actorId: "admin" }, { session: decodeURIComponent(otherSession) })).rejects.toMatchObject({ reason: "forbidden" });
  await expect(client.read("categories.list", {}, machine)).rejects.toMatchObject({ reason: "forbidden" });
  const catalogWrites = ["offerings.save", "offerings.visibility", "offerings.enablement"] as const;
  for (const [actorId, businessId] of [[uid, profileId], [otherUid, otherProfileId]]) {
    for (const operation of catalogWrites) {
      await expect(client.write(operation, { businessId, expectedRevision: 0, operationId: "denied-catalog", actor: { id: uid, admin: true, editor: true } }, { service: { token: await serviceToken(), actorId } })).rejects.toMatchObject({ reason: "forbidden" });
    }
  }
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify({ admin: true, editor: true }), uid).run();
  expect(await client.read("categories.list", {}, machine)).toMatchObject({ items: [{ id: category.record.id }] });
  const preview = z.object({ title: z.string(), confirmationToken: z.string() }).parse(await client.read("profiles.identity.preview", { id: otherProfileId }, machine));
  const deletion = { id: otherProfileId, confirmationToken: preview.confirmationToken, confirmedTitle: preview.title, reason: "Solicitado", idempotencyKey: "http-delete" };
  expect(await client.write("profiles.identity.delete", deletion, machine)).toMatchObject({ outcome: "deleted", deletedAds: 0 });
  expect(await client.write("profiles.identity.delete", deletion, machine)).toMatchObject({ outcome: "deleted", replayed: true });
  expect(await client.write("profiles.identity.delete", deletion, credential)).toMatchObject({ outcome: "deleted", replayed: true });
  await expect(client.write("profiles.identity.delete", { ...deletion, reason: "Outro motivo" }, machine)).rejects.toMatchObject({ code: "idempotencyConflict" });
  expect(await client.read("profiles.forOwner", { userId: otherUid }, credential)).toEqual([]);
  expect((await worker.dispatchFetch("http://authentication.test/api/trpc/session", { headers: { cookie: `session=${otherSession}` } })).status).toBe(200);
  const edgeRequestId = "1234567890abcdef-GRU";
  await client.write("profiles.admin.create", { title: "Reivindicável", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [{ categoryId: category.record.id, subcategoryId: subcategory.record.id }], sourceUrl: "https://example.com/fonte", idempotencyKey: "edge" }, machine, edgeRequestId);
  expect((await store.page({ kind: "audit" })).items).toEqual(expect.arrayContaining([expect.objectContaining({ body: expect.objectContaining({ correlationId: edgeRequestId }) })]));
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify({ admin: true, editor: false }), uid).run();
  for (const operation of catalogWrites) {
    await expect(client.write(operation, { businessId: profileId, expectedRevision: 0, operationId: "revoked-catalog" }, machine)).rejects.toMatchObject({ reason: "forbidden" });
  }
  await expect(client.write("profiles.update", { id: profileId, title: "Máquina" }, machine)).rejects.toMatchObject({ reason: "forbidden" });
  await expect(client.read("categories.list", {}, { service: { token: "forged", actorId: uid } })).rejects.toMatchObject({ code: "forbidden" });
  // Corrupt receipt precondition cannot be produced by a domain command.
  await (await classifiedsDatabase()).prepare("UPDATE classifieds_receipts SET result='{}' WHERE actor_id=? AND operation_key='category'").bind(uid).run();
  await expect(client.write("categories.create", { name: "Categoria", isActive: true, idempotencyKey: "category" }, credential)).rejects.toMatchObject({ code: "unavailable", serverReportedFailure: true });
  await (await authenticationDatabase()).prepare("UPDATE user SET disabled=1 WHERE id=?").bind(uid).run();
  await expect(client.read("categories.list", {}, machine)).rejects.toMatchObject({ code: "forbidden" });
}, 20_000);

test("an invalid Business catalog cursor keeps its public message across HTTP", async () => {
  const worker = await start(true, true);
  const client = createClassifiedsClient({ origin: "http://authentication.test", publicOrigin: "http://authentication.test", allowLocal: true, request: async (input, options) => {
    const result = await worker.dispatchFetch(String(input), { method: options?.method, headers: Object.fromEntries(new Headers(options?.headers).entries()) });
    return new Response(await result.text(), { status: result.status, headers: Object.fromEntries(result.headers.entries()) });
  } });
  const failure = client.read("business.list", { cursor: "invalid" });
  await expect(failure).rejects.toBeInstanceOf(TypeError);
  await expect(failure).rejects.toThrow("Cursor de Negócios inválido para esta consulta.");
});

test("Classifieds qualification off leaves its procedures unavailable", async () => {
  const worker = await start();
  const result = await worker.dispatchFetch(`http://authentication.test/api/trpc/classifiedsRead?input=${encodeURIComponent(JSON.stringify({ operation: "categories.catalog", input: null }))}`);
  expect(result.status).toBe(404);
});

test.each(["category", "profile"])("malformed persisted %s is a correlated server error, while invalid input remains 400", async (kind) => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start(true, true);
  const database = await classifiedsDatabase();
  // Malformed persisted precondition cannot be produced by a domain command.
  await database.prepare("INSERT INTO classifieds_records(kind,id,body,version) VALUES(?,?,?,?)").bind(kind, "corrupt", JSON.stringify(kind === "category" ? { name: 42, slug: "corrupt", order: 1, isActive: true } : { title: 42, userId: "owner", createdAt: 1 }), "invalid-fixture").run();
  const operation = kind === "category" ? "categories.list" : "profiles.public";
  const requestId = "1234567890abcdef-GRU";
  const read = (input: unknown) => worker.dispatchFetch(`http://authentication.test/api/trpc/classifiedsRead?input=${encodeURIComponent(JSON.stringify({ operation, input }))}`, { headers: { "x-request-id": requestId } });
  const response = await read(kind === "category" ? {} : { id: "corrupt" });
  expect(response.status).toBe(500);
  expect(response.headers.get("x-request-id")).toBe(requestId);
  expect(await response.text()).not.toContain("ValidationError");
  const events = messages.filter(message => message.includes("\"event\":\"classifieds.request.unavailable\""));
  expect(events).toHaveLength(1);
  expect(events[0]).toContain("\"causeCode\":\"persisted_data_invalid\"");
  expect(events[0]).toContain(requestId);
  expect(events[0]).not.toContain("corrupt");
  expect((await read(kind === "category" ? { limit: 0 } : { id: "" })).status).toBe(400);
});

test("malformed stored identity claims remain a correlated server failure", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start(true, true);
  const signup = await worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", "origin": "http://authentication.test" }, body: JSON.stringify({ email: "invalid-claims@example.com", password: "abc123" }) });
  expect(signup.status).toBe(200);
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await signup.json()).user.id;
  const database = await authenticationDatabase();
  // Malformed claims cannot be created through an account operation.
  await database.prepare("UPDATE user SET claims='[]' WHERE id=?").bind(uid).run();
  const requestId = "1234567890abcdef-GRU";
  const headers = { "authorization": `Bearer ${await serviceToken()}`, "x-classifieds-actor": uid, "x-request-id": requestId };
  const read = (input: unknown) => worker.dispatchFetch(`http://authentication.test/api/trpc/classifiedsRead?input=${encodeURIComponent(JSON.stringify({ operation: "categories.list", input }))}`, { headers });
  const result = await read({});
  expect(result.status).toBe(500);
  expect(result.headers.get("x-request-id")).toBe(requestId);
  expect(await result.text()).not.toContain("ValidationError");
  const events = messages.filter(message => message.includes("\"event\":\"classifieds.request.unavailable\""));
  expect(events).toHaveLength(1);
  expect(events[0]).toContain("\"causeCode\":\"persisted_data_invalid\"");
  expect(events[0]).toContain(requestId);
  expect(events[0]).not.toContain(uid);
});

test("an unexpected D1 failure emits its bounded cause and request/operation correlation once", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start(true, true);
  const requestId = crypto.randomUUID();
  const result = await worker.dispatchFetch(`http://authentication.test/api/trpc/classifiedsRead?input=${encodeURIComponent(JSON.stringify({ operation: "categories.catalog", input: null }))}`, { headers: { "x-fixture-classifieds-unavailable": "true", "x-request-id": requestId } });
  expect(result.status).toBe(500);
  expect(result.headers.get("x-request-id")).toBe(requestId);
  const events = messages.filter(message => message.includes("\"event\":\"classifieds.request.unavailable\""));
  expect(events).toHaveLength(1);
  expect(events[0]).toContain("\"causeCode\":\"d1_execution\"");
  expect(events[0]).toContain("\"operation\":\"categories.catalog\"");
  expect(events[0]).toContain(requestId);
  expect(events[0]).not.toContain("missing_classifieds_fixture");
});
