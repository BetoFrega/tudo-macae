import { expect, test } from "vitest";
import { photoLeaseMs, PhotoError } from "../index";
import { createPhotoTransfer } from "../transfer";
import { fixture, actor, upload } from "./fixture";

test("retirement denies reads before purge completes and rejects a delayed upload", async () => {
  const f = fixture();
  f.owner("ad");
  const request = upload();
  const record = await f.lifecycle.upload(actor, request);
  await f.lifecycle.remove(actor, record.path);
  expect(await f.lifecycle.read(record.path, actor)).toBeNull();
  f.dependencies.purge.verify = async () => ({ success: false, failures: [{ layer: "visibility", cause: "verification" }] });
  expect(await f.lifecycle.sweep()).toMatchObject({ pending: 1, completed: 0 });
  expect(f.markers.has(record.path)).toBe(true);
  await expect(f.dependencies.objects.create(record, request.bytes)).rejects.toBeInstanceOf(PhotoError);
  f.dependencies.purge.verify = async () => ({ success: true });
  f.advance(60_000);
  expect(await f.lifecycle.sweep()).toMatchObject({ completed: 1 });
  expect(await f.lifecycle.revoked(record.path)).toBe(true);
});
test("active unlinked profile reservation blocks retirement, while expiry safely clears it", async () => {
  const f = fixture();
  f.owner("profile");
  const request = upload("profile");
  const record = await f.lifecycle.reserve(actor, request);
  expect(await f.lifecycle.retireUnlinked(record.path)).toBe("reserved");
  expect(await f.lifecycle.sweep()).toMatchObject({ completed: 0 });
  f.advance(photoLeaseMs);
  expect(await f.lifecycle.sweep()).toMatchObject({ completed: 1 });
  expect(f.owners.get("profile:profile")!.reservations).toEqual([]);
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "retired" });
});
test("profile replacement retires only the previous own photo and leaves a durable purge intent", async () => {
  const f = fixture();
  f.owner("profile");
  const first = await f.lifecycle.upload(actor, upload("profile"));
  const second = await f.lifecycle.upload(actor, { ...upload("profile"), expectedRevision: 3 });
  expect(f.owners.get("profile:profile")!.photoPath).toBe(second.path);
  expect(f.records.get(first.path)!.status).toBe("retiring");
  expect(await f.lifecycle.sweep()).toMatchObject({ completed: 1 });
  expect(await f.lifecycle.read(second.path)).toMatchObject({ mimeType: "image/png" });
});
test("removing a middle photo and replacing it retains contiguous order", async () => {
  const f = fixture();
  f.owner("ad");
  const first = await f.lifecycle.upload(actor, upload());
  const second = await f.lifecycle.upload(actor, { ...upload(), expectedRevision: 3 });
  const third = await f.lifecycle.upload(actor, { ...upload(), expectedRevision: 5 });
  await f.lifecycle.remove(actor, second.path);
  const replacement = await f.lifecycle.upload(actor, { ...upload(), expectedRevision: 8 });
  expect((await f.lifecycle.publication(actor, "ad")).images.map(image => [image.id, image.order])).toEqual([[first.id, 0], [third.id, 1], [replacement.id, 2]]);
});
test("a replacement preserves unmanaged and foreign-owned previous photos", async () => {
  const f = fixture();
  const owner = f.owner("profile");
  owner.photoPath = "shared/photo.png";
  await expect(f.lifecycle.upload(actor, upload("profile"))).resolves.toMatchObject({ status: "linked" });
  f.owner("profile", "other");
  const other = await f.lifecycle.upload(actor, { ...upload("profile"), ownerId: "other" });
  f.owners.set("profile:profile", { ...f.owners.get("profile:profile")!, photoPath: other.path });
  await expect(f.lifecycle.upload(actor, { ...upload("profile"), expectedRevision: 3 })).resolves.toMatchObject({ status: "linked" });
  expect(f.records.get(other.path)?.status).toBe("linked");
});
test.each(["negócio 1", "x".repeat(200)])("legacy Ad identifiers retain upload and transfer ownership (%s)", async (id) => {
  const f = fixture();
  const owner = f.owner("ad", id);
  const request = { ...upload(), ownerId: id };
  const uploaded = await f.lifecycle.upload(actor, request);
  expect(await f.lifecycle.read(uploaded.path, actor)).toMatchObject({ mimeType: "image/png" });
  const path = `ad-images/${id}/historical.png`;
  f.owners.set(`ad:${id}`, { ...f.owners.get(`ad:${id}`)!, images: [{ id: "photo", path, order: 0, pending: false }] });
  const transfer = createPhotoTransfer({ ...f.dependencies, source: async () => ({ bytes: request.bytes, generation: "source", mimeType: "image/png" }) });
  await expect(transfer.importItem({ ...request, expectedRevision: owner.revision + 2, path, id: "photo", size: request.bytes.length, digest: await f.dependencies.digest(request.bytes), sourceGeneration: "source" }, false)).resolves.toMatchObject({ status: "imported", path });
});
test("a 212-character Profile identifier remains valid for a new photo", async () => {
  const f = fixture();
  const id = `publication-${"x".repeat(200)}`;
  f.owner("profile", id);
  await expect(f.lifecycle.upload(actor, { ...upload("profile"), ownerId: id })).resolves.toMatchObject({ status: "linked" });
});
test("a profile edit between reserve and finalize prevents stale replacement", async () => {
  const f = fixture();
  f.owner("profile");
  const request = upload("profile");
  await f.lifecycle.reserve(actor, request);
  f.owners.set("profile:profile", { ...f.owners.get("profile:profile")!, revision: 3 });
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "conflict" });
  expect(f.owners.get("profile:profile")!.photoPath).toBeUndefined();
});
test("a deletion intent cannot remove a linked photo and completes only after retirement", async () => {
  const f = fixture();
  f.owner("ad");
  const photo = await f.lifecycle.upload(actor, upload());
  f.jobs.push({ kind: "adCleanup", id: "delete", path: photo.path });
  await f.lifecycle.sweep();
  expect(f.bytes.has(photo.path)).toBe(true);
  f.owners.delete("ad:ad");
  expect(await f.lifecycle.sweep()).toMatchObject({ completed: 1 });
  expect(f.jobs).toEqual([]);
});
test("confirmed missing bytes are unavailable, and a revocation during read hides the response", async () => {
  const f = fixture();
  f.owner("profile");
  const photo = await f.lifecycle.upload(actor, upload("profile"));
  const read = f.dependencies.objects.read;
  f.dependencies.objects.read = async () => null;
  await expect(f.lifecycle.read(photo.path)).rejects.toMatchObject({ code: "unavailable" });
  f.dependencies.objects.read = async (record) => {
    const value = await read(record);
    await f.lifecycle.remove(actor, record.path);
    return value;
  };
  expect(await f.lifecycle.read(photo.path)).toBeNull();
});
