import { expect, test } from "vitest";
import { fixture, actor, upload } from "./fixture";
import { createPhotoLifecycle } from "../index";

test("ownership is rejected before paid processing or reservation", async () => {
  const f = fixture();
  f.owner("profile");
  f.dependencies.decode = async () => {
    throw new Error("Paid processing reached");
  };
  await expect(f.lifecycle.upload({ uid: "stranger", admin: false }, upload("profile"))).rejects.toMatchObject({ code: "forbidden" });
  expect(f.records.size).toBe(0);
  expect(f.bytes.size).toBe(0);
});

test("legacy reservations acquire durable admission before a paid retry", async () => {
  const f = fixture();
  f.owner("profile");
  const request = upload("profile");
  const record = await f.lifecycle.reserve(actor, request);
  const { processingAttempts: _attempts, decodedAt: _decoded, admissionOnly: _admission, ...legacy } = record;
  f.records.set(record.path, legacy);
  f.quotas.clear();
  f.quotas.set(actor.uid, { uploads: Array.from({ length: 20 }, () => f.dependencies.now()) });
  let paid = 0;
  f.dependencies.decode = async () => {
    paid++;
    return { mimeType: "image/png", width: 1, height: 1 };
  };
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "rate_limit" });
  expect(paid).toBe(0);
  expect(f.events.at(-1)).toMatchObject({ outcome: "failure", cause: "account_burst" });
  f.advance(300_000);
  expect(await createPhotoLifecycle(f.dependencies).upload(actor, request)).toMatchObject({ status: "linked", processingAttempts: 1 });
  expect(paid).toBe(1);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(21);
  expect(f.quotas.get(null)?.uploads).toHaveLength(1);
});

test("three failed processing attempts consume one admission and require a new intent", async () => {
  const f = fixture();
  f.owner("profile");
  const request = upload("profile");
  let paid = 0;
  f.dependencies.decode = async () => {
    paid++;
    throw new Error("Processing failed");
  };
  for (let i = 0; i < 3; i++) await expect(f.lifecycle.upload(actor, request)).rejects.toThrow("Processing failed");
  await expect(createPhotoLifecycle(f.dependencies).upload(actor, request)).rejects.toMatchObject({ code: "retired" });
  expect(f.events.at(-1)).toMatchObject({ outcome: "failure", cause: "processing_exhausted" });
  expect(paid).toBe(3);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
  expect(f.quotas.get(null)?.uploads).toHaveLength(1);
  expect(f.bytes.size).toBe(0);
});

test("daily account capacity survives deletion and only returns as the rolling window advances", async () => {
  const f = fixture();
  f.owner("profile");
  for (let i = 0; i < 100; i++) {
    const record = await f.lifecycle.upload(actor, { ...upload("profile"), expectedRevision: 1 + i * 3 });
    await f.lifecycle.remove(actor, record.path);
    if ((i + 1) % 20 === 0) f.advance(300_000);
  }
  const request = { ...upload("profile"), expectedRevision: 301 };
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "rate_limit", reason: "account_daily", retryAfterMs: 84_900_000 });
  f.advance(84_900_000);
  expect(await f.lifecycle.upload(actor, request)).toMatchObject({ status: "linked" });
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(81);
});

test("global capacity blocks another account while a linked replay remains free", async () => {
  const f = fixture();
  f.owner("profile");
  f.quotas.set(null, { uploads: Array.from({ length: 999 }, () => f.dependencies.now()) });
  const request = upload("profile");
  const record = await f.lifecycle.upload(actor, request);
  f.dependencies.decode = async () => {
    throw new Error("Replay or blocked request reached processing");
  };
  expect(await f.lifecycle.upload(actor, request)).toEqual(record);
  const other = f.owner("profile", "other");
  other.userId = "other-account";
  await expect(f.lifecycle.upload({ uid: "other-account", admin: false }, { ...upload("profile"), ownerId: "other" })).rejects.toMatchObject({ code: "rate_limit", reason: "global_daily", retryAfterMs: 86_400_000 });
  expect(f.quotas.get(null)?.uploads).toHaveLength(1000);
  expect(f.quotas.has("other-account")).toBe(false);
  expect(f.records.size).toBe(1);
});

test("the threshold creates one durable pending warning instead of one event per upload", async () => {
  const f = fixture();
  f.owner("profile");
  f.quotas.set(null, { uploads: Array.from({ length: 799 }, () => f.dependencies.now()) });
  const first = await f.lifecycle.upload(actor, upload("profile"));
  await f.lifecycle.upload(actor, { ...upload("profile"), expectedRevision: 3 });
  expect(f.quotas.get(null)?.warning).toEqual({ operationId: first.operationId, createdAt: f.dependencies.now() });
  expect(f.events.filter(event => event.cause === "global_warning")).toHaveLength(1);
});

test("a warning older than the rolling day does not suppress the next threshold crossing", async () => {
  const f = fixture();
  f.owner("profile");
  const stale = { operationId: crypto.randomUUID(), createdAt: f.dependencies.now() - 86_400_001 };
  f.quotas.set(null, { uploads: Array.from({ length: 799 }, () => f.dependencies.now()), warning: stale });
  const crossing = await f.lifecycle.upload(actor, upload("profile"));
  expect(f.quotas.get(null)?.warning).toEqual({ operationId: crossing.operationId, createdAt: f.dependencies.now() });
  expect(f.events.filter(event => event.cause === "global_warning")).toHaveLength(1);
});

test("lost byte-write responses reuse the durable decoder receipt", async () => {
  const f = fixture();
  f.owner("profile");
  let paid = 0;
  f.dependencies.decode = async () => {
    paid++;
    return { mimeType: "image/png", width: 1, height: 1 };
  };
  const create = f.dependencies.objects.create;
  f.dependencies.objects.create = async (record, bytes) => {
    await create(record, bytes);
    throw new Error("Lost upload response");
  };
  const request = upload("profile");
  await expect(f.lifecycle.upload(actor, request)).rejects.toThrow("Lost upload response");
  f.dependencies.objects.create = create;
  expect(await createPhotoLifecycle(f.dependencies).upload(actor, request)).toMatchObject({ status: "linked", processingAttempts: 1 });
  expect(paid).toBe(1);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
});

test("twenty profile uploads exhaust a rolling five-minute window without refund on replacement", async () => {
  const f = fixture();
  f.owner("profile");
  for (let i = 0; i < 20; i++) {
    await f.lifecycle.upload(actor, { ...upload("profile"), expectedRevision: 1 + i * 2 });
  }
  const request = { ...upload("profile"), expectedRevision: 41 };
  f.dependencies.decode = async () => {
    throw new Error("Blocked upload reached paid processing");
  };
  await expect(f.lifecycle.upload(actor, request)).rejects.toMatchObject({ code: "rate_limit", reason: "account_burst", retryAfterMs: 300_000 });
  expect(f.records.size).toBe(20);
  expect(f.bytes.size).toBe(20);
  f.advance(300_000);
  f.dependencies.decode = async () => ({ mimeType: "image/png", width: 1, height: 1 });
  expect(await f.lifecycle.upload(actor, request)).toMatchObject({ status: "linked" });
});
