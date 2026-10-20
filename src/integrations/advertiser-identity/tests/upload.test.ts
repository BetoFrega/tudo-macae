import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { PhotoError, PhotoUploadLimited } from "@tudomacae/classifieds-photos";

const fixture = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/packages/classifieds-api/photos", () => ({ classifiedsPhotos: () => ({ upload: fixture.upload }), classifiedsPhotoCredential: async () => ({ session: "fixture" }) }));
import { uploadAdvertiserProfilePhoto } from "../upload";

const operationId = "a50f1f00-fdcd-4b5b-b8af-70ed58f8a9f4";
const input = () => ({ profileId: "profile", userId: "owner", isAdmin: false, expectedRevision: 2, operationId,
  file: new File([new Uint8Array([1, 2, 3])], "photo.gif", { type: "image/gif" }) });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.clearAllMocks();
  fixture.upload.mockResolvedValue({ path: "profile-photos/profile/photo.webp" });
});
test("Profile uploads forward immutable bytes, revision and intent to the Worker", async () => {
  const request = input();
  expect(await uploadAdvertiserProfilePhoto(request)).toEqual({ success: true, photoURL: "/api/classifieds/photos/public/profile-photos%2Fprofile%2Fphoto.webp" });
  await uploadAdvertiserProfilePhoto(request);
  expect(fixture.upload.mock.calls.map(call => call[0])).toEqual([0, 1].map(() => ({ ownerKind: "profile", ownerId: "profile", expectedRevision: 2, operationId,
    bytes: new Uint8Array([1, 2, 3]), mimeType: "image/gif" })));
});
test.each([new PhotoError("conflict", "Releia o perfil."), new PhotoUploadLimited("account_burst", 60_000)])("expected Worker refusals remain actionable", async (error) => {
  fixture.upload.mockRejectedValue(error);
  expect(await uploadAdvertiserProfilePhoto(input())).toEqual({ success: false, error: error.message });
});
test.each([new PhotoError("invalid", "Escolha outra foto."), new PhotoError("retired", "Este envio não pode mais ser confirmado.")])("Worker refusal %s requires another file instead of a retry", async (error) => {
  fixture.upload.mockRejectedValue(error);
  expect(await uploadAdvertiserProfilePhoto(input())).toEqual({ success: false, error: error.message, reason: "invalid_photo" });
});
test("a server-reported Worker failure returns its support code without a duplicate log", async () => {
  fixture.upload.mockRejectedValue(new ClassifiedsRequestError("unavailable", "10000000-0000-4000-8000-000000000001", true));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await uploadAdvertiserProfilePhoto(input());
    expect(result).toEqual({ success: false, error: "Não foi possível enviar a foto do perfil. Código de suporte: 10000000-0000-4000-8000-000000000001." });
    expect(log).not.toHaveBeenCalled();
  }
  finally { log.mockRestore(); }
});
