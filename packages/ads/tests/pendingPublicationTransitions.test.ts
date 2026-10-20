import { expect, test, vi } from "vitest";
import { createPendingPublicationTransitions } from "../pendingPublicationTransitions";

test("an interrupted private-photo check can resume without completing early", async () => {
  const paths = ["ad-images/ad/pending/front.png", "ad-images/ad/pending/side.png"];
  const result = { adId: "ad", slug: "bicicleta", categoryId: "bikes", subcategoryId: "used", advertiserProfileId: "profile" };
  const publish = vi.fn().mockResolvedValue(result);
  const verifyImages = vi.fn().mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValue(undefined);
  const complete = vi.fn().mockResolvedValue(undefined);
  const returnToPending = vi.fn().mockResolvedValue(undefined);
  const transitions = createPendingPublicationTransitions({
    cleanupImages: vi.fn(),
    publish,
    read: vi.fn().mockResolvedValue({ images: paths.map((path, order) => ({ id: String(order), path, order })) }),
    verifyImages,
    complete,
    returnToPending,
    startDelete: vi.fn(),
    delete: vi.fn(),
    purgeImages: vi.fn(),
  });
  await expect(transitions.publish("owner", "ad")).rejects.toThrow("Storage unavailable");
  expect(complete).not.toHaveBeenCalled();
  expect(returnToPending).toHaveBeenCalledWith("owner", "ad");
  const reviewed = { title: "Bicicleta", text: "Bicicleta em bom estado", categoryId: "bikes", subcategoryId: "used", advertiserProfileId: "profile", images: [], advertiserProfile: { title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] } };
  expect(await transitions.publish("owner", "ad", reviewed)).toEqual(result);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(verifyImages).toHaveBeenNthCalledWith(2, "ad", paths);
  expect(complete).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledWith("owner", "ad", reviewed);
});

test("a failed purge leaves a retryable deletion and never removes the record early", async () => {
  const cleanupImages = vi.fn();
  const startDelete = vi.fn().mockRejectedValueOnce(new Error("Foreign owner")).mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const purgeImages = vi.fn().mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValue(undefined);
  const transitions = createPendingPublicationTransitions({
    cleanupImages,
    publish: vi.fn(), read: vi.fn(), verifyImages: vi.fn(), complete: vi.fn(), returnToPending: vi.fn(),
    startDelete, delete: remove, purgeImages,
  });
  await expect(transitions.delete("foreign", "ad")).rejects.toThrow("Foreign owner");
  expect(purgeImages).not.toHaveBeenCalled();
  await expect(transitions.delete("owner", "ad")).rejects.toThrow("Storage unavailable");
  expect(remove).not.toHaveBeenCalled();
  await transitions.delete("owner", "ad");
  expect(purgeImages).toHaveBeenCalledWith("ad");
  expect(remove).toHaveBeenCalledOnce();
  expect(cleanupImages).toHaveBeenCalledWith("owner", "ad");
});

test("deletion clears expired photo reservations before locking the draft", async () => {
  const order: string[] = [];
  const transitions = createPendingPublicationTransitions({
    cleanupImages: async () => { order.push("cleanup"); },
    startDelete: async () => { order.push("start"); },
    purgeImages: async () => { order.push("purge"); },
    delete: async () => { order.push("delete"); },
    publish: vi.fn(), read: vi.fn(), verifyImages: vi.fn(), complete: vi.fn(), returnToPending: vi.fn(),
  });
  await transitions.delete("owner", "ad");
  expect(order).toEqual(["cleanup", "start", "purge", "delete"]);
});

test("a completion failure leaves checked photos private and permits a retry", async () => {
  const result = { adId: "ad", slug: "bicicleta", categoryId: "bikes", subcategoryId: "used", advertiserProfileId: "profile" };
  const complete = vi.fn().mockRejectedValueOnce(new Error("Firestore unavailable")).mockResolvedValue(undefined);
  const verifyImages = vi.fn().mockResolvedValue(undefined);
  const returnToPending = vi.fn();
  const transitions = createPendingPublicationTransitions({
    cleanupImages: vi.fn(),
    publish: vi.fn().mockResolvedValue(result),
    read: vi.fn().mockResolvedValue({ images: [{ id: "photo", path: "ad-images/ad/pending/photo.png", order: 0 }] }),
    verifyImages, complete, returnToPending, startDelete: vi.fn(), delete: vi.fn(), purgeImages: vi.fn(),
  });
  await expect(transitions.publish("owner", "ad")).rejects.toThrow("Firestore unavailable");
  expect(verifyImages).toHaveBeenCalledOnce();
  expect(returnToPending).toHaveBeenCalledWith("owner", "ad");
  expect(await transitions.publish("owner", "ad")).toEqual(result);
  expect(complete).toHaveBeenCalledTimes(2);
});
