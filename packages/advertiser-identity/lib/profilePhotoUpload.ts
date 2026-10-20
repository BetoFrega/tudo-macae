import type { createAdvertiserProfiles } from "../profiles";
import { isValidPublicImageKey } from "@tudomacae/public-image-delivery/cacheTag";

// `invalid_photo` is terminal: retrying the same file and upload ID fails again, so the form must ask for another file.
export type UploadProfilePhotoResult = { success: true; photoURL: string } | { success: false; error: string; reason?: "invalid_photo" };

type PhotoContext = { correlationId: string; operation: "profile_photo_replace" };

const acceptedPhotoTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function validatedPhoto(file: File | null): { file: File } | { error: string } {
  if (!file) return { error: "Escolha uma foto para enviar." };
  if (file.size > 1024 * 1024) return { error: "A foto deve ter no máximo 1MB." };
  if (!acceptedPhotoTypes.includes(file.type)) return { error: "Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF." };
  return { file };
}

function publicPhotoPath(photoPath: string | undefined) {
  return photoPath?.startsWith("profile-photos/") && isValidPublicImageKey(photoPath)
    ? photoPath
    : undefined;
}

export function createProfilePhotoUpload(dependencies: {
  profiles: Pick<ReturnType<typeof createAdvertiserProfiles>, "verifyOwnership" | "read" | "replacePhoto">;
  storage: {
    upload(input: { profileId: string; file: Uint8Array; mimeType: string; originalName: string }): Promise<{ path: string }>;
    delete(path: string): Promise<void>;
    url(path: string): string;
  };
  purgeOldPhoto(path: string, context: { correlationId: string; operation: "profile_photo_replace" }): Promise<boolean>;
  prepareOldPhoto(path: string, context: { correlationId: string; operation: "profile_photo_replace" }): Promise<void>;
  cancelOldPhoto(context: { correlationId: string; operation: "profile_photo_replace" }): Promise<void>;
  observeRevocation(context: { correlationId: string; operation: "profile_photo_replace" }): void;
  reportError(cause: "rejected_photo_delete" | "old_photo_delete" | "old_photo_purge" | "legacy_photo_path" | "intent_cancel" | "upload", correlationId: string): void;
}) {
  async function replacePhoto(
    input: { profileId: string; expectedRevision: number },
    uploadedPath: string,
    oldPublicPhotoPath: string | undefined,
    context: PhotoContext,
  ) {
    try {
      if (oldPublicPhotoPath) await dependencies.prepareOldPhoto(oldPublicPhotoPath, context);
      await dependencies.profiles.replacePhoto({ id: input.profileId, photoPath: uploadedPath, expectedRevision: input.expectedRevision });
    }
    catch (error) {
      if (oldPublicPhotoPath) {
        await dependencies.cancelOldPhoto(context).catch(() => dependencies.reportError("intent_cancel", context.correlationId));
      }
      await dependencies.storage.delete(uploadedPath).catch(() => dependencies.reportError("rejected_photo_delete", context.correlationId));
      throw error;
    }
  }

  async function removeOldPhoto(oldPhotoPath: string, oldPublicPhotoPath: string | undefined, context: PhotoContext) {
    const removed = await dependencies.storage.delete(oldPhotoPath).then(
      () => true,
      () => {
        dependencies.reportError("old_photo_delete", context.correlationId);
        return false;
      },
    );
    if (!removed) return;
    if (!oldPublicPhotoPath) {
      dependencies.reportError("legacy_photo_path", context.correlationId);
      return;
    }
    dependencies.observeRevocation(context);
    await dependencies.purgeOldPhoto(oldPublicPhotoPath, context).catch(() => {
      dependencies.reportError("old_photo_purge", context.correlationId);
    });
  }

  return {
    async upload(input: { profileId: string; userId: string; isAdmin: boolean; expectedRevision: number; file: File | null }): Promise<UploadProfilePhotoResult> {
      const correlationId = crypto.randomUUID();
      try {
        if (!input.isAdmin) await dependencies.profiles.verifyOwnership({ id: input.profileId, userId: input.userId });
        const photo = validatedPhoto(input.file);
        if ("error" in photo) return { success: false, error: photo.error };
        const { file } = photo;
        const profile = await dependencies.profiles.read({ id: input.profileId });
        if (!profile) return { success: false, error: "Perfil de anunciante não encontrado." };
        const uploaded = await dependencies.storage.upload({ profileId: input.profileId, file: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, originalName: file.name });
        const context: PhotoContext = { correlationId, operation: "profile_photo_replace" };
        const oldPublicPhotoPath = publicPhotoPath(profile.photoPath);
        await replacePhoto(input, uploaded.path, oldPublicPhotoPath, context);
        if (profile.photoPath) await removeOldPhoto(profile.photoPath, oldPublicPhotoPath, context);
        return { success: true, photoURL: dependencies.storage.url(uploaded.path) };
      }
      catch {
        dependencies.reportError("upload", correlationId);
        return { success: false, error: "Não foi possível enviar a foto do perfil." };
      }
    },
  };
}
