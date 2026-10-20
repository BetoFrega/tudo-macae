import { expect, test } from "vitest";
import { createPhotoInventory, sourcePhotoOperationId, unresolvedCleanup, type PhotoInventoryOwner, type PhotoInventoryObject, type PhotoInventoryInput, type PhotoInventoryDependencies } from "../inventory";
import { createPhotoTransfer } from "../transfer";
import { fixture } from "./fixture";
import { createHash } from "node:crypto";
import { z } from "zod";

const generate = (input: PhotoInventoryInput, dependencies: PhotoInventoryDependencies) => createPhotoInventory(dependencies).generate(input);

const bytes = new Uint8Array([1, 2, 3]);
const object = (path: string): PhotoInventoryObject => ({ path, generation: "generation-7", size: bytes.length, mimeType: "image/png", file: "original.png" });
const profile: PhotoInventoryOwner = { kind: "profile", id: "profile", sourceVersion: "document-7", body: { revision: 7, photoPath: "profile-photos/profile/old.png" } };
function dependencies() {
  const saved: { item: Parameters<PhotoInventoryDependencies["save"]>[0];
    bytes: Uint8Array; }[] = [];
  const read: string[] = [];
  return { saved, read, input: { newId: () => crypto.randomUUID(), digest: async () => "a".repeat(64),
    read: async (value: PhotoInventoryObject) => {
      read.push(value.path);
      return { bytes, generation: value.generation, mimeType: value.mimeType };
    },
    save: async (item: Parameters<PhotoInventoryDependencies["save"]>[0], value: Uint8Array) => {
      saved.push({ item, bytes: value });
    },
  } };
}
test("inventory preserves originals, legacy IDs, captions and revisions and produces a transferable selection", async () => {
  const f = fixture();
  const owner = f.owner("ad");
  owner.id = "anúncio antigo";
  owner.revision = 7;
  const path = `ad-images/${owner.id}/old.png`;
  owner.images = [{ id: "legacy-photo", path, order: 0, title: "Título", description: "Legenda" }];
  f.owners.set(`ad:${owner.id}`, owner);
  const saved: Parameters<typeof createPhotoTransfer>[0]["source"] = async () => ({ bytes, mimeType: "image/png", generation: "generation-7" });
  let selected: unknown;
  const result = await generate({ owners: [{ kind: "ad", id: owner.id, sourceVersion: "document-7", body: { revision: 7, images: owner.images } }], objects: [object(path)], retiredPaths: [], cleanupPaths: [] }, {
    ...f.dependencies, read: async () => ({ bytes, mimeType: "image/png", generation: "generation-7" }), save: async (item, original) => {
      selected = item;
      expect(original).toEqual(bytes);
    },
  });
  expect(result).toMatchObject({ selected: 1, blocked: 0, references: 1 });
  expect(selected).toMatchObject({ id: "legacy-photo", path, expectedRevision: 7, sourceGeneration: "generation-7", mimeType: "image/png", title: "Título", description: "Legenda" });
  const transfer = createPhotoTransfer({ ...f.dependencies, source: saved });
  expect(await transfer.importItem(selected, true)).toMatchObject({ status: "verified" });
});
test("accounting covers pending, cleanup, retired, unreferenced and out-of-scope objects without reading them", async () => {
  const d = dependencies();
  const paths = ["profile-photos/profile/pending.png", "profile-photos/profile/cleanup.png", "profile-photos/profile/retired.png", "profile-photos/profile/orphan.png", "media/blog.png"];
  const result = await generate({ owners: [{ ...profile, body: { ...profile.body, pendingImageUploadReservations: [{ path: paths[0]! }] } }], objects: paths.map(object), retiredPaths: [paths[2]!], cleanupPaths: [paths[1]!] }, d.input);
  expect(result.accounting).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: profile.body.photoPath, disposition: "blocked", cause: "missing_object" }),
    { path: paths[0], disposition: "blocked", cause: "upload_pending" },
    { path: paths[1], disposition: "blocked", cause: "cleanup_unresolved" },
    ...([undefined, undefined, "retired", "unreferenced", "outside_scope"] as const).flatMap((disposition, index) => disposition ? [{ path: paths[index], disposition }] : []),
  ]));
  expect(result).toMatchObject({ selected: 0, blocked: 3 });
  expect(d.read).toEqual([]);
  expect(d.saved).toEqual([]);
});
test("a pending ad image blocks the export instead of importing a draft D1 cannot publish", async () => {
  const d = dependencies();
  const path = "ad-images/ad/pending/photo.png";
  const owner: PhotoInventoryOwner = { kind: "ad", id: "ad", sourceVersion: "v1", body: { images: [{ id: "photo", path, pending: true }] } };
  const result = await generate({ owners: [owner], objects: [object(path)], retiredPaths: [], cleanupPaths: [] }, d.input);
  expect(result.accounting).toEqual([expect.objectContaining({ path, disposition: "blocked", cause: "upload_pending" })]);
  expect(d.read).toEqual([]);
});
test.each(["duplicate", "unmanaged", "deleting", "profile_missing", "unsupported", "source_diverged"])("blocks %s references without silently omitting them", async (failure) => {
  const d = dependencies();
  let owners = [profile];
  const objects = [object(String(profile.body.photoPath))];
  let cause = "";
  if (failure === "duplicate") {
    owners = [profile, { kind: "ad", id: "ad", sourceVersion: "v1", body: { images: [{ id: "photo", path: String(profile.body.photoPath) }] } }];
    cause = "duplicate_reference";
  }
  if (failure === "unmanaged") {
    owners = [{ ...profile, body: { photoPath: "media/shared.png" } }];
    cause = "unmanaged_reference";
  }
  if (failure === "deleting") {
    owners = [{ ...profile, body: { ...profile.body, deleting: true } }];
    cause = "owner_deleting";
  }
  if (failure === "profile_missing") {
    owners = [{ kind: "ad", id: "ad", sourceVersion: "v1", body: { advertiserProfileId: "absent", images: [{ id: "photo", path: "ad-images/ad/photo.png" }] } }];
    cause = "profile_missing";
  }
  if (failure === "unsupported") {
    objects[0] = { ...objects[0]!, size: 2_000_000 };
    cause = "unsupported_object";
  }
  if (failure === "source_diverged") {
    d.input.read = async () => ({ bytes, generation: "changed", mimeType: "image/png" });
    cause = "source_diverged";
  }
  const result = await generate({ owners, objects, retiredPaths: [], cleanupPaths: [] }, d.input);
  expect(result.accounting).toContainEqual(expect.objectContaining({ disposition: "blocked", cause }));
  expect(d.saved).toEqual([]);
});
test("rejects ambiguous metadata, owner duplicates and missing document versions", async () => {
  const d = dependencies();
  const input = { owners: [profile], objects: [object(String(profile.body.photoPath))], retiredPaths: [], cleanupPaths: [] };
  await expect(generate({ ...input, objects: [...input.objects, ...input.objects] }, d.input)).rejects.toThrow("DuplicateInventoryObject");
  await expect(generate({ ...input, owners: [profile, profile] }, d.input)).rejects.toThrow("DuplicateInventoryOwner");
  await expect(generate({ ...input, owners: [{ ...profile, sourceVersion: "" }] }, d.input)).rejects.toThrow();
  expect(d.saved).toEqual([]);
});

test.each([
  ["an in-flight owner claim", { pendingImageCleanupClaims: [String(profile.body.photoPath)] }, [], []],
  ["a queued cleanup job over a retirement marker", {}, [String(profile.body.photoPath)], [String(profile.body.photoPath)]],
])("unresolved cleanup from %s blocks the export instead of omitting the photo", async (_, body, cleanupPaths, retiredPaths) => {
  const d = dependencies();
  const path = String(profile.body.photoPath);
  const result = await generate({ owners: [{ ...profile, body: { ...profile.body, ...body } }], objects: [object(path)], retiredPaths, cleanupPaths }, d.input);
  expect(result.accounting).toContainEqual(expect.objectContaining({ path, disposition: "blocked", cause: "cleanup_unresolved" }));
  expect(result).toMatchObject({ selected: 0, blocked: 1 });
  expect(d.read).toEqual([]);
});
test("only cleanup jobs their legacy sweeper has not completed stay unresolved", () => {
  expect([{}, { status: "pending" }, { status: "processing" }, { status: "completed" }, { status: "success" }].map(unresolvedCleanup))
    .toEqual([true, true, true, false, false]);
});

test("operation IDs are stable per source path and generation, so a repeated export resumes the same transfer", async () => {
  const digest = async (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  const first = await sourcePhotoOperationId(object("profile-photos/profile/old.png"), digest);
  expect(z.uuid().parse(first)).toBe(first);
  expect(await sourcePhotoOperationId(object("profile-photos/profile/old.png"), digest)).toBe(first);
  expect(await sourcePhotoOperationId({ path: "profile-photos/profile/old.png", generation: "generation-8" }, digest)).not.toBe(first);
  expect(await sourcePhotoOperationId(object("profile-photos/other/old.png"), digest)).not.toBe(first);
  const exported = async () => {
    const { saved, input } = dependencies();
    await generate({ owners: [profile], objects: [object("profile-photos/profile/old.png")], retiredPaths: [], cleanupPaths: [] }, { ...input, newId: value => sourcePhotoOperationId(value, digest) });
    return saved.map(entry => entry.item.operationId);
  };
  expect(await exported()).toEqual([first]);
  expect(await exported()).toEqual([first]);
});
