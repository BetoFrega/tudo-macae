import type { PendingAdPublication, PublicationReview } from "./client";

export interface PublishedAd {
  adId: string;
  slug: string;
  categoryId: string;
  subcategoryId: string;
  advertiserProfileId: string;
}

export interface PendingPublicationTransitionDependencies {
  cleanupImages(userId: string, id: string): Promise<void>;
  publish(userId: string, id: string, reviewed?: PublicationReview): Promise<PublishedAd>;
  read(userId: string, id: string): Promise<PendingAdPublication | null>;
  verifyImages(id: string, paths: string[]): Promise<void>;
  complete(userId: string, id: string, reviewed?: PublicationReview): Promise<void>;
  returnToPending(userId: string, id: string): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  startDelete(userId: string, id: string): Promise<void>;
  purgeImages(id: string): Promise<void>;
}

export function createPendingPublicationTransitions(dependencies: PendingPublicationTransitionDependencies) {
  return {
    async publish(userId: string, id: string, reviewed?: PublicationReview) {
      await dependencies.cleanupImages(userId, id);
      const result = await dependencies.publish(userId, id, reviewed);
      const publication = await dependencies.read(userId, id);
      if (!publication) throw new Error("Publicação não encontrada nesta conta.");
      try {
        await dependencies.verifyImages(id, (publication.images ?? []).map(image => image.path));
        await dependencies.complete(userId, id, reviewed);
      }
      catch (error) {
        await dependencies.returnToPending(userId, id);
        throw error;
      }
      return result;
    },
    async delete(userId: string, id: string) {
      await dependencies.cleanupImages(userId, id);
      await dependencies.startDelete(userId, id);
      await dependencies.purgeImages(id);
      await dependencies.delete(userId, id);
    },
  };
}
