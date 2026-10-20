import { expect, test } from "vitest";
import { createPhotoLifecycle, photoLeaseMs } from "../index";
import { createPhotoTransfer } from "../transfer";
import { fixture, actor, upload } from "./fixture";

test("historical transfer dry-run preserves references, imports once, and rejects divergent bytes", async () => {
  const f = fixture();
  const owner = f.owner("profile");
  owner.photoPath = "profile-photos/profile/historical.png";
  const request = upload("profile");
  const item = { ...request, path: owner.photoPath, id: request.operationId, size: request.bytes.length, digest: await f.dependencies.digest(request.bytes), sourceGeneration: "source-1", title: "Foto", description: "" };
  let source = request.bytes;
  const transfer = createPhotoTransfer({ ...f.dependencies, source: async () => ({ bytes: source, generation: "source-1", mimeType: "image/png" }) });
  expect(await transfer.importItem(item, true)).toMatchObject({ status: "verified" });
  expect(f.bytes.size).toBe(0);
  expect(await transfer.importItem(item, false)).toMatchObject({ status: "imported" });
  const original = structuredClone(f.records.get(item.path));
  f.advance(1_000);
  expect(await transfer.importItem(item, false)).toMatchObject({ status: "unchanged" });
  expect(f.records.get(item.path)).toEqual(original);
  expect(await createPhotoLifecycle(f.dependencies).read(item.path)).toMatchObject({ bytes: source });
  source = new Uint8Array([1]);
  await expect(transfer.importItem(item, true)).rejects.toMatchObject({ code: "conflict" });
});

test.each(["title", "description", "mimeType", "size", "ownerKind", "ownerId", "id", "operationId", "sourceGeneration", "reservedRevision"] as const)("transfer comparison and retry reject divergent %s without overwriting it", async (field) => {
  const f = fixture();
  const owner = f.owner("profile");
  owner.photoPath = "profile-photos/profile/historical.png";
  const request = upload("profile");
  const item = { ...request, path: owner.photoPath, id: request.operationId, size: request.bytes.length, digest: await f.dependencies.digest(request.bytes), sourceGeneration: "source", title: "Original", description: "Original" };
  const transfer = createPhotoTransfer({ ...f.dependencies, source: async () => ({ bytes: request.bytes, generation: "source", mimeType: "image/png" }) });
  await transfer.importItem(item, false);
  const record = f.records.get(item.path)!;
  const divergent = { ...record, [field]: typeof record[field] === "number" ? record[field] + 1 : field === "ownerKind" ? "ad" : field === "mimeType" ? "image/jpeg" : "divergent" };
  f.records.set(item.path, divergent);
  await expect(transfer.importItem(item, true, true)).rejects.toMatchObject({ code: "conflict" });
  await expect(transfer.importItem(item, false)).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.get(item.path)).toEqual(divergent);
});

test("staged draft uploads retain three old photos on failure and replay without renewing leases", async () => {
  const f = fixture();
  const owner = f.owner("ad");
  owner.images = Array.from({ length: 3 }, (_, order) => ({ id: `old-${order}`, path: `legacy/${order}`, order }));
  const request = { ...upload(), pendingPublication: true as const };
  const originalCreate = f.dependencies.objects.create;
  f.dependencies.objects.create = async () => {
    throw new Error("Fixture R2 failure");
  };
  await expect(f.lifecycle.upload(actor, request)).rejects.toThrow("Fixture R2 failure");
  expect(f.owners.get("ad:ad")!.images).toEqual(owner.images);
  f.dependencies.objects.create = originalCreate;
  const first = await f.lifecycle.upload(actor, { ...request, expectedRevision: 2 });
  expect(first).toMatchObject({ status: "reserved", pendingPublication: true, generation: expect.any(String) });
  expect(f.owners.get("ad:ad")!.images).toEqual(owner.images);
  expect(await f.lifecycle.upload(actor, { ...request, expectedRevision: 2 })).toEqual(first);
  expect(await f.lifecycle.readAd("ad", first.id, actor)).toBeNull();
  await expect(f.lifecycle.upload(actor, { ...request, pendingPublication: undefined })).rejects.toMatchObject({ code: "conflict" });
  await expect(f.lifecycle.upload(actor, { ...request, title: "Different" })).rejects.toMatchObject({ code: "conflict" });
  f.advance(photoLeaseMs);
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "retired" });
  expect(await f.lifecycle.sweep()).toMatchObject({ completed: 1 });
  expect(f.owners.get("ad:ad")!.images).toEqual(owner.images);
});

test.each(["published", "publishing", "deleting"])("staged uploads reject ad state %s", async (publicationState) => {
  const f = fixture();
  f.owner("ad").publicationState = publicationState;
  await expect(f.lifecycle.upload(actor, { ...upload(), pendingPublication: true })).rejects.toMatchObject({ code: "conflict" });
  expect(f.bytes.size).toBe(0);
});

test("historical reconciliation reads without metadata transactions or provider allocations", async () => {
  const f = fixture();
  const owner = f.owner("profile");
  owner.photoPath = "profile-photos/profile/history.png";
  const request = upload("profile");
  const item = { ...request, path: owner.photoPath, id: "history", digest: await f.dependencies.digest(request.bytes), size: request.bytes.length, sourceGeneration: "source" };
  const transfer = createPhotoTransfer({ ...f.dependencies, store: { ...f.dependencies.store, transact: async () => {
    throw new Error("DryRunMustNotTransact");
  } }, source: async () => ({ bytes: request.bytes, generation: "source", mimeType: "image/png" }) });
  await expect(transfer.importItem(item, true)).resolves.toMatchObject({ status: "verified" });
  await expect(transfer.importItem(item, true, true)).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.size).toBe(0);
  expect(f.bytes.size).toBe(0);
});

test("historical Ad inventory cannot substitute the image identity at the same path", async () => {
  const f = fixture();
  const owner = f.owner("ad");
  const request = upload();
  const path = "ad-images/ad/history.png";
  owner.images = [{ id: "original", path, order: 0 }];
  const transfer = createPhotoTransfer({ ...f.dependencies, source: async () => ({ bytes: request.bytes, generation: "source", mimeType: "image/png" }) });
  const item = { ...request, path, id: "other", size: request.bytes.length, digest: await f.dependencies.digest(request.bytes), sourceGeneration: "source" };
  await expect(transfer.importItem(item, false)).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.size).toBe(0);
  expect(f.bytes.size).toBe(0);
  await expect(transfer.importItem({ ...item, id: "original" }, false)).resolves.toMatchObject({ status: "imported" });
});
