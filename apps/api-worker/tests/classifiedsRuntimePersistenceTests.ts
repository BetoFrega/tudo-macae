import { expect, test } from "vitest";
import { appendFile } from "node:fs/promises";
import { z } from "zod";
import { createClassifiedsPersistence } from "../classifieds";
import { PersistenceLimit, type PersistenceMetrics } from "@tudomacae/classifieds-persistence";
import { restartRuntime, now, profile, ad, category, intent, call, save, barrier, classifiedsDatabase } from "./classifiedsRuntimeHarness";

test.each(["sync", "async"])("%s observer failure preserves the D1 commit and receipt replay", async (mode) => {
  const database = await classifiedsDatabase();
  const store = createClassifiedsPersistence({ database, observe: () => {
    if (mode === "sync") throw new Error("Telemetry unavailable");
    return Promise.reject(new Error("Telemetry unavailable"));
  } });
  const operation = { actorId: "admin", key: "observer", operation: "save", input: { id: "profile" } };
  expect(await store.transact(operation, async (tx) => {
    await tx.read("profile", "profile");
    tx.put({ kind: "profile", id: "profile", body: { title: "Negócio", createdAt: now } });
    return { id: "profile" };
  })).toEqual({ value: { id: "profile" }, replayed: false });
  expect(await store.read("profile", "profile")).toMatchObject({ body: { title: "Negócio", createdAt: now } });
  expect(await store.transact(operation, async () => {
    throw new Error("Replay must not repeat the decision");
  })).toEqual({ value: { id: "profile" }, replayed: true });
  // Give a rejected observer its turn; an unhandled rejection must fail this test.
  await new Promise(resolve => setTimeout(resolve, 0));
});

test.each(["put", "remove"] as const)("a caught %s command limit leaves the rejected command unstaged", async (mode) => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const ids = Array.from({ length: 17 }, (_, index) => `command-${index}`);
  if (mode === "remove") {
    expect((await call({ action: "importRecords", records: ids.map(id => ({ kind: "audit", id, body: {} })) })).error).toBeUndefined();
  }
  await store.transact(null, async (tx) => {
    await Promise.all(ids.map(id => tx.read("audit", id)));
    for (const id of ids.slice(0, 16)) {
      if (mode === "put") tx.put({ kind: "audit", id, body: {} });
      else tx.remove("audit", id);
    }
    expect(() => {
      if (mode === "put") tx.put({ kind: "audit", id: ids[16]!, body: {} });
      else tx.remove("audit", ids[16]!);
    }).toThrow(PersistenceLimit);
    return null;
  });
  expect((await Promise.all(ids.slice(0, 16).map(id => store.read("audit", id)))).map(Boolean)).toEqual(Array.from({ length: 16 }, () => mode === "put"));
  expect(Boolean(await store.read("audit", ids[16]!))).toBe(mode === "remove");
});

test("a caught aggregate byte limit preserves the prior staged command", async () => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  await store.transact(null, async (tx) => {
    for (let index = 0; index < 5; index++) {
      const id = `body-${index}`;
      await tx.read("audit", id);
      tx.put({ kind: "audit", id, body: { evidence: "x".repeat(805_000) } });
    }
    expect(() => tx.put({ kind: "audit", id: "body-0", body: { evidence: "x".repeat(900_000) } })).toThrow(PersistenceLimit);
    return null;
  });
  expect((await store.read("audit", "body-0"))?.body.evidence).toHaveLength(805_000);
});

test("shared deletion correlation keeps separate audits/photo jobs and bounded audit expiry preserves receipts", async () => {
  await save(profile("left"), profile("right"));
  const deletes: object[] = [];
  for (const id of ["left", "right"]) {
    const current = z.object({ version: z.number() }).parse((await call({ action: "manifest", id })).value);
    const input = { action: "delete", id, version: current.version, now, correlationId: "shared-request", intent: { actorId: "admin", key: id, operation: "deleteIdentity", input: { id } }, result: { id } };
    deletes.push(input);
    expect((await call(input)).error).toBeUndefined();
  }
  const deadline = now + 365 * 24 * 60 * 60 * 1000;
  const audits = z.object({ items: z.array(z.object({ id: z.string(), body: z.object({ correlationId: z.string(), expiresAt: z.number(), reason: z.string() }) })), version: z.number() }).parse((await call({ action: "page", query: { kind: "audit" } })).value);
  expect(new Set(audits.items.map(item => item.id)).size).toBe(2);
  expect(audits.items.every(item => item.body.correlationId === "shared-request" && item.body.expiresAt === deadline && item.body.reason === "Solicitado")).toBe(true);
  const photos = z.object({ items: z.array(z.unknown()) }).parse((await call({ action: "page", query: { kind: "photoCleanup" } })).value);
  expect(photos.items).toHaveLength(2);
  expect((await call({ action: "expireAudits", now: deadline - 1 })).value).toBe(0);
  await save(...Array.from({ length: 16 }, (_, index) => ({ kind: "audit", namespace: "legacy", id: `expired-${index}`, body: { expiresAt: deadline } })));
  await save({ kind: "audit", id: "future", body: { expiresAt: deadline + 1 } }, { kind: "audit", id: "no-deadline", body: {} });
  const beforeExpiry = z.object({ version: z.number() }).parse((await call({ action: "page", query: { kind: "audit" } })).value);
  expect((await call({ action: "expireAudits", now: deadline })).value).toBe(16);
  expect((await call({ action: "expireAudits", now: deadline })).value).toBe(2);
  expect((await call({ action: "expireAudits", now: deadline })).value).toBe(0);
  expect((await call({ action: "page", query: { kind: "audit" }, version: beforeExpiry.version })).error).toBe("PersistenceConflict");
  const retained = z.object({ items: z.array(z.object({ id: z.string() })) }).parse((await call({ action: "page", query: { kind: "audit" } })).value);
  expect(retained.items.map(item => item.id)).toEqual(["future", "no-deadline"]);
  for (const input of deletes) expect((await call(input)).value).toMatchObject({ replayed: true });
  expect(z.object({ items: z.array(z.unknown()) }).parse((await call({ action: "page", query: { kind: "photoCleanup" } })).value).items).toHaveLength(2);
});

test("audit expiry avoids scanning unexpired historical audits", async () => {
  const metrics: PersistenceMetrics[] = [];
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase(), observe: (value) => {
    metrics.push(value);
  } });
  expect(await store.expireAudits(now)).toBe(0);
  const baseline = metrics.at(-1)!.rowsRead;
  expect((await call({ action: "importRecords", records: Array.from({ length: 100 }, (_, index) => ({ kind: "audit", id: `future-${index}`, body: { expiresAt: now + 1 } })) })).error).toBeUndefined();
  expect(await store.expireAudits(now)).toBe(0);
  const after = metrics.at(-1)!.rowsRead;
  expect(after).toBe(baseline);
  if (process.env.CLASSIFIEDS_ENVELOPE_OUTPUT) await appendFile(process.env.CLASSIFIEDS_ENVELOPE_OUTPUT, `${JSON.stringify({ workload: "audit-expiry", unexpired: 100, beforeRowsRead: baseline, afterRowsRead: after })}\n`);
});

test("profile revision, associated membership and duplicate indices advance together", async () => {
  await save(profile(), ad());
  const first = await call({ action: "manifest", id: "profile" });
  const parsed = z.object({ version: z.number(), adCount: z.number(), profile: z.object({ body: z.object({ revision: z.number() }) }) }).parse(first.value);
  expect(parsed.adCount).toBe(1);
  expect(parsed.profile.body.revision).toBe(1);
  await save({ ...profile(), body: { ...profile().body, title: "Novo título", revision: 900 } });
  const updated = await call({ action: "read", kind: "profile", id: "profile" });
  expect(z.object({ body: z.object({ revision: z.number() }) }).parse(updated.value).body.revision).toBe(2);
  const found = await call({ action: "page", query: { kind: "profile", contact: "22999999999" } });
  expect(z.object({ items: z.array(z.unknown()) }).parse(found.value).items).toHaveLength(1);
  const stale = await call({ action: "delete", id: "profile", version: parsed.version, intent: intent("old") });
  expect(stale.error).toBe("PersistenceConflict");
});

test.each(["category", "profile", "ad", "catalog"] as const)("global %s read/removal rejects a namespace without committing a receipt", async (kind) => {
  const record = kind === "category"
    ? category("global")
    : kind === "profile"
      ? profile("global")
      : kind === "ad"
        ? ad("global")
        : { kind, id: "global", body: { enabled: true, revision: 1, items: [] } };
  await save(record);
  expect((await call({ action: "read", kind, id: "global", namespace: "parent" })).error).toBe("TypeError");
  const operation = { actorId: "admin", key: `remove-${kind}`, operation: "remove", input: { kind, id: "global" } };
  expect((await call({ action: "transaction", remove: [{ kind, id: "global", namespace: "parent" }], intent: operation })).error).toBe("TypeError");
  expect((await call({ action: "read", kind, id: "global" })).value).not.toBeNull();
  const corrected = await call({ action: "transaction", remove: [{ kind, id: "global" }], intent: operation });
  expect(corrected.error).toBeUndefined();
  expect(z.object({ replayed: z.boolean() }).parse(corrected.value).replayed).toBe(false);
  expect((await call({ action: "read", kind, id: "global" })).value).toBeNull();
});

test.each(["insert", "remove", "edit", "move"])("confirmation rejects concurrent associated %s", async (change) => {
  await save(profile(), ad());
  const current = await call({ action: "manifest", id: "profile" });
  const version = z.object({ version: z.number() }).parse(current.value).version;
  if (change === "insert") await save(ad("new"));
  if (change === "edit") await save({ ...ad(), body: { ...ad().body, title: "Mudou" } });
  if (change === "move") await save(ad("ad", "elsewhere"));
  if (change === "remove") expect((await call({ action: "transaction", remove: [{ kind: "ad", id: "ad" }] })).error).toBeUndefined();
  expect((await call({ action: "delete", id: "profile", version, intent: intent("stale") })).error).toBe("PersistenceConflict");
  expect((await call({ action: "read", kind: "profile", id: "profile" })).value).not.toBeNull();
});

test("absence create/delete ABA retries instead of silently committing stale reads", async () => {
  const gate = barrier("absence");
  const pending = call({ action: "transaction", records: [profile()], barrier: "absence" });
  await gate.ready;
  await save(profile());
  await call({ action: "transaction", remove: [{ kind: "profile", id: "profile" }] });
  gate.release();
  const result = await pending;
  expect(z.object({ value: z.object({ attempts: z.number() }) }).parse(result.value).value.attempts).toBe(2);
});

test("query membership retries a decision with fresh state", async () => {
  await save(profile());
  const gate = barrier("membership");
  const pending = call({ action: "transaction", records: [category("category")], query: { kind: "ad", profileId: "profile" }, barrier: "membership" });
  await gate.ready;
  await save(ad());
  gate.release();
  const result = await pending;
  expect(z.object({ value: z.object({ attempts: z.number() }) }).parse(result.value).value.attempts).toBe(2);
});

test("business rejection on stale reads is re-evaluated; a stable rejection stays a rejection", async () => {
  await save(profile());
  const gate = barrier("rejection");
  const pending = call({ action: "transaction", records: [profile()], barrier: "rejection", fail: true });
  await gate.ready;
  await save(profile());
  gate.release();
  expect((await pending).message).toBe("fixture-decision-rejected");
});

test("failed SQL rolls back earlier writes, revisions, projections and receipt", async () => {
  await save(profile(), category("occupied", "same"));
  const failed = await call({ action: "transaction", records: [profile(), category("collision", "same")], intent: intent("rollback") });
  expect(failed.message).toContain("UNIQUE constraint failed");
  const current = await call({ action: "read", kind: "profile", id: "profile" });
  expect(z.object({ body: z.object({ revision: z.number() }) }).parse(current.value).body.revision).toBe(1);
  await save(category("free"));
  const corrected = await call({ action: "transaction", records: [profile()], intent: intent("rollback") });
  expect(corrected.error).toBeUndefined();
});

test("lost response/restart replays durable receipt and rejects another intent", async () => {
  await save(profile(), ad());
  const manifest = await call({ action: "manifest", id: "profile" });
  const version = z.object({ version: z.number() }).parse(manifest.value).version;
  const input = { action: "delete", id: "profile", version, intent: intent("durable"), result: { deletedAds: 1 } };
  expect((await call({ ...input, lostResponse: true })).message).toBe("fixture-response-lost");
  await restartRuntime();
  expect((await call(input)).value).toEqual({ value: { deletedAds: 1 }, replayed: true });
  expect((await call({ ...input, intent: { ...intent("durable"), input: { id: "another" } } })).error).toBe("IdempotencyConflict");
  expect((await call({ action: "read", kind: "profile", id: "profile" })).value).toBeNull();
  const jobs = await call({ action: "page", query: { kind: "adCleanup" } });
  expect(z.object({ items: z.array(z.object({ body: z.object({ writerCompleted: z.literal(true) }) })) }).parse(jobs.value).items).toHaveLength(1);
  const audits = z.object({ items: z.array(z.object({ body: z.object({ reason: z.string(), channel: z.string(), actorId: z.string() }) })) }).parse((await call({ action: "page", query: { kind: "audit" } })).value);
  expect(audits.items.map(item => item.body)).toEqual([{ reason: "Solicitado", channel: "administration", actorId: "admin" }]);
  expect((await call({ ...input, audit: { reason: "Outro motivo" } })).error).toBe("IdempotencyConflict");
});

test("profile/catalog lookups remain indexed as unrelated identities grow", async () => {
  const catalog = (id: string) => ({ kind: "catalog", id, body: { enabled: true, revision: 1, items: [] } });
  await save(profile(), catalog("profile"));
  const before = await call({ action: "manifest", id: "profile" });
  const beforeWrite = await save(profile());
  for (let start = 0; start < 100; start += 8) {
    const records = Array.from({ length: Math.min(8, 100 - start) }, (_, index) => `unrelated-${start + index}`).flatMap(id => [profile(id), catalog(id)]);
    await save(...records);
  }
  const after = await call({ action: "manifest", id: "profile" });
  const afterWrite = await save(profile());
  expect(after.metrics.find(item => item.operation === "manifest")!.rowsRead).toBe(before.metrics.find(item => item.operation === "manifest")!.rowsRead);
  // Index maintenance may visit another B-tree level; it must not scan the added profiles.
  expect(afterWrite.metrics.find(item => item.operation === "commit")!.rowsRead).toBeLessThanOrEqual(beforeWrite.metrics.find(item => item.operation === "commit")!.rowsRead + 4);
  if (process.env.CLASSIFIEDS_ENVELOPE_OUTPUT) await appendFile(process.env.CLASSIFIEDS_ENVELOPE_OUTPUT, `${JSON.stringify({ workload: "unrelated-identities", unrelated: 100, before: { manifest: before.metrics, write: beforeWrite.metrics }, after: { manifest: after.metrics, write: afterWrite.metrics } })}\n`);
  const version = z.object({ version: z.number() }).parse((await call({ action: "manifest", id: "profile" })).value).version;
  expect((await call({ action: "delete", id: "profile", version, intent: intent("point-delete") })).error).toBeUndefined();
  expect((await call({ action: "read", kind: "catalog", id: "unrelated-99" })).value).not.toBeNull();
});

test.each(["active", "missing", "legacy"])("deletion blocks %s image evidence without deleting anything", async (kind) => {
  const value = ad();
  const body = { ...value.body,
    ...(kind === "legacy"
      ? { images: [{ path: "ad-images/ad/../unsafe.jpg", order: 0 }] }
      : { pendingImageUploadReservations: [{ path: "ad-images/ad/unlinked.jpg", ...(kind === "active" ? { expiresAt: now + 1 } : {}) }] }),
  };
  await save(profile(), { ...value, body });
  const version = z.object({ version: z.number() }).parse((await call({ action: "manifest", id: "profile" })).value).version;
  expect((await call({ action: "delete", id: "profile", version, intent: intent(kind) })).error).toBe("IdentityCleanupBlocked");
  expect((await call({ action: "read", kind: "ad", id: "ad" })).value).not.toBeNull();
});

test("byte-limited pages retain a coherent version across inserts and bodies", async () => {
  for (let n = 0; n < 5; n++) await save({ ...ad(`large-${n}`), body: { ...ad(`large-${n}`).body, text: "x".repeat(300_000) } });
  const page = z.object({ items: z.array(z.unknown()), version: z.number(), next: z.string() }).parse((await call({ action: "page", query: { kind: "ad", profileId: "profile" } })).value);
  expect(page.items).toHaveLength(3);
  await save(ad("new"));
  expect((await call({ action: "page", query: { kind: "ad", profileId: "profile", after: page.next }, version: page.version })).error).toBe("PersistenceConflict");
});
