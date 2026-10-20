import { expect, test, vi } from "vitest";
import { uploadAdImageUseCase } from "./uploadAdImageUseCase";
import { verifyAdOwnershipUseCase } from "./verifyAdOwnershipUseCase";

const photos = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/packages/classifieds-api/photos", () => ({ classifiedsPhotos: () => photos, classifiedsPhotoCredential: async () => ({ session: "fixture-only" }) }));
vi.mock("./verifyAdOwnershipUseCase", () => ({ verifyAdOwnershipUseCase: vi.fn() }));

const input = {
  adId: "ad-1", userId: "user-1", file: Buffer.from("image"),
  mimeType: "image/webp", title: "", description: "",
};

test("a published-photo retry keeps its original revision", async () => {
  const uploadId = "00000000-0000-4000-8000-000000000001";
  vi.mocked(verifyAdOwnershipUseCase).mockResolvedValue({ categoryId: "cat", revision: 9,
    images: [{ id: uploadId, path: "ad-images/ad-1/pending/photo.webp", order: 0, uploadRevision: 4 }] } as never);
  photos.upload.mockResolvedValue({ id: uploadId, path: "ad-images/ad-1/pending/photo.webp", title: "", description: "" });
  expect((await uploadAdImageUseCase({ ...input, uploadId })).image).toMatchObject({ url: `/api/anuncios/ad-1/fotos/${uploadId}` });
  expect(photos.upload).toHaveBeenCalledWith(expect.objectContaining({ operationId: uploadId, expectedRevision: 4 }), { session: "fixture-only" }, uploadId);
});
