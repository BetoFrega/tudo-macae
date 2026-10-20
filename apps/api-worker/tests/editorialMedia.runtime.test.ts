import { describe, expect, test } from "vitest";
import { barrier, call, metadata, now, ok, prepared, provenance, register, reservationOf, upload, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime();

describe("catalog", () => {
  test("registers, reads and reads in batch, skipping absent Media", async () => {
    const id = await register("Praia");
    expect(await ok("get", id)).toMatchObject({ id, status: "staged", revision: 1, alt: "Praia", createdAt: now, updatedAt: now });
    expect((await ok("byIds", [id, "missing"])).map((item: { id: string }) => item.id)).toEqual([id]);
    expect(await ok("get", "missing")).toBeNull();
  });

  test("ensures demo Media idempotently and refuses a divergent record", async () => {
    const demo = { id: "demo-1", status: "active", metadata: metadata("Demo"), storagePath: "media/demo.webp", mimeType: "image/webp" };
    expect(await ok("ensure", demo)).toBe("demo-1");
    expect(await ok("ensure", demo, { now: now + 1 })).toBe("demo-1");
    expect((await call("ensure", { ...demo, metadata: metadata("Outra") })).message).toMatch(/diverge/);
  });

  test("leaves legacy transitions to the source", async () => {
    expect((await call("transition", [])).message).toMatch(/acontece na fonte/);
  });
});

describe("metadata revisions", () => {
  test("archives the replaced metadata and lists revisions in order", async () => {
    const id = await register("Original");
    await ok("update", { id, expectedRevision: 1, metadata: metadata("Revisada"), actorId: "admin" }, { now: now + 1 });
    await ok("update", { id, expectedRevision: 2, metadata: metadata("Final", "Legenda"), actorId: "admin" }, { now: now + 2 });
    expect(await ok("get", id)).toMatchObject({ revision: 3, alt: "Final", caption: "Legenda", updatedAt: now + 2, createdAt: now });
    expect(await ok("revisions", id)).toEqual([
      { mediaId: id, revision: 1, metadata: metadata("Original"), replacedAt: now + 1, replacedBy: "admin" },
      { mediaId: id, revision: 2, metadata: metadata("Revisada"), replacedAt: now + 2, replacedBy: "admin" },
    ]);
  });

  test("rejects a stale revision and an absent Media", async () => {
    const id = await register("Original");
    await ok("update", { id, expectedRevision: 1, metadata: metadata("Revisada"), actorId: "admin" });
    expect((await call("update", { id, expectedRevision: 1, metadata: metadata("Atrasada"), actorId: "other" })).error).toBe("MediaRevisionConflictError");
    expect((await call("update", { id: "missing", expectedRevision: 1, metadata: metadata("X"), actorId: "admin" })).error).toBe("MediaNotFoundError");
    expect(await ok("revisions", id)).toHaveLength(1);
  });
});

describe("search", () => {
  test("pages newest first across more records than one D1 page", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 30; index++) ids.unshift(await register(`Foto ${index}`, now + index));
    const first = await ok("search", { limit: 28 });
    expect(first.media.map((item: { id: string }) => item.id)).toEqual(ids.slice(0, 28));
    const second = await ok("search", { limit: 28, cursor: first.nextCursor });
    expect(second.media.map((item: { id: string }) => item.id)).toEqual(ids.slice(28));
    expect(second.nextCursor).toBeUndefined();
  });

  test("filters by status and text and reports unreferenced staged Media", async () => {
    await register("Praia ensolarada", now, "active");
    const staged = await register("Praia à noite", now + 1);
    await ok("ensure", { id: "staged-used", status: "staged", metadata: metadata("Praia usada"), storagePath: "media/used.webp", mimeType: "image/webp" }, { now: now + 2 });
    expect((await ok("search", { status: "active" })).media.map((item: { alt: string }) => item.alt)).toEqual(["Praia ensolarada"]);
    expect((await ok("search", { text: "praia a noite" })).media.map((item: { id: string }) => item.id)).toEqual([staged]);
    expect((await ok("unreferenced", {})).media.map((item: { id: string }) => item.id)).toEqual([staged]);
  });
});

describe("upload preparation", () => {
  test("reserves once per operation and rejects a different upload under the same key", async () => {
    const first = await ok("prepare", upload("key"), { operationId: "op" });
    expect(first).toMatchObject({ reservationId: reservationOf("op"), expiresAt: now + 600_000 });
    expect(await ok("prepare", upload("key"), { operationId: "op", now: now + 1 })).toEqual(first);
    expect((await call("prepare", upload("key", 200), { operationId: "op" })).code).toBe("duplicate");
    expect((await call("prepare", upload("key"), { operationId: "op", ownerId: "intruder" })).code).toBe("duplicate");
    expect(await ok("metadata", reservationOf("op"))).toEqual(metadata());
    expect((await call("metadata", reservationOf("op"), { ownerId: "intruder" })).code).toBe("forbidden");
  });
});

describe("upload finalization", () => {
  test("creates staged Media with a digest claim and replays the result", async () => {
    const reservationId = await prepared("op");
    const result = await ok("finalize", { reservationId, idempotencyKey: "op" }, { operationId: "op" });
    expect(result).toMatchObject({ status: "created", digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(await ok("get", result.mediaId)).toMatchObject({ status: "staged", digest: result.digest, storagePath: `media-staged/sha256-${result.digest}.webp`, mimeType: "image/webp" });
    expect(await ok("record", { kind: "mediaDigest", id: result.digest })).toMatchObject({ body: { mediaId: result.mediaId } });
    expect(await ok("finalize", { reservationId, idempotencyKey: "op" }, { operationId: "op", now: now + 1 })).toEqual(result);
    expect(await ok("readFinalized", { reservationId, idempotencyKey: "op" }, { operationId: "op" })).toEqual(result);
    expect((await call("finalize", { reservationId, idempotencyKey: "other" }, { operationId: "other" })).code).toBe("duplicate");
  });

  test("reports the canonical Media for a repeated digest, as duplicate or conflict by metadata", async () => {
    const created = await ok("finalize", { reservationId: await prepared("a"), idempotencyKey: "a" }, { operationId: "a" });
    expect(await ok("finalize", { reservationId: await prepared("b"), idempotencyKey: "b" }, { operationId: "b" }))
      .toEqual({ ...created, status: "duplicate" });
    expect(await ok("finalize", { reservationId: await prepared("c", 100, "Outra"), idempotencyKey: "c" }, { operationId: "c" }))
      .toEqual({ ...created, status: "conflict" });
  });

  test("lets only one of two concurrent finalizations of one digest create Media", async () => {
    const [first, second] = [await prepared("a"), await prepared("b")];
    const gate = barrier("held");
    const held = ok("finalize", { reservationId: first, idempotencyKey: "a" }, { operationId: "a", barrier: "held" });
    await gate.ready;
    const winner = await ok("finalize", { reservationId: second, idempotencyKey: "b" }, { operationId: "b" });
    gate.release();
    expect(winner.status).toBe("created");
    expect(await held).toEqual({ ...winner, status: "duplicate" });
    expect((await ok("search", {})).media).toHaveLength(1);
  });

  test("refuses an expired reservation", async () => {
    const reservationId = await prepared("op");
    const late = await call("finalize", { reservationId, idempotencyKey: "op" }, { operationId: "op", now: now + 600_000 });
    expect(late).toMatchObject({ code: "validationFailed", details: { reservationExpired: true } });
  });
});

describe("quarantine cleanup", () => {
  test("expires unfinished reservations, keeps finalized ones and removes both uploads once", async () => {
    const pending = await prepared("pending", 50);
    const done = await prepared("done");
    await ok("finalize", { reservationId: done, idempotencyKey: "done" }, { operationId: "done" });
    expect(await ok("plan", 10)).toEqual({ reservationIds: [] });
    const later = now + 86_400_000;
    expect((await ok("plan", 10, { now: later })).reservationIds.sort()).toEqual([done, pending].sort());
    const sweep = await ok("sweep", 10, { now: later });
    expect(sweep).toMatchObject({ hasMore: false });
    expect(sweep.removed.sort()).toEqual([done, pending].sort());
    expect(await ok("record", { kind: "uploadReservation", id: pending })).toMatchObject({ body: { status: "expired", cleanupPending: false, cleanedAt: later } });
    expect(await ok("record", { kind: "uploadReservation", id: done })).toMatchObject({ body: { status: "finalized", cleanupPending: false } });
    expect((await ok("sweep", 10, { now: later })).removed).toEqual([]);
  });
});

describe("editorial ingestion", () => {
  const admin = { caller: { channel: "administration", editorId: "admin" } };

  test("records each operation as a completed intent with its activity and replays it", async () => {
    const prepared = await ok("ingestPrepare", upload("key"), admin);
    const intent = await ok("record", { kind: "ingestionIntent", id: prepared.correlationId });
    expect(intent.body).toMatchObject({ status: "completed", operation: "prepare", targetId: prepared.reservationId });
    expect(await ok("record", { kind: "activity", id: prepared.correlationId })).toMatchObject({ body: { operation: "media.uploadPrepared", editorId: "admin", channel: "administration", administratorId: "admin", targetId: prepared.reservationId } });
    expect(await ok("ingestPrepare", upload("key"), { ...admin, now: now + 1 })).toEqual(prepared);
    const finalized = await ok("ingestFinalize", { reservationId: prepared.reservationId, idempotencyKey: "finalize" }, admin);
    expect(finalized).toMatchObject({ status: "created" });
    expect(await ok("ingestGet", finalized.correlationId, admin)).toMatchObject({ operation: "finalize", status: "completed" });
    expect(await ok("ingestReconcile", finalized.correlationId, admin)).toEqual(finalized);
    expect(await ok("record", { kind: "activity", id: finalized.correlationId })).toMatchObject({ body: { operation: "media.uploadFinalized", targetId: finalized.mediaId } });
    expect((await call("ingestGet", finalized.correlationId, { caller: { channel: "newsroom", editorId: "other" } })).code).toBe("forbidden");
    expect((await call("ingestPrepare", upload("key", 200), admin)).code).toBe("duplicate");
  });

  test("keeps a failed intent retryable and refuses Media without a valid Source Permission", async () => {
    const prepared = await ok("ingestPrepare", upload("key"), admin);
    const late = await call("ingestFinalize", { reservationId: prepared.reservationId, idempotencyKey: "late" }, { ...admin, now: now + 600_000 });
    expect(late).toMatchObject({ code: "validationFailed", details: { reservationExpired: true } });
    expect(await ok("ingestGet", late.details.operationId, admin)).toMatchObject({ status: "failed", errorCode: "validationFailed" });
    const permitted = { ...upload("permitted"), metadata: { ...metadata(), provenance: { origin: "third-party", provider: "Agência", creator: "Ana", credit: "Foto: Ana/Agência", acquiredAt: now, displayBasis: "permission", permissionReference: "permission-1" } } };
    expect((await call("ingestPrepare", permitted, admin)).code).toBe("forbidden");
    expect(await ok("ingestPrepare", permitted, { ...admin, permissions: ["permission-1"] })).toMatchObject({ reservationId: expect.any(String) });
  });

  test("records MCP searches under their request correlation without storage paths", async () => {
    await register("Praia");
    const mcp = { caller: { channel: "mcp", editorId: "editor", editorialClientId: "client" } };
    expect((await call("ingestSearch", {}, mcp)).code).toBe("validationFailed");
    const page = await ok("ingestSearch", { text: "praia" }, { ...mcp, requestId: "request-1" });
    expect(page.media).toHaveLength(1);
    expect(page.media[0].storagePath).toBeUndefined();
    expect(await ok("record", { kind: "activity", id: "request-1" })).toMatchObject({ body: { operation: "media.searchRead", editorialClientId: "client", targetId: "media" } });
  });
});

describe("editorial correction", () => {
  const correction = (id: string, alt: string, key = "fix", expectedRevision = 1) => ({ mediaId: id, expectedRevision, metadata: { alt, caption: "", provenance }, reason: "Descrição mais precisa", idempotencyKey: key });

  test("revises Media with its activity and replays the idempotent receipt", async () => {
    const id = await register("Orla");
    const applied = await ok("correct", correction(id, "Orla de Macaé"), { caller: { channel: "newsroom", editorId: "editor" }, now: now + 1 });
    expect(applied).toMatchObject({ status: "updated", media: { revision: 2, alt: "Orla de Macaé" } });
    expect(await ok("record", { kind: "activity", id: applied.correlationId })).toMatchObject({ body: { operation: "media.correctionApplied", reason: "Descrição mais precisa", targetId: id } });
    expect(await ok("correct", correction(id, "Orla de Macaé"), { caller: { channel: "newsroom", editorId: "editor" } })).toEqual({ ...applied, status: "replayed" });
    expect(await ok("correct", correction(id, "Outra"), { caller: { channel: "newsroom", editorId: "editor" } })).toEqual({ status: "conflict", code: "idempotency_conflict" });
    expect(await ok("correct", correction(id, "Outra", "late"), { caller: { channel: "newsroom", editorId: "editor" } })).toEqual({ status: "conflict", code: "revision_conflict", currentRevision: 2 });
    expect(await ok("revisions", id)).toHaveLength(1);
  });

  test("refuses a caller without a live editor role before touching the Media", async () => {
    const id = await register("Orla");
    expect(await call("correct", correction(id, "Orla de Macaé"), { caller: { channel: "newsroom", editorId: "editor" }, denied: true })).toMatchObject({ message: "Papel editorial inativo." });
    expect(await ok("get", id)).toMatchObject({ revision: 1, alt: "Orla" });
  });
});
