// @vitest-environment node
import { expect, test, vi } from "vitest";
import { createPendingPublicationImageSync, type PendingPhoto } from "../syncPendingPublicationImages";
import { pathFor, payload } from "./syncPendingPublicationImagesFixtures";

test("an upload that races draft deletion removes its object and completes the independent job", async () => {
  const id = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  let reads = 0;
  const remove = vi.fn();
  const completeCleanup = vi.fn();
  const reportCleanupFailure = vi.fn();
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async () => {},
    completeCleanup,
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async () => ++reads === 1 ? { id, userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [] } : null,
    upload: async (_id, _file, _mimeType, uploadId) => ({ path: pathFor(id, uploadId), created: true }),
    replace: async () => { throw new Error("Publication deleted"); },
    scheduleCleanup: async () => { throw new Error("Publication deleted"); },
    claimCleanup: async () => false,
    remove,
    reportCleanupFailure,
    acknowledgeCleanup: vi.fn(),
    now: () => 123,
  });
  await expect(sync.sync("owner", id, payload(imageId, new File(["photo"], "front.png", { type: "image/png" })))).rejects.toThrow("Publication deleted");
  expect(remove).toHaveBeenCalledWith(id, expect.stringMatching(new RegExp(`^ad-images/${id}/pending/${imageId}-`)));
  expect(completeCleanup).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^ad-images/${id}/pending/${imageId}-`)));
  expect(reportCleanupFailure).not.toHaveBeenCalled();
});

test("failed direct deletion retains the independent job and still attempts other objects", async () => {
  const id = crypto.randomUUID();
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const queued: string[] = [];
  const completed: string[] = [];
  const removed: string[] = [];
  const reportCleanupFailure = vi.fn();
  let reads = 0;
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async (_id, path) => { queued.push(path); },
    completeCleanup: async (path) => { completed.push(path); },
    reserveUploads: async () => {}, releaseUpload: async () => {},
    read: async () => ++reads === 1 ? { id, userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [] } : null,
    upload: async (_id, _file, _mimeType, uploadId) => ({ path: pathFor(id, uploadId), created: true }),
    replace: async () => { throw new Error("Publication deleted"); },
    scheduleCleanup: async () => { throw new Error("Publication deleted"); },
    claimCleanup: async () => false,
    remove: async (_id, path) => {
      removed.push(path);
      if (path.includes(first)) throw new Error("Storage unavailable");
    },
    acknowledgeCleanup: async () => {}, reportCleanupFailure, now: () => 123,
  });
  const form = new FormData();
  form.set("images", JSON.stringify([first, second].map((imageId, order) => ({ id: imageId, title: "Foto", description: "", order }))));
  form.set("file-0", new File(["one"], "one.png", { type: "image/png" }));
  form.set("file-1", new File(["two"], "two.png", { type: "image/png" }));
  await expect(sync.sync("owner", id, form, "operation-1")).rejects.toThrow("Publication deleted");
  expect(queued).toHaveLength(2);
  expect(removed).toEqual(queued);
  expect(completed).toEqual([queued[1]]);
  expect(reportCleanupFailure).toHaveBeenCalledWith("operation-1", "Error", expect.any(String), true);
});

test("a write finishing after expiry cleanup and draft deletion removes its private object", async () => {
  const id = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  let draftExists = true;
  let uploadedPath = "";
  const objects = new Set<string>();
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  let finishWrite!: () => void;
  const mayFinish = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  const remove = vi.fn(async (_id: string, path: string) => {
    objects.delete(path);
  });
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async () => draftExists ? { id, userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [] } : null,
    upload: async (_id, _file, _mimeType, uploadId) => {
      uploadedPath = pathFor(id, uploadId);
      signalStarted();
      await mayFinish;
      objects.add(uploadedPath);
      return { path: uploadedPath, created: true };
    },
    replace: async () => { throw new Error("Publication deleted"); },
    scheduleCleanup: async () => { throw new Error("Publication deleted"); },
    claimCleanup: async () => false,
    remove,
    acknowledgeCleanup: vi.fn(),
    now: () => 123,
  });

  const pending = sync.sync("owner", id, payload(imageId, new File(["photo"], "front.png", { type: "image/png" })), "late-operation");
  await started;
  draftExists = false;
  finishWrite();

  await expect(pending).rejects.toThrow("Publication deleted");
  expect(uploadedPath).toContain(`${imageId}-late-operation`);
  expect(remove).toHaveBeenCalledWith(id, uploadedPath);
  expect(objects.size).toBe(0);
});

test("a failed cleanup schedule removes an unlinked object but preserves an attached one", async () => {
  const id = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  let uploadedPath = "";
  let images: PendingPhoto[] = [];
  let attachBeforeFailure = false;
  const remove = vi.fn();
  const releaseUpload = vi.fn(async () => {});
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload,
    read: async () => ({ id, userId: "owner", title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images }),
    upload: async (_id, _file, _mimeType, uploadId) => {
      uploadedPath = pathFor(id, uploadId);
      return { path: uploadedPath, created: true };
    },
    replace: async () => {
      if (attachBeforeFailure) images = [{ id: imageId, path: uploadedPath, order: 0 }];
      throw new Error("write failed");
    },
    scheduleCleanup: async () => { throw new Error("schedule failed"); },
    claimCleanup: async () => false,
    remove,
    acknowledgeCleanup: vi.fn(),
    now: () => 123,
  });
  const form = payload(imageId, new File(["photo"], "front.png", { type: "image/png" }));
  await expect(sync.sync("owner", id, form)).rejects.toThrow("write failed");
  expect(releaseUpload).toHaveBeenCalledWith(id, "owner", uploadedPath, expect.any(String));
  expect(remove).toHaveBeenCalledWith(id, uploadedPath);
  remove.mockClear();
  attachBeforeFailure = true;
  await expect(sync.sync("owner", id, form)).rejects.toThrow("write failed");
  expect(remove).not.toHaveBeenCalled();
});
