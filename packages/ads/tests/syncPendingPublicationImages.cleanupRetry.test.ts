// @vitest-environment node
import { expect, test, vi } from "vitest";
import { createPendingPublicationImageSync, type PendingPhoto } from "../syncPendingPublicationImages";
import { pathFor } from "./syncPendingPublicationImagesFixtures";

test("a failed deletion remains queued and is retried after the photo replacement was saved", async () => {
  const id = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const path = `ad-images/${id}/pending/${photoId}.png`;
  let images: PendingPhoto[] = [{ id: photoId, path, title: "Frente", description: "", order: 0 }];
  let cleanupPaths: string[] = [];
  const remove = vi.fn().mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValue(undefined);
  const reportCleanupFailure = vi.fn();
  const sync = createPendingPublicationImageSync({
    pathFor: (publicationId, uploadId) => `ad-images/${publicationId}/pending/${uploadId}.png`,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async userId => userId === "owner" ? { id, userId, title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images } : null,
    upload: vi.fn(),
    scheduleCleanup: vi.fn(),
    claimCleanup: async (_id, _owner, path) => cleanupPaths.includes(path),
    replace: async (_id, _owner, _now, _operationId, build) => {
      const previous = images;
      images = build(images);
      cleanupPaths = [...new Set([...cleanupPaths, ...previous.filter(image => !images.some(next => next.path === image.path)).map(image => image.path)])];
      return { images, cleanupPaths };
    },
    remove,
    reportCleanupFailure,
    acknowledgeCleanup: async (_id, _owner, removedPath) => { cleanupPaths = cleanupPaths.filter(item => item !== removedPath); },
    now: () => 123,
  });
  const empty = new FormData();
  empty.set("images", "[]");
  empty.set("observedImageIds", JSON.stringify([photoId]));
  empty.set("observedImages", JSON.stringify(images));
  expect(await sync.sync("owner", id, empty, "operation-1")).toEqual([]);
  expect(cleanupPaths).toEqual([path]);
  expect(reportCleanupFailure).toHaveBeenCalledWith("operation-1", "Error", path, false, "remove");
  expect(await sync.sync("owner", id, empty)).toEqual([]);
  expect(remove).toHaveBeenCalledTimes(2);
  expect(cleanupPaths).toEqual([]);
});

test("skips a stale cleanup path after another sync links the photo again", async () => {
  const id = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const path = `ad-images/${id}/pending/${photoId}.png`;
  const remove = vi.fn();
  const sync = createPendingPublicationImageSync({
    pathFor: (publicationId, uploadId) => `ad-images/${publicationId}/pending/${uploadId}.png`,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async () => ({ id, userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [{ id: photoId, path, order: 0 }] }),
    upload: vi.fn(),
    replace: async () => ({ images: [], cleanupPaths: [path] }),
    scheduleCleanup: vi.fn(),
    claimCleanup: async () => false,
    remove,
    acknowledgeCleanup: vi.fn(),
    now: () => 123,
  });
  const empty = new FormData();
  empty.set("images", "[]");
  empty.set("observedImageIds", JSON.stringify([photoId]));
  empty.set("observedImages", JSON.stringify([{ id: photoId, title: "", description: "", order: 0 }]));
  await sync.sync("owner", id, empty);
  expect(remove).not.toHaveBeenCalled();
});

test("a later upload failure records earlier new objects for retryable cleanup", async () => {
  const id = crypto.randomUUID();
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const scheduleCleanup = vi.fn().mockResolvedValue(undefined);
  const upload = vi.fn()
    .mockImplementationOnce(async (_id, _file, _mimeType, uploadId) => ({ path: pathFor(id, uploadId), created: true }))
    .mockRejectedValueOnce(new Error("Storage unavailable"));
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async userId => userId === "owner" ? { id, userId, title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [] } : null,
    upload,
    replace: vi.fn(),
    scheduleCleanup,
    claimCleanup: async () => false,
    remove: vi.fn(),
    acknowledgeCleanup: vi.fn(),
    now: () => 123,
  });
  const form = new FormData();
  form.set("images", JSON.stringify([{ id: first, title: "Frente", description: "", order: 0 }, { id: second, title: "Lado", description: "", order: 1 }]));
  form.set("file-0", new File(["photo"], "first.png", { type: "image/png" }));
  form.set("file-1", new File(["photo"], "second.png", { type: "image/png" }));
  await expect(sync.sync("owner", id, form, "completed-operation")).rejects.toThrow("Storage unavailable");
  const completedPath = pathFor(id, upload.mock.calls[0]![3]);
  expect(scheduleCleanup).toHaveBeenCalledWith(id, "owner", [completedPath], {
    completedWriterPaths: [completedPath], completedAt: 123, operationId: "completed-operation",
  });
});
