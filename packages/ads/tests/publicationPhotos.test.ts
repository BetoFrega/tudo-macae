import { expect, test } from "vitest";
import { createPublicationPhotos, discardedPublicationPhoto } from "../publicationPhotos";
import { PendingPhotoConflict } from "../syncPendingPublicationImages";
import type { PendingPhoto } from "../syncPendingPublicationImages";
const one = { id: "11111111-1111-4111-8111-111111111111", title: "Frente", description: "", order: 0 };
const two = { ...one, id: "22222222-2222-4222-8222-222222222222", title: "Verso", order: 1 };
function fixture(initial: PendingPhoto[]) {
  let images = initial;
  return createPublicationPhotos({ transact: async (_id, decide) => {
    images = decide(images);
    return images;
  } });
}
test("photo metadata retains server paths and rejects stale observed selections", async () => {
  const photos = fixture([{ ...one, path: "owned/one" }, { ...two, path: "owned/two" }]);
  const input = { id: "draft", operationId: crypto.randomUUID(), images: [{ ...two, order: 0 }], observedImages: [one, two] };
  expect(await photos.sync(input)).toEqual([{ ...two, order: 0, path: "owned/two" }]);
  await expect(photos.sync(input)).rejects.toBeInstanceOf(PendingPhotoConflict);
  await expect(photos.sync({ ...input, images: [one] })).rejects.toBeInstanceOf(PendingPhotoConflict);
});
test("partially completed uploads resume without overwriting concurrent metadata", async () => {
  const photos = fixture([{ ...one, path: "owned/one" }, { ...two, path: "owned/two" }]);
  const operationId = crypto.randomUUID();
  expect(await photos.sync({ id: "draft", operationId, images: [one, two], observedImages: [one] })).toHaveLength(2);
  await expect(photos.sync({ id: "draft", operationId, images: [one], observedImages: [] })).rejects.toBeInstanceOf(PendingPhotoConflict);
  await expect(photos.sync({ id: "draft", operationId, images: [one, one], observedImages: [one, two] })).rejects.toBeInstanceOf(PendingPhotoConflict);
});

test("only unselected staged reservations of this publication can be discarded", () => {
  const photo = { path: "owned/stage", ownerKind: "ad", ownerId: "draft", pendingPublication: true, status: "reserved" };
  expect(discardedPublicationPhoto(photo, "draft", [])).toBe(true);
  for (const candidate of [{ ...photo, ownerKind: "profile" }, { ...photo, ownerId: "other" }, { ...photo, pendingPublication: false }, { ...photo, status: "linked" }]) {
    expect(discardedPublicationPhoto(candidate, "draft", [])).toBe(false);
  }
  expect(discardedPublicationPhoto(photo, "draft", [photo.path])).toBe(false);
});
