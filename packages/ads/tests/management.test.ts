import { expect, test } from "vitest";
import { createAdManagement } from "../management";
import type { AdData, AdRecord } from "../types";

function fixture(canReadOwned?: (input: { ad: AdData; userId: string; isAdmin: boolean }) => boolean) {
  const records = new Map<string, AdData>();
  const removed: string[] = [];
  const management = createAdManagement({
    ...(canReadOwned ? { canReadOwned } : {}),
    store: {
      async create(record: AdRecord) {
        records.set("ad-1", { ...record, id: "ad-1", createdAt: 100 });
        return "ad-1";
      },
      async getById(id: string) { return records.get(id) ?? null; },
      async getAll() { return [...records.values()]; },
      async getByUserId(userId: string) { return [...records.values()].filter(ad => ad.userId === userId); },
      async getActiveByProfileId(profileId: string) { return [...records.values()].filter(ad => ad.advertiserProfileId === profileId && ad.status === "active"); },
      async getPendingImageCleanupPaths() { return ["ads/ad-1/orphan.webp"]; },
      async delete(id: string) { records.delete(id); },
    },
    async removeDirectory(input) { removed.push(...input.paths); },
  });
  return { management, records, removed };
}

test("creates a published ad and authorizes access by UID or admin authority", async () => {
  const { management } = fixture();
  expect(await management.create({ userId: "owner", advertiserProfileId: "profile", categoryId: "category", subcategoryId: "subcategory", title: "Serviço em Macaé", text: "Descrição do serviço oferecido na cidade" }))
    .toEqual({ id: "ad-1", slug: "servico-em-macae" });
  expect(await management.read({ id: "ad-1" })).toMatchObject({ status: "active", images: [], userId: "owner" });
  await expect(management.readOwned({ id: "ad-1", userId: "stranger" })).rejects.toThrow("Unauthorized");
  expect(await management.readOwned({ id: "ad-1", userId: "owner" })).toMatchObject({ id: "ad-1" });
  expect(await management.readOwned({ id: "ad-1", userId: "admin", isAdmin: true })).toMatchObject({ id: "ad-1" });
});

test("missing owned ads preserve the typed not-found outcome", async () => {
  const { management } = fixture();
  await expect(management.readOwned({ id: "missing", userId: "owner" })).rejects.toMatchObject({ name: "AdOperationError", code: "not-found" });
});

test("revokes all current and pending images before deleting and supports resumption", async () => {
  const { management, records, removed } = fixture();
  records.set("ad-1", { id: "ad-1", categoryId: "c", subcategoryId: "s", advertiserProfileId: "p", title: "Foto", slug: "foto", text: "Texto", userId: "owner", status: "paused", createdAt: 100,
    images: [{ id: "image", path: "ads/ad-1/photo.webp", order: 0, pending: true }] });
  await management.delete({ id: "ad-1" });
  expect(removed).toEqual(["ads/ad-1/photo.webp", "ads/ad-1/orphan.webp"]);
  expect(await management.read({ id: "ad-1" })).toBeNull();
  await management.delete({ id: "ad-1" });
  expect(removed).toHaveLength(2);
});

test("lists only the requested owner and active profile ads while administration can read all", async () => {
  const { management, records } = fixture();
  const base: AdData = { id: "ad-1", categoryId: "c", subcategoryId: "s", advertiserProfileId: "profile", title: "Anúncio", slug: "anuncio", text: "Texto", userId: "owner", status: "active", images: [], createdAt: 100 };
  records.set("ad-1", base);
  records.set("ad-2", { ...base, id: "ad-2", userId: "other", status: "paused" });
  expect((await management.listForUser({ userId: "owner" })).map(ad => ad.id)).toEqual(["ad-1"]);
  expect((await management.listForProfile({ profileId: "profile" })).map(ad => ad.id)).toEqual(["ad-1"]);
  expect((await management.listAll()).map(ad => ad.id)).toEqual(["ad-1", "ad-2"]);
});

test("uses the composed current authority instead of historical UID for owned reads", async () => {
  const { management, records } = fixture(({ userId }) => userId === "current-owner");
  records.set("ad-1", { id: "ad-1", categoryId: "c", subcategoryId: "s", advertiserProfileId: "profile", title: "Anúncio", slug: "anuncio", text: "Texto", userId: "former-owner", status: "active", images: [], createdAt: 100 });
  expect(await management.readOwned({ id: "ad-1", userId: "current-owner" })).toMatchObject({ id: "ad-1", userId: "former-owner" });
  await expect(management.readOwned({ id: "ad-1", userId: "former-owner" })).rejects.toThrow("Unauthorized");
});
