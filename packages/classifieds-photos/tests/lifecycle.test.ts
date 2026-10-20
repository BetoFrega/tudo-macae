import { expect, test } from "vitest";
import { PhotoError } from "../index";
import { fixture, actor, upload } from "./fixture";

test("reservation and bytes never expose a pending ad; metadata publication uses the confirmed revision", async () => {
  const f = fixture();
  f.owner("ad");
  const request = upload();
  const reserved = await f.lifecycle.reserve(actor, request);
  await f.dependencies.objects.create(reserved, request.bytes);
  expect(await f.lifecycle.read(reserved.path)).toBeNull();
  await expect(f.lifecycle.publication(actor, "ad")).rejects.toMatchObject({ code: "conflict" });
  const linked = await f.lifecycle.upload(actor, request);
  expect(await f.lifecycle.readAd("ad", linked.id)).toBeNull();
  expect(await f.lifecycle.readAd("ad", linked.id, actor)).toMatchObject({ mimeType: "image/png" });
  expect(await f.lifecycle.publication(actor, "ad")).toMatchObject({ revision: 3 });
  f.owners.set("ad:ad", { ...f.owners.get("ad:ad")!, publicationState: "published" });
  expect(await f.lifecycle.readAd("ad", linked.id)).toMatchObject({ bytes: request.bytes });
});
test("ownership, revision, MIME and file limits reject without reserving an object", async () => {
  const f = fixture();
  f.owner("ad");
  await expect(f.lifecycle.upload({ uid: "stranger", admin: false }, upload())).rejects.toMatchObject({ code: "forbidden" });
  await expect(f.lifecycle.upload(actor, { ...upload(), expectedRevision: 2 })).rejects.toMatchObject({ code: "conflict" });
  await expect(f.lifecycle.upload(actor, { ...upload(), bytes: new Uint8Array(1024 * 1024 + 1) })).rejects.toMatchObject({ code: "invalid" });
  expect(f.records.size).toBe(0);
  expect(f.bytes.size).toBe(0);
});
test.each(["ad", "profile"] as const)("%s uploads above 16 megapixels are rejected", async (kind) => {
  const f = fixture();
  f.owner(kind);
  f.dependencies.decode = async () => ({ mimeType: "image/png", width: 4001, height: 4000 });
  await expect(f.lifecycle.upload(actor, upload(kind))).rejects.toMatchObject({ code: "invalid" });
  f.dependencies.decode = async () => ({ mimeType: "image/png", width: 4000, height: 4000 });
  expect(await f.lifecycle.upload(actor, upload(kind))).toMatchObject({ status: "linked" });
});

test.each(["published", undefined])("completed ad photos upload and replay without reverting publication (%s)", async (publicationState) => {
  const f = fixture();
  const owner = f.owner("ad");
  owner.publicationState = publicationState;
  const request = upload();
  const linked = await f.lifecycle.upload(actor, request);
  expect(await f.lifecycle.upload(actor, request)).toEqual(linked);
  expect(f.owners.get("ad:ad")?.publicationState).toBe(publicationState);
  expect(await f.lifecycle.readAd("ad", linked.id)).toMatchObject({ bytes: request.bytes });
});

test.each(["publishing", "deleting"])("ad photo reserve, finalize and removal reject an in-flight publication (%s)", async (publicationState) => {
  const f = fixture();
  const owner = f.owner("ad");
  owner.publicationState = publicationState;
  await expect(f.lifecycle.reserve(actor, upload())).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.size).toBe(0);
  expect(f.bytes.size).toBe(0);
  owner.publicationState = "pending";
  const linked = await f.lifecycle.upload(actor, upload());
  f.owners.get("ad:ad")!.publicationState = publicationState;
  await expect(f.lifecycle.remove(actor, linked.path)).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.get(linked.path)?.status).toBe("linked");
  expect(f.owners.get("ad:ad")!.images).toHaveLength(1);

  const g = fixture();
  g.owner("ad");
  const create = g.dependencies.objects.create;
  g.dependencies.objects.create = async (record, bytes) => {
    const generation = await create(record, bytes);
    g.owners.get("ad:ad")!.publicationState = publicationState;
    return generation;
  };
  await expect(g.lifecycle.upload(actor, upload())).rejects.toMatchObject({ code: "conflict" });
  expect([...g.records.values()][0]?.status).toBe("reserved");
  expect(g.owners.get("ad:ad")!.images[0]?.pending).toBe(true);
});
test("the same operation resumes a lost byte-write response and rejects another intent", async () => {
  const f = fixture();
  f.owner("ad");
  const request = upload();
  const create = f.dependencies.objects.create;
  f.dependencies.objects.create = async (record, bytes) => {
    await create(record, bytes);
    throw new Error("lost response");
  };
  await expect(f.lifecycle.upload(actor, request)).rejects.toThrow("lost response");
  f.dependencies.objects.create = create;
  const linked = await f.lifecycle.upload(actor, request);
  expect(await f.lifecycle.upload(actor, request)).toEqual(linked);
  await expect(f.lifecycle.upload(actor, { ...request, bytes: new Uint8Array([...request.bytes, 2]) })).rejects.toMatchObject({ code: "conflict" });
  expect(f.bytes.size).toBe(1);
  expect(f.owners.get("ad:ad")!.images).toHaveLength(1);
});
test.each(["ad", "profile"] as const)("an operation cannot change format after reservation or retirement (%s)", async (kind) => {
  const f = fixture();
  f.owner(kind);
  const request = upload(kind);
  const first = await f.lifecycle.upload(actor, request);
  f.dependencies.decode = async () => ({ mimeType: "image/jpeg", width: 1, height: 1 });
  const changed = { ...request, expectedRevision: 3, mimeType: "image/jpeg" as const, bytes: new Uint8Array([255, 216, 255, 1]) };
  await expect(f.lifecycle.upload(actor, changed)).rejects.toMatchObject({ code: "conflict" });
  await f.lifecycle.remove(actor, first.path);
  await f.lifecycle.sweep();
  await expect(f.lifecycle.upload(actor, { ...changed, expectedRevision: 4 })).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.size).toBe(1);
  expect(f.bytes.size).toBe(0);
});
test("failed decoding and pixel validation retain admission without storing bytes", async () => {
  const f = fixture();
  f.owner("ad");
  f.dependencies.decode = async () => {
    throw new PhotoError("invalid", "corrupt pixels");
  };
  const request = upload();
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "invalid" });
  f.dependencies.decode = async () => ({ mimeType: "image/png", width: 4001, height: 4000 });
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "invalid" });
  expect(f.records.size).toBe(1);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
  expect(f.bytes.size).toBe(0);
});
test("publication rejects absent bytes and a metadata change during R2 verification", async () => {
  const f = fixture();
  f.owner("ad");
  const record = await f.lifecycle.upload(actor, upload());
  f.dependencies.objects.head = async () => false;
  await expect(f.lifecycle.publication(actor, "ad")).rejects.toMatchObject({ code: "unavailable" });
  f.dependencies.objects.head = async () => {
    await f.lifecycle.remove(actor, record.path);
    return true;
  };
  await expect(f.lifecycle.publication(actor, "ad")).rejects.toMatchObject({ code: "conflict" });
});
test("HEAD of a delivered variant asks the provider, so it fails wherever GET fails", async () => {
  const f = fixture();
  f.owner("ad");
  const linked = await f.lifecycle.upload(actor, upload());
  const delivery = { width: 1920, format: "avif" as const };
  const requests: unknown[] = [];
  f.dependencies.objects.deliver = async (_record, requested, probe) => {
    requests.push({ requested, probe });
    throw new PhotoError("unavailable", "variant");
  };
  await expect(f.lifecycle.readAd("ad", linked.id, actor, true, delivery)).rejects.toMatchObject({ code: "unavailable" });
  expect(requests).toEqual([{ requested: delivery, probe: true }]);
  f.dependencies.objects.deliver = async (_record, _requested, probe) => ({ bytes: new Uint8Array(probe ? [] : [1]), mimeType: "image/webp", delivered: true });
  expect(await f.lifecycle.readAd("ad", linked.id, actor, true, delivery)).toMatchObject({ mimeType: "image/webp", delivered: true });
  expect(await f.lifecycle.readAd("ad", linked.id, actor, false, delivery)).toMatchObject({ bytes: new Uint8Array([1]) });
});
