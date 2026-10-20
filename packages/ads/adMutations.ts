import { AdOperationError } from "./operationError";
import { assertPublishableProfile } from "./publicationEligibility";
import { assertProfileBelongsToAdOwner } from "./profileAssignment";
import { z } from "zod";
import { assertAdImagePathsReusable } from "./imageRetirement";

export type AdStatus = "paused" | "active";

export interface AdMutationRecord {
  userId: string;
  images?: unknown[] | undefined;
  cancelledImageIds?: string[] | undefined;
  pendingImageCleanupPaths?: string[] | undefined;
  advertiserProfileId?: string | undefined;
  publicationState?: string | undefined;
  status?: AdStatus | undefined;
}

export interface AdMutationFields {
  advertiserProfileId?: string | undefined;
  categoryId?: string | undefined;
  subcategoryId?: string | undefined;
  title?: string | undefined;
  slug?: string | undefined;
  text?: string | undefined;
  status?: AdStatus | undefined;
  images?: unknown[] | undefined;
  imageSnapshotIds?: string[] | undefined;
  cancelImageIds?: string[] | undefined;
  cancelImagePaths?: string[] | undefined;
  cancelledImageIds?: string[] | undefined;
  pendingImageCleanupPaths?: string[] | undefined;
}

export interface AdMutationTransaction {
  read(): Promise<AdMutationRecord | null>;
  readProfile(profileId: string): Promise<unknown>;
  readRetiredPaths(paths: readonly string[]): Promise<string[]>;
  update(fields: AdMutationFields & { completedWriterPaths?: string[]; publicationState?: string; updatedAt: number }): void;
}

export interface AdMutationStore {
  /** Re-runs the decision against fresh reads when a concurrent write wins. */
  transact(id: string, decide: (transaction: AdMutationTransaction) => Promise<void>): Promise<void>;
}

const adIdentifier = z.string().min(1, "Ad ID is required");
const adStatus = z.enum(["paused", "active"]);

function profileOwnerId(profile: unknown) {
  if (!profile || typeof profile !== "object" || !("userId" in profile)) return undefined;
  return typeof profile.userId === "string" ? profile.userId : undefined;
}

function imageId(image: unknown): string | undefined {
  return image && typeof image === "object" && "id" in image && typeof image.id === "string" ? image.id : undefined;
}

function isPendingImage(image: unknown): boolean {
  return Boolean(image && typeof image === "object" && "pending" in image && image.pending === true);
}

function reconcileImages(submitted: unknown[], snapshotIds: string[], current: unknown[], cancelled: Set<string>): unknown[] {
  const observed = new Set(snapshotIds);
  const fresh = new Map(current.map(image => [imageId(image), image]));
  const result = submitted.flatMap((image) => {
    const id = imageId(image);
    if (id && cancelled.has(id)) return [];
    if (!id || !isPendingImage(image)) return [image];
    const latest = fresh.get(id);
    if (!latest || typeof image !== "object" || !image || typeof latest !== "object") return [];
    const { pending: _pending, path: _path, ...metadata } = image as { pending?: boolean; path?: string; id: string };
    return [{ ...latest, ...metadata }];
  });
  const resultIds = new Set(result.map(imageId));
  for (const image of current) {
    const id = imageId(image);
    if (id && !observed.has(id) && !resultIds.has(id) && !cancelled.has(id)) result.push(image);
  }
  return result;
}

type AuthorityMode = "legacy" | "identity";

interface AdOwnership {
  currentProfile: unknown;
  currentOwnerId: string | undefined;
}

async function readAdOwnership(transaction: AdMutationTransaction, ad: AdMutationRecord, authorityMode: AuthorityMode | undefined): Promise<AdOwnership> {
  if (authorityMode !== "identity" || !ad.advertiserProfileId) return { currentProfile: undefined, currentOwnerId: ad.userId };
  const currentProfile = await transaction.readProfile(ad.advertiserProfileId);
  return { currentProfile, currentOwnerId: profileOwnerId(currentProfile) };
}

async function readSelectedProfile(transaction: AdMutationTransaction, ad: AdMutationRecord, profileId: string, ownership: AdOwnership) {
  const selectedProfile = profileId === ad.advertiserProfileId && ownership.currentProfile
    ? ownership.currentProfile
    : await transaction.readProfile(profileId);
  assertProfileBelongsToAdOwner(
    ownership.currentOwnerId ?? "",
    profileOwnerId(selectedProfile),
  );
  return selectedProfile;
}

async function readActivationProfile(transaction: AdMutationTransaction, ad: AdMutationRecord, advertiserProfileId: string | undefined, ownership: AdOwnership) {
  const reusableProfile = advertiserProfileId === ad.advertiserProfileId ? ownership.currentProfile : undefined;
  return reusableProfile ?? (advertiserProfileId ? await transaction.readProfile(advertiserProfileId) : undefined);
}

async function assertActivatable(transaction: AdMutationTransaction, ad: AdMutationRecord, fields: AdMutationFields, selectedProfile: unknown, ownership: AdOwnership) {
  const advertiserProfileId = fields.advertiserProfileId ?? ad.advertiserProfileId;
  const profile = selectedProfile ?? await readActivationProfile(transaction, ad, advertiserProfileId, ownership);
  const ownedProfile = profile && ownership.currentOwnerId
    && profileOwnerId(profile) === ownership.currentOwnerId
    ? profile
    : undefined;
  assertPublishableProfile(ownedProfile);
}

function imagePath(image: unknown): string | undefined {
  return image && typeof image === "object" && "path" in image && typeof image.path === "string" ? image.path : undefined;
}

async function assertImagesReusable(transaction: AdMutationTransaction, images: unknown[]) {
  const paths = images.flatMap(image => imagePath(image) ?? []);
  assertAdImagePathsReusable(paths, await transaction.readRetiredPaths(paths));
}

function completedWriterPathsFor(ad: AdMutationRecord, cancelImagePaths: readonly string[]) {
  const images = ad.images ?? [];
  return cancelImagePaths.filter(path => images.some(image => imagePath(image) === path && !isPendingImage(image)));
}

function nextImages(fields: AdMutationFields, ad: AdMutationRecord, cancelled: Set<string>) {
  return fields.images && fields.imageSnapshotIds
    ? reconcileImages(fields.images, fields.imageSnapshotIds, ad.images ?? [], cancelled)
    : fields.images;
}

function pausedPublicationFields(fields: AdMutationFields, ad: AdMutationRecord) {
  return fields.status === "paused" && ad.publicationState === "publishing"
    ? { publicationState: "published" }
    : {};
}

function cancellationFields(ad: AdMutationRecord, cancelled: Set<string>, cancelImageIds: string[] | undefined, cancelImagePaths: string[] | undefined) {
  const completedWriterPaths = completedWriterPathsFor(ad, cancelImagePaths ?? []);
  return {
    ...(completedWriterPaths.length ? { completedWriterPaths } : {}),
    ...(cancelImageIds?.length ? { cancelledImageIds: [...cancelled] } : {}),
    ...(cancelImagePaths?.length ? { pendingImageCleanupPaths: [...new Set([...(ad.pendingImageCleanupPaths ?? []), ...cancelImagePaths])] } : {}),
  };
}

export function createAdMutations(dependencies: { store: AdMutationStore; now(): number; authorityMode?: AuthorityMode }) {
  const update = async (id: string, fields: AdMutationFields) => {
    const validatedId = adIdentifier.parse(id);
    await dependencies.store.transact(validatedId, async (transaction) => {
      const ad = await transaction.read();
      if (!ad || ad.publicationState === "pending") {
        throw new AdOperationError("conflict", "Conclua a publicação pela página de publicação.");
      }

      const ownership = await readAdOwnership(transaction, ad, dependencies.authorityMode);
      const selectedProfile = fields.advertiserProfileId
        ? await readSelectedProfile(transaction, ad, fields.advertiserProfileId, ownership)
        : undefined;
      if (fields.status === "active") await assertActivatable(transaction, ad, fields, selectedProfile, ownership);

      const { imageSnapshotIds: _imageSnapshotIds, cancelImageIds, cancelImagePaths, ...persistedFields } = fields;
      const cancelled = new Set([...(ad.cancelledImageIds ?? []), ...(cancelImageIds ?? [])]);
      const images = nextImages(fields, ad, cancelled);
      if (images) await assertImagesReusable(transaction, images);
      transaction.update({
        ...persistedFields,
        ...(images ? { images } : {}),
        ...cancellationFields(ad, cancelled, cancelImageIds, cancelImagePaths),
        ...pausedPublicationFields(fields, ad),
        updatedAt: dependencies.now(),
      });
    });
  };
  return {
    update,
    async updateStatus(input: { id: string; status: AdStatus }) {
      const validated = z.object({ id: adIdentifier, status: adStatus }).parse(input);
      await update(validated.id, { status: validated.status });
    },
  };
}
