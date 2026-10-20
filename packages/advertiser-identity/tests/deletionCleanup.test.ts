import { expect, test } from "vitest";
import { profileDeletionImageCleanup } from "../deletionCleanup";
import { isAdImagePath, adImageDirectoryPrefix } from "@tudomacae/ads/imagePath";

const ownsPath = (adId: string, path: string) => path.startsWith(`ad-images/${adId}/`);

test.each(["negócio", "legacy id", "_legacy"])("profile deletion preserves a historical raw photo owned by %s", (id) => {
  const path = `ad-images/${id}/foto antiga.png`;
  expect(() => profileDeletionImageCleanup([{ id, images: [{ path }] }], isAdImagePath, 1000))
    .toThrow("Seus dados continuam salvos");
});

test("a foreign hashed directory is not attributed to the literal legacy ad", () => {
  const path = `${adImageDirectoryPrefix("negócio")}photo.png`;
  expect(profileDeletionImageCleanup([{ id: "_legacy", images: [{ path }] }], isAdImagePath, 1000))
    .toEqual({ jobs: [], skippedCount: 1 });
});

test("profile deletion defers cleanup of an editor photo whose writer can still finish", () => {
  const path = "ad-images/ad-1/pending/editor.webp";
  expect(profileDeletionImageCleanup([{
    id: "ad-1", images: [{ path, pending: true }],
  }], ownsPath, 1000)).toEqual({
    jobs: [{ adId: "ad-1", path, dueAt: 1_201_000 }], skippedCount: 0,
  });
});

test("deleting a profile retains unique cleanup work for saved and queued ad photos", () => {
  const path = "ad-images/ad-1/pending/saved.webp";
  expect(profileDeletionImageCleanup([{
    id: "ad-1",
    images: [{ path }],
    pendingImageCleanupPaths: [path, "ad-images/ad-1/pending/removed.webp"],
    pendingImageCleanupClaims: ["ad-images/ad-1/pending/claimed.webp"],
  }], ownsPath, 1000)).toEqual({ jobs: [
    { adId: "ad-1", path, dueAt: 1_201_000, writerCompleted: true },
    { adId: "ad-1", path: "ad-images/ad-1/pending/removed.webp", dueAt: 1_201_000 },
    { adId: "ad-1", path: "ad-images/ad-1/pending/claimed.webp", dueAt: 1_201_000 },
  ], skippedCount: 0 });
});

test("deletion waits for uploads and ignores paths outside the ad", () => {
  expect(() => profileDeletionImageCleanup([{ id: "ad-1", pendingImageUploadReservations: [{ path: "ad-images/ad-1/pending/upload.webp" }] }], ownsPath, 1000))
    .toThrow("Aguarde o envio das fotos terminar antes de excluir o perfil.");
  expect(profileDeletionImageCleanup([{ id: "ad-1", images: [{ path: "ad-images/another/photo.webp" }] }], ownsPath, 1000))
    .toEqual({ jobs: [], skippedCount: 1 });
});

test("a linked reservation does not block deletion after its release failed", () => {
  const path = "ad-images/ad-1/pending/linked.webp";
  expect(profileDeletionImageCleanup([{
    id: "ad-1", images: [{ path }], pendingImageUploadReservations: [{ path, expiresAt: 2000 }],
  }], ownsPath, 1000)).toEqual({ jobs: [{ adId: "ad-1", path, writerCompleted: true }], skippedCount: 0 });
});

test("expired unlinked reservations retain cleanup work while live uploads block deletion", () => {
  const path = "ad-images/ad-1/pending/expired.webp";
  const record = { id: "ad-1", pendingImageUploadReservations: [{ path, expiresAt: 1000 }] };
  expect(profileDeletionImageCleanup([record], ownsPath, 1000))
    .toEqual({ jobs: [{ adId: "ad-1", path }], skippedCount: 0 });
  expect(() => profileDeletionImageCleanup([record], ownsPath, 999))
    .toThrow("Aguarde o envio das fotos terminar antes de excluir o perfil.");
});

test("profile deletion retains the delay of a canceled editor upload", () => {
  const path = "ad-images/ad-1/pending/canceled.webp";
  expect(profileDeletionImageCleanup([{ id: "ad-1", images: [], pendingImageCleanupPaths: [path] }], ownsPath, 1000))
    .toEqual({ jobs: [{ adId: "ad-1", path, dueAt: 1_201_000 }], skippedCount: 0 });
});
