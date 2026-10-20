import { expect, test } from "vitest";
import {
  createAdMutations,
  type AdMutationRecord,
  type AdMutationStore,
} from "../adMutations";

function setup(record: AdMutationRecord | null, profile: unknown, retiredPaths: string[] = [], profiles: Record<string, unknown> = {}, authorityMode: "legacy" | "identity" = "legacy") {
  const writes: unknown[] = [];
  const profileReads: string[] = [];
  const store: AdMutationStore = {
    async transact(_id, decide) {
      await decide({
        async read() { return record; },
        async readProfile(id) {
          profileReads.push(id);
          return profiles[id] ?? profile;
        },
        async readRetiredPaths() { return retiredPaths; },
        update(fields) { writes.push(fields); },
      });
    },
  };
  return { mutations: createAdMutations({ store, now: () => 1000, authorityMode }), writes, profileReads };
}

test("an edit cannot reattach a retired storage key under another image ID", async () => {
  const path = "ad-images/ad/retired.png";
  const { mutations, writes } = setup({ userId: "owner", images: [] }, null, [path]);
  await expect(mutations.update("ad", { images: [{ id: "new-id", path, order: 0 }] })).rejects.toThrow("foto foi removida");
  expect(writes).toEqual([]);
  await mutations.update("ad", { images: [{ id: "new-id", path: "ad-images/ad/new.png", order: 0 }] });
  expect(writes).toHaveLength(1);
});

test("activates only with the associated publishable profile inside the transaction", async () => {
  const { mutations, writes } = setup(
    { userId: "owner", advertiserProfileId: "profile" },
    { userId: "owner", title: "Ana", contacts: [{ number: "22999999999" }] },
  );

  await mutations.update("ad", { status: "active" });

  expect(writes).toEqual([{ status: "active", updatedAt: 1000 }]);
});

test.each([
  [null, ["title", "contact"]],
  [{ userId: "owner", title: "", contacts: [{ number: "22999999999" }] }, ["title"]],
  [{ userId: "owner", title: "Ana", contacts: [] }, ["contact"]],
] as const)("rejects an unavailable or incomplete associated profile", async (profile, missing) => {
  const { mutations, writes } = setup(
    { userId: "owner", advertiserProfileId: "profile" },
    profile,
  );

  await expect(mutations.update("ad", { status: "active" })).rejects.toMatchObject({
    requirement: "profile",
    missing,
  });
  expect(writes).toEqual([]);
});

test("normalizes the publishing marker when pausing without reading a profile", async () => {
  const { mutations, writes } = setup(
    { userId: "owner", publicationState: "publishing" },
    null,
  );

  await mutations.update("ad", { status: "paused" });

  expect(writes).toEqual([{
    status: "paused",
    publicationState: "published",
    updatedAt: 1000,
  }]);
});

test("an edit preserves the freshly finalized image and photos added after its snapshot", async () => {
  const path = "ad-images/ad/pending/photo.webp";
  const newPath = "ad-images/ad/pending/new.webp";
  const { mutations, writes } = setup({
    userId: "owner",
    images: [{ id: "photo", path, order: 0 }, { id: "new", path: newPath, order: 1, pending: true }],
  }, null);
  await mutations.update("ad", {
    images: [{ id: "photo", path, order: 0, title: "Edited", pending: true }],
    imageSnapshotIds: ["photo"],
  });
  expect(writes).toEqual([{
    images: [{ id: "photo", path, order: 0, title: "Edited" }, { id: "new", path: newPath, order: 1, pending: true }],
    updatedAt: 1000,
  }]);
});

test("a cancellation tombstones the image ID and queues object cleanup atomically", async () => {
  const path = "ad-images/ad/photo.webp";
  const { mutations, writes } = setup({ userId: "owner", images: [{ id: "photo", path, pending: true, order: 0 }] }, null);
  await mutations.update("ad", {
    images: [], imageSnapshotIds: ["photo"], cancelImageIds: ["photo"], cancelImagePaths: [path],
  });
  expect(writes).toEqual([{
    images: [], cancelledImageIds: ["photo"], pendingImageCleanupPaths: [path], updatedAt: 1000,
  }]);
});

test("reassigns only to a profile owned by the same advertiser", async () => {
  const allowed = setup(
    { userId: "owner", advertiserProfileId: "old-profile" },
    { userId: "owner", title: "Loja", contacts: [] },
  );
  await allowed.mutations.update("ad", { advertiserProfileId: "new-profile" });
  expect(allowed.writes).toEqual([{
    advertiserProfileId: "new-profile",
    updatedAt: 1000,
  }]);

  const denied = setup(
    { userId: "owner", advertiserProfileId: "old-profile" },
    { userId: "other", title: "Outra loja", contacts: [] },
    [],
    { "old-profile": { userId: "owner" }, "foreign-profile": { userId: "other" } },
  );
  await expect(denied.mutations.update("ad", {
    advertiserProfileId: "foreign-profile",
  })).rejects.toThrow("proprietário do anúncio");
  expect(denied.writes).toEqual([]);
});

test("uses the current identity owner when an ad has a historical creator UID", async () => {
  const ownerProfile = { userId: "current-owner", title: "Loja", contacts: [{ number: "22999999999" }] };
  const { mutations, writes } = setup(
    { userId: "former-owner", advertiserProfileId: "current-profile", status: "paused" },
    ownerProfile,
    [],
    { "current-profile": ownerProfile, "next-profile": ownerProfile },
    "identity",
  );

  await mutations.update("ad", { status: "active", advertiserProfileId: "next-profile" });

  expect(writes).toEqual([{ status: "active", advertiserProfileId: "next-profile", updatedAt: 1000 }]);
});

test("validates the status operation before opening a transaction", async () => {
  const { mutations, writes } = setup(
    { userId: "owner", advertiserProfileId: "profile" },
    { userId: "owner", title: "Ana", contacts: [{ number: "22999999999" }] },
  );

  await expect(mutations.updateStatus({ id: "", status: "active" })).rejects.toThrow(
    "Ad ID is required",
  );
  expect(writes).toEqual([]);
});

test("claimable profiles cannot be associated, activated or reactivated", async () => {
  const claimable = {
    claimable: true,
    title: "Loja",
    contacts: [{ number: "22999999999" }],
  };
  const association = setup(
    { userId: "owner", advertiserProfileId: "owned-profile" },
    claimable,
  );
  await expect(association.mutations.update("ad", {
    advertiserProfileId: "claimable-profile",
  })).rejects.toThrow("proprietário do anúncio");
  expect(association.writes).toEqual([]);

  const activation = setup(
    { userId: "owner", advertiserProfileId: "claimable-profile", status: "paused" },
    claimable,
  );
  await expect(activation.mutations.updateStatus({ id: "ad", status: "active" }))
    .rejects.toMatchObject({ requirement: "profile" });
  expect(activation.writes).toEqual([]);

  const reactivation = setup(
    { userId: "owner", advertiserProfileId: "claimable-profile", status: "paused" },
    claimable,
  );
  await expect(reactivation.mutations.update("ad", { status: "active" }))
    .rejects.toMatchObject({ requirement: "profile" });
  expect(reactivation.writes).toEqual([]);
});

test.each([false, true, "unknown"] as const)("classifies completed cleanup writers only from fresh image state: %s", async (pending) => {
  const path = "ad-images/ad/photo.webp";
  const images = pending === "unknown" ? [] : [{ id: "photo", path, order: 0, ...(pending ? { pending: true } : {}) }];
  const { mutations, writes } = setup({ userId: "owner", images }, null);
  await mutations.update("ad", { images: [], imageSnapshotIds: ["photo"], cancelImageIds: ["photo"], cancelImagePaths: [path] });
  expect(writes[0]).toMatchObject({ pendingImageCleanupPaths: [path] });
  if (pending === false) expect(writes[0]).toMatchObject({ completedWriterPaths: [path] });
  else expect(writes[0]).not.toHaveProperty("completedWriterPaths");
});

test("legacy pause and text edits keep their original profile-read cost, activation reads once", async () => {
  const { mutations, profileReads } = setup({ userId: "owner", advertiserProfileId: "profile" }, { userId: "owner", title: "Ana", contacts: [{ number: "22999999999" }] });
  await mutations.update("ad", { status: "paused" });
  await mutations.update("ad", { text: "Texto atualizado" });
  expect(profileReads).toEqual([]);
  await mutations.update("ad", { status: "active" });
  expect(profileReads).toEqual(["profile"]);
});

test("identity activation reuses the current profile inside its transaction", async () => {
  const { mutations, profileReads } = setup({ userId: "former-owner", advertiserProfileId: "profile" }, { userId: "holder", title: "Ana", contacts: [{ number: "22999999999" }] }, [], {}, "identity");
  await mutations.update("ad", { status: "active", advertiserProfileId: "profile" });
  expect(profileReads).toEqual(["profile"]);
});
