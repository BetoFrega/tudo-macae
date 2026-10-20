// @vitest-environment node
import { expect, test, vi } from "vitest";
import { createPendingPublicationImageSync, type PendingPhoto } from "../syncPendingPublicationImages";
import { pathFor, payload } from "./syncPendingPublicationImagesFixtures";

test.each([false, true])("a stale tab cannot delete an unobserved photo (transaction race: %s)", async (transactionRace) => {
  const id = crypto.randomUUID();
  const freshId = crypto.randomUUID();
  const freshPhoto = { id: freshId, path: pathFor(id, freshId), order: 0 };
  const remove = vi.fn();
  const sync = createPendingPublicationImageSync({
    pathFor, enqueueCleanup: async () => {}, completeCleanup: async () => {},
    reserveUploads: async () => {}, releaseUpload: async () => {},
    read: async () => ({ id, userId: "owner", title: "Bicicleta", text: "Usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: transactionRace ? [] : [freshPhoto] }),
    upload: vi.fn(),
    replace: async (_id, _owner, _now, _operationId, build) => ({ images: build([freshPhoto]), cleanupPaths: [freshPhoto.path] }),
    scheduleCleanup: async () => {}, claimCleanup: async () => true,
    remove, acknowledgeCleanup: async () => {}, now: () => 123,
  });
  const stale = new FormData();
  stale.set("images", "[]");
  stale.set("observedImageIds", "[]");
  await expect(sync.sync("owner", id, stale)).rejects.toThrow("outra sessão");
  expect(remove).not.toHaveBeenCalled();
});

test("a failed metadata write retries with an isolated private path and links one photo", async () => {
  const id = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const file = new File(["photo"], "front.png", { type: "image/png" });
  let images: PendingPhoto[] = [];
  let failWrite = true;
  const upload = vi.fn().mockImplementation(async (_id, _file, _mimeType, uploadId) => ({ path: pathFor(id, uploadId), created: true }));
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async () => {},
    completeCleanup: async () => {},
    reserveUploads: async () => {},
    releaseUpload: async () => {},
    read: async userId => userId === "owner" ? { id, userId, title: "Bicicleta", text: "Bicicleta usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images } : null,
    upload,
    replace: async (_id, _owner, _now, _operationId, build) => {
      if (failWrite) throw new Error("Firestore unavailable");
      const current = images;
      images = build(images);
      return { images, cleanupPaths: current.filter(image => !images.some(next => next.path === image.path)).map(image => image.path) };
    },
    remove: vi.fn(),
    scheduleCleanup: vi.fn(),
    claimCleanup: async () => false,
    acknowledgeCleanup: vi.fn(),
    now: () => 123,
  });
  await expect(sync.sync("foreign", id, payload(photoId, file))).rejects.toThrow("não encontrada");
  expect(upload).not.toHaveBeenCalled();
  await expect(sync.sync("owner", id, payload(photoId, file))).rejects.toThrow("Firestore unavailable");
  failWrite = false;
  expect(await sync.sync("owner", id, payload(photoId, file))).toMatchObject([{ id: photoId, title: "Frente" }]);
  expect(await sync.sync("owner", id, payload(photoId))).toHaveLength(1);
  expect(images).toHaveLength(1);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0]?.[3]).toMatch(new RegExp(`^${photoId}-`));
  expect(upload.mock.calls[1]?.[3]).toMatch(new RegExp(`^${photoId}-`));
  expect(upload.mock.calls[1]?.[3]).not.toBe(upload.mock.calls[0]?.[3]);
});

test("a concurrent save with unobserved metadata cannot replace the other operation's photo", async () => {
  const id = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const otherPath = pathFor(id, `${photoId}-other`);
  const sync = createPendingPublicationImageSync({
    pathFor,
    enqueueCleanup: async () => {}, completeCleanup: async () => {},
    reserveUploads: async () => {}, releaseUpload: async () => {},
    read: async () => ({ id, userId: "owner", title: "Bicicleta", text: "Usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: [] }),
    upload: async (_id, _file, _mimeType, uploadId) => ({ path: pathFor(id, uploadId), created: true }),
    replace: async (_id, _userId, _now, _operationId, build) => {
      const images = build([{ id: photoId, path: otherPath, order: 0 }]);
      return { images, cleanupPaths: [otherPath] };
    },
    scheduleCleanup: async () => {}, claimCleanup: async () => true,
    remove: vi.fn(), acknowledgeCleanup: vi.fn(), now: () => 123,
  });
  await expect(sync.sync("owner", id, payload(photoId, new File(["photo"], "front.png", { type: "image/png" })), "my-operation"))
    .rejects.toThrow("As fotos mudaram em outra sessão");
});

test.each(["title", "description", "order"] as const)("a stale save cannot overwrite another tab's %s (before read or transaction)", async (field) => {
  for (const transactionRace of [false, true]) {
    const id = crypto.randomUUID();
    const original: PendingPhoto[] = [
      { id: crypto.randomUUID(), path: pathFor(id, "first"), title: "Frente", description: "Vista frontal", order: 0 },
      { id: crypto.randomUUID(), path: pathFor(id, "second"), title: "Lado", description: "Vista lateral", order: 1 },
    ];
    const changed = field === "order"
      ? [...original].reverse().map((image, order) => ({ ...image, order }))
      : original.map((image, index) => index ? image : { ...image, [field]: "Revisado na outra aba" });
    let persisted = changed;
    const remove = vi.fn();
    const sync = createPendingPublicationImageSync({
      pathFor, enqueueCleanup: async () => {}, completeCleanup: async () => {}, reserveUploads: async () => {}, releaseUpload: async () => {},
      read: async () => ({ id, userId: "owner", title: "Bicicleta", text: "Usada", categoryId: "bikes", subcategoryId: "used", createdAt: 1, images: transactionRace ? original : changed }),
      upload: vi.fn(),
      replace: async (_id, _owner, _now, _operation, build) => {
        persisted = build(changed);
        return { images: persisted, cleanupPaths: [] };
      },
      scheduleCleanup: async () => {}, claimCleanup: async () => false, remove, acknowledgeCleanup: async () => {}, now: () => 123,
    });
    const form = new FormData();
    form.set("images", JSON.stringify(original));
    form.set("observedImages", JSON.stringify(original));
    form.set("observedImageIds", JSON.stringify(original.map(image => image.id)));
    await expect(sync.sync("owner", id, form)).rejects.toThrow("As fotos mudaram em outra sessão");
    expect(persisted).toEqual(changed);
    expect(remove).not.toHaveBeenCalled();
  }
});
