import { createPublicAdDiscovery } from "@tudomacae/ads/publicDiscovery";
import { z } from "zod";
import { createAdManagement } from "@tudomacae/ads/management";
import { createAdMutations } from "@tudomacae/ads/adMutations";
import { createAdUpdate } from "@tudomacae/ads/adUpdate";
import { createPublicationPhotos, publicationPhotosInput } from "@tudomacae/ads/publicationPhotos";
import { createPublicationDrafts } from "@tudomacae/ads/publicationDrafts";
import { publicationIdentifier, publicationReviewInput, pendingPublicationInput, publicationProfileInput, createAdInput, updateAdInput, updateAdStatusSchema } from "@tudomacae/ads/validation";
import { AdvertiserProfileAccessError } from "@tudomacae/advertiser-identity/profiles";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import type { ClassifiedsPhotos } from "./classifiedsPhotoHttp";
import type { ClassifiedsActor } from "./classifiedsCapabilities";
import type { ClassifiedsReadOperation, ClassifiedsWriteOperation } from "@tudomacae/classifieds-client/protocol";
import { createClassifiedsAdStores } from "./db/classifiedsAds";
const reference = z.object({ id: publicationIdentifier });
export function createClassifiedsAds(dependencies: {
  persistence: ClassifiedsPersistence; actor?: ClassifiedsActor; now(): number; newId(): string; photos?: ClassifiedsPhotos;
}) {
  const { actor } = dependencies;
  const stores = createClassifiedsAdStores({ ...dependencies, actorId: actor?.uid ?? "", admin: actor?.admin === true, emailVerified: actor?.emailVerified === true });
  const discovery = createPublicAdDiscovery({ store: { read: stores.publicPage }, taxonomy: async () => [] });
  const metadata = createPublicationPhotos({ transact: stores.syncPhotos });
  const drafts = createPublicationDrafts({ store: stores.drafts, now: dependencies.now, authorityMode: "identity" });
  const mutations = createAdMutations({ store: stores.mutations, now: dependencies.now, authorityMode: "identity" });
  const management = createAdManagement({
    store: stores.management,
    canReadOwned: ({ userId, isAdmin }) => userId === actor?.uid || (isAdmin && actor?.admin === true),
    removeDirectory: async () => {},
  });
  const update = createAdUpdate({ read: stores.management.getById, update: mutations.update,
    pendingCleanup: async () => [], remove: async () => "deferred", acknowledge: async () => {},
    correlationId: dependencies.newId, jobId: path => path, report: () => {},
  });
  function human() {
    if (!actor || actor.channel !== "administration") throw new AdvertiserProfileAccessError("forbidden");
    return actor;
  }
  async function create(owner: ClassifiedsActor, input: unknown) {
    const id = z.object({ id: publicationIdentifier }).parse(input).id;
    const creation = createClassifiedsAdStores({ ...dependencies, newId: () => id, actorId: owner.uid, admin: owner.admin, emailVerified: owner.emailVerified === true });
    return createAdManagement({ store: creation.management, removeDirectory: async () => {} }).create({ ...createAdInput.parse(input), userId: owner.uid });
  }
  async function publish(owner: ClassifiedsActor, input: unknown) {
    const value = reference.extend({ reviewed: publicationReviewInput.optional() }).parse(input);
    const record = await stores.drafts.read(value.id);
    let revision: number | undefined;
    if (record?.publicationState !== "published") {
      if (!dependencies.photos) throw new Error("Photo qualification unavailable");
      revision = (await dependencies.photos.publication({ uid: owner.uid, admin: false }, value.id)).revision;
    }
    return stores.publish(value.id, value.reviewed, revision);
  }
  return {
    async read(operation: ClassifiedsReadOperation, input: unknown) {
      if (operation === "ads.read") return stores.publicRead(reference.parse(input).id);
      if (operation === "ads.page") return discovery.read(input as Parameters<typeof discovery.read>[0]);
      if (operation === "ads.sitemap") {
        z.strictObject({}).parse(input);
        return stores.sitemap();
      }
      if (operation === "ads.forProfile") return management.listForProfile(z.object({ profileId: publicationIdentifier }).parse(input));
      const owner = human();
      switch (operation) {
        case "ads.owned": return management.readOwned({ ...reference.parse(input), userId: owner.uid, isAdmin: owner.admin, includePendingImages: z.object({ includePendingImages: z.boolean().optional() }).parse(input).includePendingImages });
        case "ads.all": return management.listAll();
        case "ads.forOwner": return management.listForUser(z.object({ userId: publicationIdentifier }).parse(input));
        case "publications.read": return drafts.read(owner.uid, reference.parse(input).id);
        case "publications.mine": return drafts.list(owner.uid);
      }
    },
    async write(operation: ClassifiedsWriteOperation, input: unknown) {
      const owner = human();
      switch (operation) {
        case "ads.create": return create(owner, input);
        case "ads.update": return update.update(updateAdInput.parse(input));
        case "ads.status":
          await mutations.updateStatus(updateAdStatusSchema.parse(input));
          return null;
        case "ads.delete":
          await management.delete(reference.parse(input));
          return null;
        case "publications.photos": return metadata.sync(publicationPhotosInput.parse(input));
        case "publications.save": return drafts.save(owner.uid, pendingPublicationInput.parse(input));
        case "publications.profile": return drafts.saveProfile(owner.uid, publicationProfileInput.parse(input));
        case "publications.delete":
          await stores.deleteDraft(reference.parse(input).id);
          return null;
        case "publications.publish": return publish(owner, input);
      }
    },
  };
}
