import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence } from "../classifieds";
import { photoLeaseMs, photoRecordSchema, type PhotoRecord } from "@tudomacae/classifieds-photos";
import { now, runtime, call, startRuntime, upload, photo, capability, draft, account, classifiedsDatabase } from "./photosRuntimeHarness";
test("direct creation replays its stable ID and public pagination excludes pending ads", async () => {
  const input = { ...draft, id: "same-create", advertiserProfileId: "profile" };
  const first = await capability("ads.create", input);
  expect(first.error).toBeUndefined();
  expect((await capability("ads.create", input)).value).toEqual(first.value);
  await capability("ads.create", { ...input, id: "newer", title: "Mais novo" }, true, { now: now + 1 });
  const page = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string() }).parse((await capability("ads.page", { scope: { kind: "all" }, limit: 1 }, false)).value);
  expect(page.items.map(ad => ad.id)).toEqual(["newer"]);
  const after = z.object({ after: z.object({ id: z.string(), createdAt: z.number() }) }).parse(JSON.parse(Buffer.from(page.nextCursor, "base64url").toString("utf8"))).after;
  expect((await capability("ads.page", { scope: { kind: "all" }, limit: 1, after }, false)).value).toMatchObject({ items: [{ id: "same-create" }] });
  expect((await capability("ads.read", { id: "ad" }, false)).value).toBeNull();
  await capability("ads.delete", { id: "same-create" });
  expect((await capability("publications.save", { ...draft, id: "same-create" })).error).toBe("AdvertiserProfileAccessError");
});
test("profile save preserves unrelated fields and a changed review cannot publish", async () => {
  await call({ action: "save", records: [{ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }], activityAreas: [{ categoryId: "categoria", subcategoryId: "subcategoria" }], description: "Descrição mantida", createdAt: now, revision: 4 } }] });
  const reviewed = { title: "Anúncio", text: "Descrição completa do anúncio para publicação.", categoryId: "categoria", subcategoryId: "subcategoria", advertiserProfileId: "profile", images: [], advertiserProfile: { title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }] } };
  const before = z.object({ revision: z.number() }).parse((await capability("profiles.owned", { id: "profile" }, false)).value);
  await capability("publications.profile", { publicationId: "ad", profileId: "profile", title: "Atualizado", contacts: [{ number: "22999998888", isWhatsapp: true }] });
  expect((await capability("publications.publish", { id: "ad", reviewed })).error).toBe("AdOperationError");
  const db = await classifiedsDatabase();
  const row = await db.prepare("SELECT body FROM classifieds_records WHERE kind='profile' AND id='profile'").first<{ body: string }>();
  expect(JSON.parse(row!.body)).toMatchObject({ description: "Descrição mantida", activityAreas: [{ categoryId: "categoria", subcategoryId: "subcategoria" }], revision: before.revision + 1 });
});

test("legacy active ads tolerate incomplete contacts until reactivation; published photos upload and replay", async () => {
  await call({ action: "save", records: [{ kind: "profile", id: "profile", body: { userId: "owner", title: "Legado", contacts: [], createdAt: now } },
    { kind: "ad", id: "legacy", body: { ...draft, userId: "owner", advertiserProfileId: "profile", status: "active", createdAt: now, revision: 1, images: [] } }] });
  expect((await capability("ads.forProfile", { profileId: "profile" }, false)).value).toMatchObject([{ id: "legacy" }]);
  expect((await capability("ads.update", { ...draft, id: "legacy", title: "Texto atualizado" }, true, { actor: account("owner", false) })).error).toBeUndefined();
  const owned = z.object({ revision: z.number() }).parse((await capability("ads.owned", { id: "legacy", includePendingImages: true }, false)).value);
  const request = { ...upload(), ownerId: "legacy", expectedRevision: owned.revision };
  const linked = photo.parse((await call({ action: "upload", request })).value);
  expect((await call({ action: "upload", request })).value).toMatchObject({ path: linked.path, status: "linked" });
  expect((await capability("ads.read", { id: "legacy" }, false)).value).toMatchObject({ images: [{ id: request.operationId, url: `/api/anuncios/legacy/fotos/${request.operationId}` }] });
  expect((await capability("ads.owned", { id: "legacy", includePendingImages: true }, false)).value).toMatchObject({ images: [{ uploadRevision: owned.revision }] });
  await capability("ads.status", { id: "legacy", status: "paused" });
  expect((await capability("ads.status", { id: "legacy", status: "active" })).error).toBe("PublicationRequirementError");
});

test("three-photo draft replacement promotes staged bytes atomically and replays after restart", async () => {
  await capability("publications.save", { ...draft, id: "ad" });
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const originals: PhotoRecord[] = [];
  for (let index = 0; index < 3; index++) {
    const revision = Number((await persistence.read("ad", "ad"))!.body.revision);
    originals.push(photoRecordSchema.parse((await call({ action: "upload", request: { ...upload(), expectedRevision: revision } })).value));
  }
  const record = (await persistence.read("ad", "ad"))!;
  const observed = z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), order: z.number() })).parse(record.body.images);
  const request = { ...upload(), expectedRevision: Number(record.body.revision), pendingPublication: true };
  const staged = photoRecordSchema.parse((await call({ action: "upload", request })).value);
  expect(staged).toMatchObject({ status: "reserved", pendingPublication: true });
  expect((await persistence.read("ad", "ad"))!.body.images).toEqual(record.body.images);
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect((await call({ action: "upload", request: { ...request, expectedRevision: request.expectedRevision + 1 } })).value).toEqual(staged);
  const images = [...observed.slice(0, 2), { id: staged.id, title: staged.title, description: staged.description, order: 2 }];
  const input = { id: "ad", operationId: crypto.randomUUID(), images, observedImages: observed };
  expect((await capability("publications.photos", input)).error).toBeUndefined();
  const fresh = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const committed = (await fresh.read("ad", "ad"))!;
  expect(committed.body.images).toMatchObject(images.map(image => ({ ...image, path: image.id === staged.id ? staged.path : originals.find(item => item.id === image.id)!.path })));
  expect(committed.body.pendingImageUploadReservations).toEqual([]);
  expect((await fresh.read("retirement", staged.path, "classifieds_photos"))!.body.status).toBe("linked");
  const cleanup = await fresh.page({ kind: "adCleanup" });
  expect(cleanup.items.map(item => item.body.path)).toEqual([originals[2]!.path]);
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect((await capability("publications.photos", input)).value).toEqual(committed.body.images);
  const currentStore = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const replacements: PhotoRecord[] = [];
  for (let index = 0; index < 3; index++) {
    const expectedRevision = Number((await currentStore.read("ad", "ad"))!.body.revision);
    replacements.push(photoRecordSchema.parse((await call({ action: "upload", request: { ...upload(), pendingPublication: true, expectedRevision } })).value));
  }
  expect((await currentStore.read("ad", "ad"))!.body.images).toEqual(committed.body.images);
  const allNew = replacements.map((item, order) => ({ id: item.id, title: item.title, description: item.description, order }));
  expect((await capability("publications.photos", { id: "ad", images: allNew, observedImages: images })).error).toBeUndefined();
  expect((await currentStore.read("ad", "ad"))!.body.images).toMatchObject(allNew);
  expect((await currentStore.read("ad", "ad"))!.body.pendingImageUploadReservations).toEqual([]);
  expect((await currentStore.page({ kind: "adCleanup" })).items).toHaveLength(4);
});

test("successful photo sync discards abandoned staged uploads without waiting for lease expiry", async () => {
  await capability("publications.save", { ...draft, id: "ad" });
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  for (let index = 0; index < 3; index++) {
    const expectedRevision = Number((await persistence.read("ad", "ad"))!.body.revision);
    expect((await call({ action: "upload", request: { ...upload(), expectedRevision } })).error).toBeUndefined();
  }
  const record = (await persistence.read("ad", "ad"))!;
  const observed = z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), order: z.number() })).parse(record.body.images);
  const request = { ...upload(), pendingPublication: true, expectedRevision: Number(record.body.revision) };
  expect((await call({ action: "upload", request, fault: "bytes" })).error).toBeDefined();
  expect((await persistence.read("ad", "ad"))!.body.images).toEqual(record.body.images);
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  const resumedStore = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const spare = photoRecordSchema.parse((await call({ action: "upload", request: { ...upload(), pendingPublication: true, expectedRevision: Number((await resumedStore.read("ad", "ad"))!.body.revision) } })).value);
  expect((await capability("publications.photos", { id: "ad", images: observed, observedImages: observed.map(image => ({ ...image, title: "Outra edição" })) })).error).toBeDefined();
  expect((await resumedStore.read("ad", "ad"))!.body.pendingImageUploadReservations).toHaveLength(2);
  expect((await resumedStore.page({ kind: "adCleanup" })).items).toHaveLength(0);
  expect((await capability("publications.photos", { id: "ad", images: observed, observedImages: observed })).error).toBeUndefined();
  expect((await resumedStore.read("ad", "ad"))!.body.pendingImageUploadReservations).toEqual([]);
  expect((await resumedStore.page({ kind: "adCleanup" })).items).toHaveLength(2);
  expect((await call({ action: "upload", request: { ...request, expectedRevision: Number((await resumedStore.read("ad", "ad"))!.body.revision) } })).code).toBe("retired");
  expect((await capability("publications.profile", { publicationId: "ad", profileId: "profile", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }] })).error).toBeUndefined();
  expect((await capability("publications.publish", { id: "ad" })).error).toBeUndefined();
  expect((await call({ action: "sweep", now: now + photoLeaseMs })).error).toBeUndefined();
  const linked = (await resumedStore.read("ad", "ad"))!.body;
  expect(linked.images).toMatchObject(observed);
  expect(linked.pendingImageUploadReservations).toEqual([]);
  expect((await resumedStore.read("retirement", spare.path, "classifieds_photos"))!.body.status).toBe("retired");
});
