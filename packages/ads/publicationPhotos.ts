import { z } from "zod";
import { publicationIdentifier } from "./validation";
import { PendingPhotoConflict } from "./syncPendingPublicationImages";
import type { PendingPhoto } from "./syncPendingPublicationImages";
export const publicationPhotosInput = z.object({
  id: z.string().min(1),
  operationId: z.uuid(),
  images: z.array(z.object({ id: publicationIdentifier, title: z.string().max(140), description: z.string().max(300), order: z.number().int().min(0).max(2) })).max(3),
  observedImages: z.array(z.object({ id: publicationIdentifier, title: z.string().max(140), description: z.string().max(300), order: z.number().int().min(0).max(2) })).max(3),
});
export function createPublicationPhotos(dependencies: {
  transact(id: string, decide: (images: PendingPhoto[]) => PendingPhoto[], submission: z.infer<typeof publicationPhotosInput>): Promise<PendingPhoto[]>;
}) {
  return { sync: async (input: z.infer<typeof publicationPhotosInput>) => {
    const value = publicationPhotosInput.parse(input);
    if (new Set(value.images.map(image => image.id)).size !== value.images.length) throw new PendingPhotoConflict();
    return dependencies.transact(value.id, (current) => {
      const snapshot = (images: readonly Omit<PendingPhoto, "path">[]) => JSON.stringify(images.map(image => ({ id: image.id, title: image.title ?? "", description: image.description ?? "", order: image.order })));
      const observed = new Set(value.observedImages.map(image => image.id));
      if (snapshot(current.filter(image => observed.has(image.id))) !== snapshot(value.observedImages)) throw new PendingPhotoConflict();
      const desired = new Set(value.images.map(image => image.id));
      if (current.some(image => !observed.has(image.id) && !desired.has(image.id))) throw new PendingPhotoConflict();
      return value.images.map((image, order) => {
        const existing = current.find(item => item.id === image.id);
        if (!existing) throw new PendingPhotoConflict();
        return { ...existing, ...image, order };
      });
    }, value);
  } };
}

export function discardedPublicationPhoto(input: {
  path: string; ownerKind: string; ownerId: string; pendingPublication?: boolean | undefined; status: string;
}, publicationId: string, selectedPaths: readonly string[]): boolean {
  return input.ownerKind === "ad" && input.ownerId === publicationId && input.pendingPublication === true
    && input.status === "reserved" && !selectedPaths.includes(input.path);
}

export function stagedPublicationPhoto(input: {
  id: string; path: string; title: string; description: string; ownerKind: string; ownerId: string;
  pendingPublication?: boolean | undefined; status: string; generation?: string | undefined; expiresAt: number;
}, publicationId: string, now: number, order: number): PendingPhoto {
  if (input.ownerKind !== "ad" || input.ownerId !== publicationId || !input.pendingPublication
    || input.status !== "reserved" || !input.generation || input.expiresAt <= now) throw new PendingPhotoConflict();
  return { id: input.id, path: input.path, title: input.title, description: input.description, order };
}
