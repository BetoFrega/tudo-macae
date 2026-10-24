import type { createBusinessCatalog } from "@tudomacae/advertiser-identity/business";
import type { createAdvertiserProfiles } from "@tudomacae/advertiser-identity/profiles";
import type { createAdvertiserProfileAdministration } from "@tudomacae/advertiser-identity/administration";
import type { createAdvertiserIdentityDeletion } from "@tudomacae/advertiser-identity/identityDeletion";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";
import type { createCategoryCatalog } from "@tudomacae/categories/categoryCatalog";
import type { createCategoryManagement } from "@tudomacae/categories/categoryManagement";
import type { createCategoryMaintenance } from "@tudomacae/categories/maintenance";
import type { createCategoryLifecycle } from "@tudomacae/categories/categoryLifecycle";
import type { createSubcategoryLifecycle } from "@tudomacae/categories/subcategoryLifecycle";
import { route } from "./route";
type Business = ReturnType<typeof createBusinessCatalog>;
type Profiles = ReturnType<typeof createAdvertiserProfiles>;
type Administration = ReturnType<typeof createAdvertiserProfileAdministration>;
type IdentityDeletion = ReturnType<typeof createAdvertiserIdentityDeletion>;
type Categories = ReturnType<typeof createCategoryManagement>;
type Maintenance = ReturnType<typeof createCategoryMaintenance>;

export { CategoryManagementError } from "@tudomacae/categories/categoryManagement";
export { AdvertiserIdentityTypeConflict, AdvertiserProfileAccessError, AdvertiserProfileRevisionConflict, AdvertiserProfileCreationPayloadConflict, activityAreaCivilDate } from "@tudomacae/advertiser-identity/profiles";
export { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
const first = (input: unknown = {}) => input;
export const getBusinessUseCase = route<Business["read"]>("business.read", first);
export const listBusinessesUseCase = route<Business["list"]>("business.list", first);
export const listSitemapBusinessesUseCase = route<Business["listAll"]>("business.sitemap", () => null);
export const listCategoryBusinessPreviewUseCase = route<Business["previewCategory"]>("business.preview", first);
export const listBusinessCatalogActivityAreasUseCase = route<Business["listRepresentedActivityAreas"]>("business.areas", () => null);
const assessBusinessBatch = route<Business["assessMany"]>("business.assessOwned", profiles => ({ ids: profiles.map(profile => profile.id) }));
/** The Worker assesses at most 100 Profile ids per call; an owner may hold more Business Profiles. */
export async function assessBusinessesUseCase(profiles: Parameters<Business["assessMany"]>[0]) {
  const batches = Array.from({ length: Math.ceil(profiles.length / 100) }, (_, index) => profiles.slice(index * 100, index * 100 + 100));
  return (await Promise.all(batches.map(batch => assessBusinessBatch(batch)))).flat();
}
export async function assessBusinessUseCase(profile: Parameters<Business["assess"]>[0]) {
  const [readiness] = await assessBusinessesUseCase([profile]);
  if (!readiness) throw new Error("Business assessment returned no readiness for the profile.");
  return readiness;
}
export const getCategoriesUseCase = route<ReturnType<typeof createCategoryCatalog>["list"]>("categories.catalog", () => null);
export const createManagedCategoryUseCase = route<Categories["createCategory"]>("categories.create", first, true);
export const createManagedSubcategoryUseCase = route<Categories["createSubcategory"]>("subcategories.create", first, true);
export const updateManagedCategoryUseCase = route<Categories["updateCategory"]>("categories.update", first, true);
export const updateSubcategoryUseCase = route<Maintenance["updateSubcategory"]>("subcategories.update", first, true);
export const deleteCategoryUseCase = route<ReturnType<typeof createCategoryLifecycle>["delete"]>("categories.delete", first, true);
export const deleteSubcategoryUseCase = route<ReturnType<typeof createSubcategoryLifecycle>["delete"]>("subcategories.delete", first, true);
export const seedCategoriesUseCase = route<() => Promise<void>>("categories.seed", () => null, true);
export const createAdvertiserProfileUseCase = route<Profiles["create"]>("profiles.create", input => ({ ...input, operationId: input.operationId ?? crypto.randomUUID() }), true);
export const updateAdvertiserProfileUseCase = route<Profiles["update"]>("profiles.update", first, true);
export const classifyAdvertiserProfileUseCase = route<Profiles["classify"]>("profiles.classify", input => ({ id: input.id, identityType: input.identityType }), true);
export const getAdvertiserProfileUseCase = route<Profiles["read"]>("profiles.private", first);
export const getPublicAdvertiserProfileUseCase = route<Profiles["readPublic"]>("profiles.public", first);
export const verifyAdvertiserProfileOwnershipUseCase = route<Profiles["verifyOwnership"]>("profiles.owned", input => ({ id: input.id }));
export const getUserAdvertiserProfilesUseCase = route<Profiles["listForUser"]>("profiles.forOwner", userId => ({ userId }));
export const getAllAdvertiserProfilesUseCase = route<Profiles["listAll"]>("profiles.all", () => null);
const getActivityAreaAdvertiserProfilesUseCase = route<Profiles["listForActivityArea"]>("profiles.area", first);
export async function listActivityAreaBusinessPreviewUseCase(input: ActivityArea & { civilDate?: string }): Promise<BusinessPublicData[]> {
  return (await getActivityAreaAdvertiserProfilesUseCase(input)).map(profile => ({ ...profile, activityAreas: profile.activityAreas ?? [input] }));
}
export const createAdvertiserProfileAdministrationUseCase = route<Administration["create"]>("profiles.admin.create", first, true);
export const updateAdvertiserProfileAdministrationUseCase = route<Administration["update"]>("profiles.admin.update", first, true);
export const deleteAdvertiserProfileAdministrationUseCase = route<Administration["delete"]>("profiles.admin.delete", first, true);

export const previewAdvertiserIdentityDeletionUseCase = route<IdentityDeletion["preview"]>("profiles.identity.preview", first);
export const deleteAdvertiserIdentityUseCase = route<IdentityDeletion["delete"]>("profiles.identity.delete", first, true);
