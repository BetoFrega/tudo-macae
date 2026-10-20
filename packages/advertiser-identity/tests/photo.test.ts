import { expect, test, vi } from "vitest";
import { createProfilePhotoUpload } from "../photo";
import { profileFixture } from "./profileFixtures";

async function fixture() {
  const { profiles } = profileFixture();
  const id = await profiles.create({ userId: "owner", title: "Perfil", description: "", contacts: [] });
  const storage = { upload: vi.fn(async () => ({ path: "new.webp" })), delete: vi.fn(async (_path: string) => {}), url: (path: string) => `https://storage.test/${path}` };
  const purgeOldPhoto = vi.fn(async (_path: string, _context: { correlationId: string; operation: "profile_photo_replace" }) => true);
  const prepareOldPhoto = vi.fn(async (_path: string, _context: { correlationId: string; operation: "profile_photo_replace" }) => {});
  const cancelOldPhoto = vi.fn(async (_context: { correlationId: string; operation: "profile_photo_replace" }) => {});
  const observeRevocation = vi.fn();
  const reportError = vi.fn();
  const uploader = createProfilePhotoUpload({ profiles, storage, purgeOldPhoto, prepareOldPhoto, cancelOldPhoto, observeRevocation, reportError });
  const upload = (file: File | null = new File(["image"], "photo.webp", { type: "image/webp" }), userId = "owner", isAdmin = false, profileId = id, expectedRevision = 1) => uploader.upload({ profileId, file, userId, isAdmin, expectedRevision });
  return { profiles, id, storage, purgeOldPhoto, prepareOldPhoto, cancelOldPhoto, observeRevocation, reportError, upload };
}

test.each(["image/jpeg", "image/png", "image/webp", "image/gif"])("accepts %s and persists the photo", async (type) => {
  const { profiles, id, upload } = await fixture();
  expect(await upload(new File(["photo"], "photo", { type }))).toEqual({ success: true, photoURL: "https://storage.test/new.webp" });
  expect(await profiles.read({ id })).toMatchObject({ photoPath: "new.webp" });
});

test("size boundary, missing file and unsupported MIME return intentional messages", async () => {
  const { upload } = await fixture();
  expect(await upload(null)).toEqual({ success: false, error: "Escolha uma foto para enviar." });
  expect(await upload(new File(["text"], "photo.txt", { type: "text/plain" }))).toEqual({ success: false, error: "Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF." });
  expect(await upload(new File([new Uint8Array(1024 * 1024)], "photo.webp", { type: "image/webp" }))).toMatchObject({ success: true });
  expect(await upload(new File([new Uint8Array(1024 * 1024 + 1)], "photo.webp", { type: "image/webp" }))).toEqual({ success: false, error: "A foto deve ter no máximo 1MB." });
});

test("a different advertiser is refused while an administrator can replace the photo", async () => {
  const { upload, profiles, id } = await fixture();
  expect(await upload(undefined, "other")).toEqual({ success: false, error: "Não foi possível enviar a foto do perfil." });
  expect(await profiles.read({ id })).not.toHaveProperty("photoPath");
  expect(await upload(undefined, "admin", true)).toMatchObject({ success: true });
  expect(await upload(undefined, "admin", true, "absent")).toEqual({ success: false, error: "Perfil de anunciante não encontrado." });
});

test("replacement survives old-photo deletion failure and logs it", async () => {
  const { upload, profiles, id, storage, purgeOldPhoto, reportError } = await fixture();
  await profiles.replacePhoto({ id, photoPath: "old.webp", expectedRevision: 1 });
  const error = new Error("old object unavailable");
  storage.delete.mockRejectedValueOnce(error);
  expect(await upload(undefined, undefined, undefined, undefined, 2)).toMatchObject({ success: true });
  expect(storage.delete).toHaveBeenCalledWith("old.webp");
  expect(reportError).toHaveBeenCalledWith("old_photo_delete", expect.any(String));
  expect(JSON.stringify(reportError.mock.calls)).not.toContain(error.message);
  expect(purgeOldPhoto).not.toHaveBeenCalled();
  expect(await profiles.read({ id })).toMatchObject({ photoPath: "new.webp" });
});

test("replacement purges the old public photo after deleting its origin", async () => {
  const { upload, profiles, id, storage, purgeOldPhoto, prepareOldPhoto, observeRevocation } = await fixture();
  await profiles.replacePhoto({ id, photoPath: "profile-photos/profile-1/old.webp", expectedRevision: 1 });

  expect(await upload(undefined, undefined, undefined, undefined, 2)).toMatchObject({ success: true });
  expect(storage.delete).toHaveBeenCalledWith("profile-photos/profile-1/old.webp");
  expect(prepareOldPhoto).toHaveBeenCalledWith("profile-photos/profile-1/old.webp", expect.objectContaining({
    correlationId: expect.any(String), operation: "profile_photo_replace",
  }));
  expect(prepareOldPhoto.mock.invocationCallOrder[0]).toBeLessThan(storage.delete.mock.invocationCallOrder[0]);
  expect(purgeOldPhoto).toHaveBeenCalledWith("profile-photos/profile-1/old.webp", expect.objectContaining({
    correlationId: expect.any(String),
    operation: "profile_photo_replace",
  }));
  expect(observeRevocation).toHaveBeenCalledWith(purgeOldPhoto.mock.calls[0]?.[1]);
  expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(purgeOldPhoto.mock.invocationCallOrder[0]);
});

test("failed recovery preparation leaves the old profile photo intact", async () => {
  const { upload, profiles, id, storage, prepareOldPhoto, cancelOldPhoto } = await fixture();
  await profiles.replacePhoto({ id, photoPath: "profile-photos/profile-1/old.webp", expectedRevision: 1 });
  prepareOldPhoto.mockRejectedValueOnce(new Error("recovery unavailable"));

  expect(await upload(undefined, undefined, undefined, undefined, 2))
    .toEqual({ success: false, error: "Não foi possível enviar a foto do perfil." });
  expect(await profiles.read({ id })).toMatchObject({ photoPath: "profile-photos/profile-1/old.webp" });
  expect(storage.delete).toHaveBeenCalledWith("new.webp");
  expect(storage.delete).not.toHaveBeenCalledWith("profile-photos/profile-1/old.webp");
  expect(cancelOldPhoto).toHaveBeenCalledWith(expect.objectContaining({ correlationId: expect.any(String) }));
});

test("a rejected replacement cancels the prepared recovery intent", async () => {
  const { upload, profiles, id, prepareOldPhoto, cancelOldPhoto } = await fixture();
  await profiles.replacePhoto({ id, photoPath: "profile-photos/profile-1/old.webp", expectedRevision: 1 });
  await profiles.update({ id, title: "Perfil atualizado", description: "", contacts: [] });

  expect(await upload(undefined, undefined, undefined, undefined, 2)).toMatchObject({ success: false });
  expect(prepareOldPhoto).toHaveBeenCalledOnce();
  expect(cancelOldPhoto).toHaveBeenCalledWith(prepareOldPhoto.mock.calls[0]?.[1]);
  expect(await profiles.read({ id })).toMatchObject({ photoPath: "profile-photos/profile-1/old.webp" });
});

test("a failed purge does not reverse a completed photo replacement", async () => {
  const { upload, profiles, id, purgeOldPhoto } = await fixture();
  await profiles.replacePhoto({ id, photoPath: "profile-photos/profile-1/old.webp", expectedRevision: 1 });
  purgeOldPhoto.mockResolvedValueOnce(false);

  expect(await upload(undefined, undefined, undefined, undefined, 2)).toMatchObject({ success: true });
  expect(await profiles.read({ id })).toMatchObject({ photoPath: "new.webp" });
});

test("a malformed old photo path does not block replacement", async () => {
  const { upload, profiles, id, prepareOldPhoto, reportError } = await fixture();
  await profiles.replacePhoto({ id, photoPath: "profile-photos/../old.webp", expectedRevision: 1 });

  expect(await upload(undefined, undefined, undefined, undefined, 2)).toMatchObject({ success: true });
  expect(prepareOldPhoto).not.toHaveBeenCalled();
  expect(reportError).toHaveBeenCalledWith("legacy_photo_path", expect.any(String));
});

test("provider failure leaves the existing profile untouched and hides technical details", async () => {
  const { upload, storage, reportError, profiles, id } = await fixture();
  const before = await profiles.read({ id });
  const error = new Error("provider secret");
  storage.upload.mockRejectedValueOnce(error);
  expect(await upload()).toEqual({ success: false, error: "Não foi possível enviar a foto do perfil." });
  expect(reportError).toHaveBeenCalledWith("upload", expect.any(String));
  expect(JSON.stringify(reportError.mock.calls)).not.toContain(error.message);
  expect(await profiles.read({ id })).toEqual(before);
});

test("revision conflict removes the newly uploaded orphan", async () => {
  const { upload, storage, purgeOldPhoto, profiles, id } = await fixture();
  await profiles.update({ id, title: "Perfil atualizado", description: "", contacts: [] });
  expect(await upload()).toEqual({ success: false, error: "Não foi possível enviar a foto do perfil." });
  expect(storage.delete).toHaveBeenCalledWith("new.webp");
  expect(purgeOldPhoto).not.toHaveBeenCalled();
  expect(await profiles.read({ id })).not.toHaveProperty("photoPath");
});
