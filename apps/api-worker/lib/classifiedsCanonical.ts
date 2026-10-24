import type { AdData } from "@tudomacae/ads/types";
import { publicationIdentifier } from "@tudomacae/ads/validation";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import type { PublicAdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { CategoryManagementError, type CategoryPage } from "@tudomacae/categories/categoryManagement";
import type { IdentityDeletionPreview } from "@tudomacae/advertiser-identity/identityDeletion";
import { canonicalLookupFreshHeader, canonicalLookupMaxAge, canonicalLookupPath, canonicalLookupPrefix, parseCanonicalLookupPath, type CanonicalLookupResult, type CanonicalTarget } from "@tudomacae/classifieds-client/canonical";
import type { ClassifiedsWriteOperation } from "@tudomacae/classifieds-client/protocol";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { z } from "zod";
import { createClassifiedsCapabilities } from "./classifiedsCapabilities";

export const isClassifiedsCanonicalRoute = (path: string) => path.startsWith(canonicalLookupPrefix);

type Capabilities = ReturnType<typeof createClassifiedsCapabilities>;

type Answer = CanonicalLookupResult<CanonicalTarget["kind"]>;

async function adAnswer(id: string, capabilities: Capabilities): Promise<Answer> {
  if (!publicationIdentifier.safeParse(id).success) return { exists: false };
  const ad = await capabilities.read("ads.read", { id }) as AdData | null;
  return ad?.slug ? { exists: true, slug: ad.slug } : { exists: false };
}

async function profileAnswer(id: string, capabilities: Capabilities): Promise<Answer> {
  const [profile, business] = await Promise.all([
    capabilities.read("profiles.public", { id }) as Promise<PublicAdvertiserProfileData | null>,
    capabilities.read("business.read", { id }) as Promise<BusinessPublicData | null>,
  ]);
  if (business) return { exists: true, businessTitle: business.title };
  return profile ? { exists: true } : { exists: false };
}

type TaxonomyPage = CategoryPage<{ id: string; slug?: string }>;

async function findInPages(id: string, page: (cursor?: string) => Promise<TaxonomyPage>) {
  let cursor: string | undefined;
  do {
    const current = await page(cursor);
    const found = current.items.find(item => item.id === id);
    if (found) return found;
    cursor = current.nextCursor;
  } while (cursor);
  return undefined;
}

/** Pages only the requested category's list, so a lookup never reads the whole catalog. */
async function taxonomyAnswer(target: CanonicalTarget & { kind: "category" | "subcategory" }, capabilities: Capabilities): Promise<Answer> {
  const category = await findInPages(target.categoryId, cursor =>
    capabilities.read("categories.list", { limit: 50, ...(cursor ? { cursor } : {}) }) as Promise<TaxonomyPage>);
  if (!category?.slug) return { exists: false };
  if (target.kind === "category") return { exists: true, slug: category.slug };
  const subcategory = await findInPages(target.subcategoryId, cursor =>
    capabilities.read("subcategories.list", { categoryId: category.id, limit: 50, ...(cursor ? { cursor } : {}) }) as Promise<TaxonomyPage>)
    .catch((error: unknown) => {
      if (error instanceof CategoryManagementError && error.code === "notFound") return undefined;
      throw error;
    });
  return subcategory?.slug ? { exists: true, categorySlug: category.slug, slug: subcategory.slug } : { exists: false };
}

/** Each answer mirrors the anonymous read its public page renders, reduced to existence and slug. */
function answer(target: CanonicalTarget, capabilities: Capabilities): Promise<Answer> {
  if (target.kind === "ad") return adAnswer(target.id, capabilities);
  if (target.kind === "profile") return profileAnswer(target.id, capabilities);
  return taxonomyAnswer(target, capabilities);
}

type CanonicalDependencies = {
  persistence?: ClassifiedsPersistence; qualification?: () => Promise<boolean>; cache?: Cache;
};

async function qualified(dependencies: CanonicalDependencies) {
  return await dependencies.qualification?.() === true;
}

async function storedAnswer(request: Request, key: Request, cache: Cache | undefined) {
  if (request.headers.get(canonicalLookupFreshHeader) === "1") return undefined;
  const cached = await cache?.match(key).catch(() => undefined);
  return cached && new Response(cached.body, cached);
}

/**
 * Public existence and canonical-slug lookups for the web proxy. They carry no
 * session and change nothing, so they answer before request admission. The colo
 * cache keeps each answer `canonicalLookupMaxAge` seconds; only a request carrying
 * `canonicalLookupFreshHeader: 1` reads D1 and replaces the stored answer. Without the
 * Worker authority the lookup answers 503 and the proxy renders the page.
 */
export async function serveClassifiedsCanonical(request: Request, path: string, dependencies: CanonicalDependencies) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const target = parseCanonicalLookupPath(path);
  if (!target) return new Response(null, { status: 404 });
  const key = new Request(new URL(path, request.url), { method: "GET" });
  const stored = await storedAnswer(request, key, dependencies.cache);
  if (stored) return stored;
  if (!dependencies.persistence || !(await qualified(dependencies))) return new Response(null, { status: 503 });
  const capabilities = createClassifiedsCapabilities({ persistence: dependencies.persistence, correlationId: request.headers.get("x-request-id") ?? crypto.randomUUID() });
  const response = Response.json(await answer(target, capabilities), { headers: { "cache-control": `public, max-age=${canonicalLookupMaxAge}` } });
  await dependencies.cache?.put(key, response.clone()).catch(() => undefined);
  return response;
}

/** The targets a write turns into `exists: false`, read before the write removes them. */
async function removedTargets(capabilities: Capabilities, operation: ClassifiedsWriteOperation, input: unknown): Promise<CanonicalTarget[]> {
  const raw = z.object({ id: z.string() }).safeParse(input).data?.id;
  if (raw === undefined) return [];
  // `ads.delete` uses the id verbatim.
  if (operation === "ads.delete") return [{ kind: "ad", id: raw }];
  // Both profile deletion schemas trim the id.
  const id = raw.trim();
  if (operation === "profiles.admin.delete") return [{ kind: "profile", id }];
  if (operation !== "profiles.identity.delete") return [];
  // A failed preview leaves the profile's ads to expire; the deletion itself decides whether the write succeeds.
  const preview = await capabilities.read("profiles.identity.preview", { id }).catch(() => null) as IdentityDeletionPreview | null;
  return [{ kind: "profile", id: preview?.profileId ?? id }, ...(preview?.ads ?? []).map(ad => ({ kind: "ad" as const, id: ad.id }))];
}

/**
 * The proxy renders on a stored `exists: true`, and a streamed page answers its own
 * not-found with status 200. Writes that remove a public ad or profile therefore drop
 * its stored answers from this colo's cache; another colo keeps its answer for up to
 * `canonicalLookupMaxAge` seconds.
 */
export function purgingCanonicalAnswers(capabilities: Capabilities, request: Request, cache: Cache | undefined, reportFailed: (operation: ClassifiedsWriteOperation, count: number) => void): Capabilities {
  if (!cache) return capabilities;
  return {
    ...capabilities,
    async write(operation, input) {
      const targets = await removedTargets(capabilities, operation, input);
      const result = await capabilities.write(operation, input);
      const purges = await Promise.allSettled(targets.map(target => cache.delete(new Request(new URL(canonicalLookupPath(target), request.url), { method: "GET" }))));
      const failed = purges.filter(purge => purge.status === "rejected").length;
      // The write already succeeded; a rejected purge only leaves that answer to expire.
      if (failed > 0) reportFailed(operation, failed);
      return result;
    },
  };
}
