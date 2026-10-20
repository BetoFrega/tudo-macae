import { expect, test } from "vitest";
import { createClassifiedsArtifactIndex, createClassifiedsRecordCodec, encodeReceiptRecord, stableJson } from "../records";
import { createClassifiedsDeletionPolicy } from "../deletion";
import { parseTransferItem, transferFingerprint } from "../transfer";
import { IdentityCleanupBlocked, PersistenceLimit, type IdentityManifest } from "../index";
const codec = createClassifiedsRecordCodec();
const artifacts = createClassifiedsArtifactIndex({ ownsImagePath: (_id, path) => path === "ad-images/ad/current.jpg", cleanupJobId: path => `job:${path}` });
test.each(["category", "profile", "ad", "catalog"] as const)("global %s keys reject a namespace", (kind) => {
  expect(codec.key(kind, "record")).toEqual({ kind, id: "record", namespace: "" });
  expect(() => codec.key(kind, "record", "parent")).toThrow(TypeError);
});
test("subcategory keys require their parent category", () => {
  expect(() => codec.key("subcategory", "local-id")).toThrow(TypeError);
  expect(codec.key("subcategory", "local-id", "parent")).toEqual({ kind: "subcategory", id: "local-id", namespace: "parent" });
});
test("legacy fields, epoch ms and revision survive validation without changing source", () => {
  const value = { kind: "profile", id: "profile", sourceVersion: "100:200", body: { title: "Nome", createdAt: 1_700_000_000_000, legacy: { retained: true } } };
  const parsed = codec.parse(value);
  expect(parsed.body.revision).toBe(1);
  expect(parsed.body.legacy).toEqual({ retained: true });
  expect(value.body).not.toHaveProperty("revision");
  expect(parsed.sourceVersion).toBe("100:200");
});
test.each([-1, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid persisted epoch %s", (createdAt) => {
  expect(() => codec.parse({ kind: "profile", id: "p", body: { title: "Nome", createdAt } })).toThrow();
});
test.each(["invalid", null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("audit event timestamp rejects invalid at %s before transfer", (at) => {
  const record = { kind: "audit", id: "audit", body: { at } };
  expect(() => codec.parse(record)).toThrow();
  expect(() => parseTransferItem({ type: "record", record }, artifacts)).toThrow();
});
test.each([{ at: 0, legacy: "retained" }, { createdAt: 0, legacy: "retained" }])("audit validation preserves valid event epochs and legacy bodies: %j", (body) => {
  expect(codec.parse({ kind: "audit", id: "audit", body }).body).toEqual(body);
});
test.each(["invalid", null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("catalog provenance rejects invalid checkedAt %s before transfer", (checkedAt) => {
  const record = { kind: "catalog", id: "profile", body: { enabled: true, revision: 1, items: [
    { id: "item", name: "Item", description: "", visible: true, price: { mode: "on_request" }, source: { url: "https://example.com/item", checkedAt } },
  ] } };
  expect(() => codec.parse(record)).toThrow();
  expect(() => parseTransferItem({ type: "record", record }, artifacts)).toThrow();
});
test("catalog provenance keeps valid epochs and legacy fields without requiring a source", () => {
  const item = { id: "item", name: "Item", description: "", visible: true, price: { mode: "on_request" } };
  const source = { url: "https://example.com/item", checkedAt: 1_700_000_000_000, evidence: "retained" };
  expect(codec.parse({ kind: "catalog", id: "profile", body: { enabled: true, revision: 1, items: [item, { ...item, id: "sourced", source }] } })).toMatchObject({ body: { items: [item, { source }] } });
  expect(() => codec.parse({ kind: "catalog", id: "profile", body: { enabled: true, revision: 1, items: [{ ...item, source: { ...source, url: "invalid" } }] } })).toThrow();
});
test("rejects oversized UTF-8 rows before SQL without imposing a per-identity ad limit", () => {
  expect(() => codec.parse({ kind: "ad", id: "ad", body: { userId: "owner", createdAt: 0, status: "active", text: "á".repeat(600_000) } })).toThrow(PersistenceLimit);
});
test("projects normalized profile duplicate indices", () => {
  expect(codec.indexes(codec.parse({ kind: "profile", id: "p", body: { title: "  Café Ágil  ", createdAt: 0, contacts: [{ number: "(22) 99999-9999", isWhatsapp: true }] } }))).toEqual({ title: "cafe agil", contacts: ["22999999999"] });
});
test("duplicate expired reservation cannot hide a missing expiry; linked reservation is represented", () => {
  const record = codec.parse({ kind: "ad", id: "ad", body: { userId: "owner", status: "active", createdAt: 0, images: [{ path: "ad-images/ad/current.jpg" }], pendingImageUploadReservations: [{ path: "unlinked" }, { path: "unlinked", expiresAt: 1 }, { path: "ad-images/ad/current.jpg", expiresAt: 2 }] } });
  const result = artifacts.artifacts(record);
  expect(result.find(item => item.path === "unlinked")).toMatchObject({ expiresAt: null, reserved: 1, linked: 0, ownership: "foreign" });
  expect(result.find(item => item.path === "ad-images/ad/current.jpg")).toMatchObject({ linked: 1, completed: 1, ownership: "owned" });
});
test("raw legacy path blocks and foreign path is classified separately", () => {
  const record = codec.parse({ kind: "ad", id: "ad", body: { userId: "owner", status: "active", createdAt: 0, pendingImageCleanupClaims: ["ad-images/ad/old.jpg", "ad-images/other/photo.jpg"] } });
  expect(artifacts.artifacts(record).map(item => item.ownership)).toEqual(["legacy", "foreign"]);
});
test("canonical transfer comparison ignores object order and rejects invalid data", () => {
  const left = parseTransferItem({ type: "record", record: { kind: "audit", id: "audit", body: { b: 2, a: 1 } } }, artifacts);
  const right = parseTransferItem({ record: { body: { a: 1, b: 2 }, kind: "audit", id: "audit" }, type: "record" }, artifacts);
  expect(transferFingerprint(left)).toBe(transferFingerprint(right));
  expect(stableJson({ b: 2, a: 1 })).toBe("{\"a\":1,\"b\":2}");
  expect(() => parseTransferItem({ type: "record", record: { kind: "profile", id: "profile", body: { title: "Sem data" } } }, artifacts)).toThrow();
});
test("transfer preflight rejects small ad bodies whose artifact projection exceeds the storage envelope", () => {
  const record = { kind: "ad", id: "ad", body: { userId: "owner", status: "active", createdAt: 0,
    pendingImageCleanupClaims: Array.from({ length: 6000 }, (_, index) => `ad-images/ad/${String(index).padStart(6, "0")}.jpg`),
  } };
  expect(() => codec.parse(record)).not.toThrow();
  const projection = createClassifiedsArtifactIndex({ ownsImagePath: () => true, cleanupJobId: () => "a".repeat(64) });
  expect(() => projection.encode(codec.parse(record))).toThrow(PersistenceLimit);
  expect(() => parseTransferItem({ type: "record", record }, projection)).toThrow(PersistenceLimit);
});
test.each([
  { intent: { actorId: "管理".repeat(1100), key: "key", operation: "save", input: null }, result: null },
  { intent: { actorId: "admin", key: "key", operation: "save", input: "x".repeat(1_000_001) }, result: null },
  { intent: { actorId: "admin", key: "key", operation: "save", input: null }, result: "x".repeat(1_000_001) },
  { intent: { actorId: "admin", key: "key", operation: "save", input: "x".repeat(900_000) }, result: "x".repeat(900_000) },
])("transfer preflight rejects receipt envelopes rejected by persistence", (record) => {
  expect(() => encodeReceiptRecord(record)).toThrow();
  expect(() => parseTransferItem({ type: "receipt", record }, artifacts)).toThrow();
});
test("deletion decisions use the shared cleanup policy without a database", async () => {
  const policy = createClassifiedsDeletionPolicy();
  const manifest: IdentityManifest = { profile: { kind: "profile", id: "p", version: "v", body: { photoPath: "profile-photos/p/photo.jpg" } }, version: 1, adCount: 10000, catalogItemCount: 0, imageCount: 10000, activeReservations: 0, legacyImages: 0, skippedImages: 2 };
  expect(await policy.plan(manifest, 1000)).toEqual({ dueAt: 1000, pendingDueAt: 1_201_000, auditExpiresAt: 31_536_001_000, writerCompleted: true, ownedPhotoPath: "profile-photos/p/photo.jpg" });
  await expect(policy.plan({ ...manifest, activeReservations: 1 }, 1000)).rejects.toBeInstanceOf(IdentityCleanupBlocked);
  await expect(policy.plan({ ...manifest, legacyImages: 1 }, 1000)).rejects.toBeInstanceOf(IdentityCleanupBlocked);
  expect((await policy.plan({ ...manifest, profile: { ...manifest.profile!, body: { photoPath: "shared/photo.jpg" } } }, 1000)).ownedPhotoPath).toBeUndefined();
  expect(policy.audit({ reason: "  Duplicado  ", channel: "mcp" })).toEqual({ reason: "Duplicado", channel: "mcp" });
  expect(() => policy.audit({ reason: " " })).toThrow();
  await expect(policy.plan(manifest, Number.MAX_SAFE_INTEGER)).rejects.toThrow();
});
