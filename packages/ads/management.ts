import { slugify } from "@tudomacae/text-normalization/slugify";
import { listAdsByUserSchema, listAdsByProfileSchema, type ListAdsByUserInput, type ListAdsByProfileInput, createAdInput, getAdSchema, deleteAdSchema, type DeleteAdInput, type CreateAdInput, type GetAdInput } from "./validation";
import type { AdData, AdRecord } from "./types";
import { AdOperationError } from "./operationError";

export interface AdManagementStore {
  create(record: AdRecord): Promise<string>;
  getById(id: string, includePendingImages?: boolean): Promise<AdData | null>;
  getAll(): Promise<AdData[]>;
  getByUserId(userId: string): Promise<AdData[]>;
  getActiveByProfileId(profileId: string): Promise<AdData[]>;
  getPendingImageCleanupPaths(id: string): Promise<string[]>;
  delete(id: string): Promise<void>;
}
export interface CreateAdParams extends CreateAdInput { userId: string; id?: string }
export interface CreateAdResult { id: string; slug: string }
export type OwnedAdInput = GetAdInput & { userId: string; isAdmin?: boolean | undefined; includePendingImages?: boolean | undefined };

export function createAdManagement(dependencies: {
  store: AdManagementStore;
  canReadOwned?(input: { ad: AdData; userId: string; isAdmin: boolean }): boolean;
  removeDirectory(input: { adId: string; paths: string[] }): Promise<void>;
}) {
  const { store } = dependencies;
  return {
    async listAll() { return store.getAll(); },
    async listForUser(params: ListAdsByUserInput) { return store.getByUserId(listAdsByUserSchema.parse(params).userId); },
    async listForProfile(params: ListAdsByProfileInput) { return store.getActiveByProfileId(listAdsByProfileSchema.parse(params).profileId); },
    async create(params: CreateAdParams): Promise<CreateAdResult> {
      const fields = createAdInput.parse(params);
      const slug = slugify(fields.title);
      const id = await store.create({ ...fields, userId: params.userId, slug, status: "active", images: [] });
      return { id, slug };
    },
    async delete(params: DeleteAdInput) {
      const { id } = deleteAdSchema.parse(params);
      const ad = await store.getById(id, true);
      if (!ad) return;
      await dependencies.removeDirectory({ adId: id, paths: [...new Set([...ad.images.map(image => image.path), ...await store.getPendingImageCleanupPaths(id)])] });
      await store.delete(id);
    },
    async read(params: GetAdInput) {
      return store.getById(getAdSchema.parse(params).id);
    },
    async readOwned(params: OwnedAdInput) {
      const ad = await store.getById(getAdSchema.parse(params).id, params.includePendingImages);
      if (!ad) throw new AdOperationError("not-found", "Ad not found");
      if (dependencies.canReadOwned
        ? !dependencies.canReadOwned({ ad, userId: params.userId, isAdmin: params.isAdmin === true })
        : ad.userId !== params.userId && !params.isAdmin) {
        throw new Error("Unauthorized: You can only access your own ads");
      }
      return ad;
    },
  };
}
