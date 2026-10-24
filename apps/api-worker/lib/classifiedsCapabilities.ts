import { createBusinessCatalog } from "@tudomacae/advertiser-identity/business";
import { createAdvertiserIdentityDeletion } from "@tudomacae/advertiser-identity/identityDeletion";
import { isAdImagePath } from "@tudomacae/ads/imagePath";
import { createClassifiedsIdentityDeletionStore } from "./db/classifiedsIdentityDeletion";
import { createClassifiedsOfferings } from "./classifiedsOfferings";
import type { CatalogFlagDecision } from "@tudomacae/advertiser-identity/offeringCatalog";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createClassifiedsAds } from "./classifiedsAds";
import type { ClassifiedsPhotos } from "./classifiedsPhotoHttp";
import supportedIcons from "./supportedIcons.json";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { createCategoryManagement } from "@tudomacae/categories/categoryManagement";
import { createCategoryCatalog } from "@tudomacae/categories/categoryCatalog";
import { createCategoryMaintenance } from "@tudomacae/categories/maintenance";
import { createCategoryLifecycle } from "@tudomacae/categories/categoryLifecycle";
import { createSubcategoryLifecycle } from "@tudomacae/categories/subcategoryLifecycle";
import initialCategories from "@tudomacae/categories/initialCategories";
import { createAdvertiserProfiles, AdvertiserProfileAccessError } from "@tudomacae/advertiser-identity/profiles";
import { createAdvertiserProfileAdministration } from "@tudomacae/advertiser-identity/administration";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import type { ClassifiedsReadOperation, ClassifiedsWriteOperation } from "@tudomacae/classifieds-client/protocol";
import { createClassifiedsCategoryStores } from "./db/classifiedsCategories";
import { createClassifiedsProfileStore } from "./db/classifiedsProfiles";
import { createClassifiedsAdministrationStore } from "./db/classifiedsAdministration";
import { activityAreaActive } from "./db/classifiedsSupport";
import { createClassifiedsBusinessCatalogStore, readBusinessCatalogSnapshot } from "./db/classifiedsBusinessCatalog";

export type ClassifiedsActor = { uid: string; admin: boolean; editor: boolean; emailVerified?: boolean; channel: "administration" };
const reference = z.object({ id: z.string().min(1) });
const area = z.object({ categoryId: z.string().min(1), subcategoryId: z.string().min(1), civilDate: z.string().optional() });
const businessList = z.object({
  namePrefix: z.string().max(100).optional(), categoryId: z.string().min(1).optional(), cursor: z.string().max(4096).optional(), limit: z.number().int().optional(),
  activityArea: z.object({ categoryId: z.string().min(1), subcategoryId: z.string().min(1) }).optional(),
});
const businessPreview = z.object({ categoryId: z.string(), civilDate: z.string() });
const ownedIds = z.object({ ids: z.array(z.string().min(1).max(128)).max(100) });
const fields = z.record(z.string(), z.unknown());
const icons = new Set(supportedIcons);

/** Only verified actors enter this composition; HTTP authentication owns their construction. */
export function createClassifiedsCapabilities(dependencies: {
  persistence: ClassifiedsPersistence; actor?: ClassifiedsActor; correlationId: string;
  now?: () => number; newId?: () => string; photoUrl?: (path: string) => string; photos?: ClassifiedsPhotos;
  observeOffering?: Parameters<typeof createClassifiedsOfferings>[0]["observe"];
  environment?: string; release?: string;
  offeringFlag?: (id: string) => Promise<CatalogFlagDecision>;
}) {
  const { actor, persistence } = dependencies;
  const now = dependencies.now ?? Date.now;
  const newId = dependencies.newId ?? randomUUID;
  const ads = createClassifiedsAds({ ...dependencies, now, newId });
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const taxonomy = createClassifiedsCategoryStores({ persistence, actorId: actor?.uid ?? "", now, newId });
  const management = createCategoryManagement({ store: taxonomy.management, slugify, isSupportedIcon: name => icons.has(name) });
  const catalog = createCategoryCatalog(management);
  const maintenance = createCategoryMaintenance({ management, categories: taxonomy.categories, subcategories: taxonomy.subcategories, slugify, newIdempotencyKey: newId });
  const profiles = createAdvertiserProfiles({
    store: createClassifiedsProfileStore({ persistence, actorId: actor?.uid ?? "", admin: actor?.admin === true, now, newId, photoUrl: dependencies.photoUrl }),
    activityAreaCatalog: { isActive: value => activityAreaActive(persistence, value) },
    now, digest, ownsAdImagePath: () => false, newCorrelationId: newId,
    reportImageCleanupSkipped: () => { throw new Error("Identity deletion requires its aggregate composition."); },
  });
  const identityDeletion = createAdvertiserIdentityDeletion({
    store: createClassifiedsIdentityDeletionStore({ persistence, now }), digest, ownsImagePath: isAdImagePath, now,
    reportImageCleanupSkipped: value => console.info(JSON.stringify({ event: "identity_deletion_shared_images_preserved", service: "api-worker", environment: dependencies.environment ?? "qualification", release: dependencies.release ?? "unknown", outcome: "preserved", correlationId: value.correlationId, count: value.count })),
  });
  const businessCatalog = () => createBusinessCatalog(createClassifiedsBusinessCatalogStore(persistence, dependencies.photoUrl));
  const business = businessCatalog();
  function snapshot<T>(read: (catalog: ReturnType<typeof createBusinessCatalog>) => Promise<T>) {
    return readBusinessCatalogSnapshot(() => read(businessCatalog()));
  }
  const offerings = createClassifiedsOfferings({ persistence, now, newId, flag: dependencies.offeringFlag, observe: dependencies.observeOffering, isPublicBusiness: async id => Boolean(await business.read({ id })) });
  const subcategories = createSubcategoryLifecycle({ subcategories: taxonomy.subcategories, activityAreas: { removeAll: profiles.removeActivityArea } });
  const categories = createCategoryLifecycle({ categories: taxonomy.categories, subcategories });
  const administration = createAdvertiserProfileAdministration({ store: createClassifiedsAdministrationStore({ persistence, now, newId, digest, photoUrl: dependencies.photoUrl }), now, digestConfirmationEvidence: digest });
  function authenticated() {
    if (!actor) throw new AdvertiserProfileAccessError("forbidden");
    return actor;
  }
  function administrator() {
    const value = authenticated();
    if (!value.admin) throw new AdvertiserProfileAccessError("forbidden");
    return value;
  }
  function adminInput(input: unknown) {
    const value = administrator();
    return { ...fields.parse(input), actorId: value.uid, channel: value.channel, correlationId: dependencies.correlationId };
  }
  const isAdOperation = (operation: string) => operation.startsWith("ads.") || operation.startsWith("publications.");
  const readHandlers: Partial<Record<ClassifiedsReadOperation, (input: unknown) => unknown>> = {
    "categories.catalog": () => catalog.list(),
    "categories.list": input => management.listCategories(input ?? {}),
    "subcategories.list": input => management.listSubcategories(input),
    "subcategories.resolve": (input) => {
      const value = z.object({ categorySlug: z.string(), subcategorySlug: z.string() }).parse(input);
      return maintenance.resolveSubcategoryBySlugs(value.categorySlug, value.subcategorySlug);
    },
    "business.read": input => business.read(reference.parse(input)),
    "business.list": (input) => {
      const query = businessList.parse(input ?? {});
      return snapshot(read => read.list(query));
    },
    "business.sitemap": () => snapshot(read => read.listAll()),
    "business.preview": (input) => {
      const query = businessPreview.parse(input);
      return snapshot(read => read.previewCategory(query));
    },
    "business.areas": () => snapshot(read => read.listRepresentedActivityAreas()),
    "business.assessOwned": async (input) => {
      authenticated();
      const { ids } = ownedIds.parse(input);
      // Readiness is assessed only over the session owner's stored Profiles, never over caller-supplied data.
      const owned = new Map((await profiles.listForUser(authenticated().uid)).map(profile => [profile.id, profile]));
      return business.assessMany(ids.map((id) => {
        const profile = owned.get(id);
        if (!profile) throw new AdvertiserProfileAccessError("not-found");
        return profile;
      }));
    },
    "profiles.public": input => profiles.readPublic(reference.parse(input)),
    "profiles.area": input => profiles.listForActivityArea(area.parse(input)),
    "profiles.owned": (input) => {
      authenticated();
      return profiles.verifyOwnership({ ...reference.parse(input), userId: authenticated().uid });
    },
    "profiles.mine": () => {
      authenticated();
      return profiles.listForUser(authenticated().uid);
    },
    "profiles.forOwner": (input) => {
      authenticated();
      const { userId } = z.object({ userId: z.string().min(1).max(128) }).parse(input);
      if (userId !== authenticated().uid) administrator();
      return profiles.listForUser(userId);
    },
    "profiles.all": () => {
      authenticated();
      administrator();
      return profiles.listAll();
    },
    "profiles.private": (input) => {
      authenticated();
      const value = reference.parse(input);
      return authenticated().admin ? profiles.read(value) : profiles.verifyOwnership({ ...value, userId: authenticated().uid });
    },
    "profiles.identity.preview": input => identityDeletion.preview(adminInput(input)),
    "profiles.admin.list": (input) => {
      administrator();
      return administration.list(input ?? {});
    },
    "profiles.admin.get": (input) => {
      administrator();
      return administration.get(input);
    },
    "profiles.admin.duplicates": (input) => {
      administrator();
      return administration.findDuplicates(input);
    },
  };
  const writeHandlers: Partial<Record<ClassifiedsWriteOperation, (input: unknown) => unknown>> = {
    "profiles.create": (input) => {
      authenticated();
      const value = fields.parse(input);
      const operationId = z.string().min(1).parse(value.operationId);
      return profiles.create({ ...value, userId: authenticated().uid, operationId } as Parameters<typeof profiles.create>[0]);
    },
    "profiles.update": (input) => {
      authenticated();
      return profiles.update(fields.parse(input) as Parameters<typeof profiles.update>[0]);
    },
    "profiles.classify": (input) => {
      authenticated();
      return profiles.classify({ ...fields.parse(input), userId: authenticated().uid } as Parameters<typeof profiles.classify>[0]);
    },
    "profiles.identity.delete": input => identityDeletion.delete(adminInput(input)),
    "profiles.admin.create": input => administration.create(adminInput(input)),
    "profiles.admin.update": input => administration.update(adminInput(input)),
    "profiles.admin.delete": input => administration.delete(adminInput(input)),
    "categories.create": (input) => {
      administrator();
      return management.createCategory(input);
    },
    "subcategories.create": (input) => {
      administrator();
      return management.createSubcategory(input);
    },
  };
  /** Taxonomy maintenance requires a human administrator before the operation is resolved. */
  const maintenanceHandlers: Partial<Record<ClassifiedsWriteOperation, (input: unknown) => unknown>> = {
    "categories.update": input => management.updateCategory(input),
    "categories.delete": input => categories.delete(reference.parse(input)),
    "categories.seed": () => maintenance.seed(initialCategories),
    "subcategories.update": input => maintenance.updateSubcategory(input),
    "subcategories.delete": input => subcategories.delete(area.parse(input)),
  };
  return {
    async read(operation: ClassifiedsReadOperation, input: unknown) {
      if (isAdOperation(operation)) return ads.read(operation, input);
      if (operation.startsWith("offerings.")) {
        if (operation === "offerings.management") authenticated();
        return offerings.read(operation, input, actor);
      }
      return readHandlers[operation]?.(input);
    },
    async write(operation: ClassifiedsWriteOperation, input: unknown) {
      authenticated();
      if (isAdOperation(operation)) return ads.write(operation, input);
      if (operation.startsWith("offerings.")) return offerings.write(operation, input, authenticated());
      const handler = writeHandlers[operation];
      if (handler) return handler(input);
      authenticated();
      administrator();
      return maintenanceHandlers[operation]?.(input);
    },
  };
}
