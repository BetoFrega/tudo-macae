import { expect, test, vi } from "vitest";
import { createAdImageUpload, type AdUploadImage } from "../adImageUpload";

const input = {
  adId: "ad-1",
  userId: "owner",
  file: Buffer.from("photo"),
  mimeType: "image/png",
  title: "Front",
  description: "",
  uploadId: "upload-1",
};

function fixture(images: AdUploadImage[] = [], created = true) {
  let currentImages = images;
  const remove = vi.fn(async () => {});
  const publish = vi.fn(async () => {});
  const reportCleanupFailure = vi.fn();
  const store = vi.fn(async () => ({ path: "ad-images/ad-1/upload-1.png", created }));
  const append = vi.fn(async (_adId: string, build: (images: readonly AdUploadImage[]) => AdUploadImage) => {
    const image = build(currentImages);
    if (!currentImages.some(item => item.id === image.id)) currentImages = [...currentImages, image];
    return image;
  });
  const finalize = vi.fn(async (_adId: string, imageId: string, path: string) => {
    const image = currentImages.find(item => item.id === imageId && item.path === path) ?? { id: imageId, path, order: 0 };
    const { pending: _pending, ...ready } = image;
    currentImages = currentImages.map(item => item.id === imageId ? ready : item);
    return ready;
  });
  const read = vi.fn(async (): Promise<{ categoryId: string; images: AdUploadImage[] } | null> => ({ categoryId: "cat", images: currentImages }));
  const uploads = createAdImageUpload({
    readOwned: async () => ({ categoryId: "cat", images: currentImages }),
    read,
    pathFor: () => "ad-images/ad-1/upload-1.png",
    store,
    append,
    publish,
    finalize,
    remove,
    newId: () => "generated",
    reportCleanupFailure,
  });
  return { uploads, append, store, read, remove, publish, finalize, reportCleanupFailure };
}

test("replays a committed upload without writing another object", async () => {
  const committed = { id: "upload-1", path: "ad-images/ad-1/upload-1.png", order: 0 };
  const { uploads, store, append, publish } = fixture([committed]);
  expect((await uploads.upload(input)).image).toEqual(committed);
  expect(store).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
  expect(publish).toHaveBeenCalledWith("ad-1", committed.path);
});

test("a transaction-time replay returns the committed image", async () => {
  const f = fixture();
  const committed = { id: "upload-1", path: "ad-images/ad-1/upload-1.png", order: 0 };
  f.append.mockImplementationOnce(async (_adId, build) => build([committed]));
  expect((await f.uploads.upload(input)).image).toEqual(committed);
  expect(f.remove).not.toHaveBeenCalled();
});

test("rejects a fourth keyed image before writing an object", async () => {
  const f = fixture([0, 1, 2].map(order => ({ id: `other-${order}`, path: `path-${order}`, order })));
  await expect(f.uploads.upload(input)).rejects.toThrow("Maximum of 3 images");
  expect(f.store).not.toHaveBeenCalled();
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.publish).not.toHaveBeenCalled();
});

test("keeps a committed image pending until Storage publication succeeds", async () => {
  const f = fixture();
  f.publish.mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(f.uploads.upload(input)).rejects.toThrow("Storage unavailable");
  expect((await f.read())?.images).toMatchObject([{ id: input.uploadId, pending: true }]);
  expect((await f.uploads.upload(input)).image).not.toHaveProperty("pending");
  expect((await f.read())?.images).not.toHaveProperty("0.pending");
});

test("rejects an unkeyed fourth image before writing an object", async () => {
  const f = fixture([0, 1, 2].map(order => ({ id: `other-${order}`, path: `path-${order}`, order })));
  await expect(f.uploads.upload({ ...input, uploadId: undefined })).rejects.toThrow("Maximum of 3 images");
  expect(f.store).not.toHaveBeenCalled();
});

test("preserves a keyed object when another attempt created it", async () => {
  const f = fixture([0, 1, 2].map(order => ({ id: `other-${order}`, path: `path-${order}`, order })), false);
  await expect(f.uploads.upload(input)).rejects.toThrow("Maximum of 3 images");
  expect(f.remove).not.toHaveBeenCalled();
});

test("does not store an object when append fails", async () => {
  const f = fixture();
  f.append.mockRejectedValueOnce(new Error("response lost"));
  await expect(f.uploads.upload(input)).rejects.toThrow("response lost");
  expect(f.store).not.toHaveBeenCalled();
  expect(f.remove).not.toHaveBeenCalled();
});

test("preserves a publish error when cleanup after ad removal fails and reports it", async () => {
  const f = fixture();
  const publishError = new Error("publish failed");
  f.publish.mockRejectedValueOnce(publishError);
  f.read.mockResolvedValueOnce(null);
  f.remove.mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(f.uploads.upload(input)).rejects.toBe(publishError);
  expect(f.reportCleanupFailure).toHaveBeenCalledOnce();
});

test("does not delete a shared keyed object before a concurrent retry commits", async () => {
  const f = fixture();
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  f.store.mockResolvedValueOnce({ path: "ad-images/ad-1/upload-1.png", created: true })
    .mockResolvedValueOnce({ path: "ad-images/ad-1/upload-1.png", created: false });
  f.append.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    throw new Error("first append failed");
  }).mockImplementationOnce(async (_id, build) => {
    await new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    return build([]);
  });

  const first = f.uploads.upload(input);
  await vi.waitFor(() => expect(f.append).toHaveBeenCalledTimes(1));
  const second = f.uploads.upload(input);
  await vi.waitFor(() => expect(f.append).toHaveBeenCalledTimes(2));
  releaseFirst();
  await expect(first).rejects.toThrow("first append failed");
  expect(f.remove).not.toHaveBeenCalled();
  releaseSecond();
  expect((await second).image.path).toBe("ad-images/ad-1/upload-1.png");
  expect(f.publish).toHaveBeenCalledOnce();
});
