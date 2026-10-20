import { z } from "zod";
import { requestCorrelationIdHeader } from "@tudomacae/www-origin-routing/contract";
import { classifiedsRequestId, parseServiceOrigin } from "./lib/transport";

/**
 * Public, read-only lookups that answer whether a public page's entity exists and
 * which slug its canonical URL carries. The web proxy reads them before rendering;
 * the API Worker serves them from D1 and keeps each answer for
 * `canonicalLookupMaxAge` seconds in its colo cache. Only a request carrying
 * `canonicalLookupFreshHeader` skips the stored answer and replaces it; HTTP
 * cache directives such as the `cache-control: no-cache` that `fetch` adds for
 * `cache: "no-store"` are ignored, so ordinary lookups keep the cache.
 */
export const canonicalLookupPrefix = "/api/classifieds/canonical/";
export const canonicalLookupFreshHeader = "x-classifieds-canonical-fresh";
export const canonicalLookupMaxAge = 30;
/** One lookup's deadline; past it the caller renders the page without a decision. */
export const canonicalLookupTimeoutMs = 1000;

export type CanonicalTarget
  = | { kind: "ad"; id: string }
    | { kind: "category"; categoryId: string }
    | { kind: "subcategory"; categoryId: string; subcategoryId: string }
    | { kind: "profile"; id: string };

const missing = z.strictObject({ exists: z.literal(false) });
const slug = z.string().min(1).max(500);
export const canonicalLookupResults = {
  ad: z.union([missing, z.strictObject({ exists: z.literal(true), slug })]),
  category: z.union([missing, z.strictObject({ exists: z.literal(true), slug })]),
  subcategory: z.union([missing, z.strictObject({ exists: z.literal(true), categorySlug: slug, slug })]),
  /** `exists` is the public Advertiser Profile; `businessTitle` is present only when it is a public Business. */
  profile: z.union([missing, z.strictObject({ exists: z.literal(true), businessTitle: z.string().optional() })]),
};
export type CanonicalLookupResult<K extends CanonicalTarget["kind"]> = z.infer<typeof canonicalLookupResults[K]>;

const segment = z.string().min(1).max(212).regex(/^(?!\.{1,2}$)[^/]+$/u);

export function canonicalLookupPath(target: CanonicalTarget) {
  const encode = encodeURIComponent;
  switch (target.kind) {
    case "ad": return `${canonicalLookupPrefix}ads/${encode(target.id)}`;
    case "category": return `${canonicalLookupPrefix}categories/${encode(target.categoryId)}`;
    case "subcategory": return `${canonicalLookupPrefix}categories/${encode(target.categoryId)}/subcategories/${encode(target.subcategoryId)}`;
    case "profile": return `${canonicalLookupPrefix}profiles/${encode(target.id)}`;
  }
}

const shapes: [RegExp, (parts: string[]) => CanonicalTarget][] = [
  [/^ads\/([^/]+)$/u, ([id]) => ({ kind: "ad", id: id! })],
  [/^profiles\/([^/]+)$/u, ([id]) => ({ kind: "profile", id: id! })],
  [/^categories\/([^/]+)$/u, ([categoryId]) => ({ kind: "category", categoryId: categoryId! })],
  [/^categories\/([^/]+)\/subcategories\/([^/]+)$/u, ([categoryId, subcategoryId]) => ({ kind: "subcategory", categoryId: categoryId!, subcategoryId: subcategoryId! })],
];

function decodedSegments(parts: string[]) {
  try {
    const decoded = parts.map(decodeURIComponent);
    return decoded.every(part => segment.safeParse(part).success) ? decoded : null;
  }
  catch {
    return null;
  }
}

/** Reverses `canonicalLookupPath`; any other shape, or an undecodable or oversized segment, is null. */
export function parseCanonicalLookupPath(path: string): CanonicalTarget | null {
  if (!path.startsWith(canonicalLookupPrefix)) return null;
  for (const [pattern, build] of shapes) {
    const match = pattern.exec(path.slice(canonicalLookupPrefix.length));
    if (!match) continue;
    const parts = decodedSegments(match.slice(1));
    return parts && build(parts);
  }
  return null;
}

/**
 * `correlationId` is the page request's, shared by every lookup that page makes. It
 * travels as `x-correlation-id` and, like every Classifieds call, as `x-request-id`,
 * which the API Worker records on a Classifieds failure; the Worker adopts
 * `x-correlation-id` as its root only with a verified runtime identity, which these
 * public lookups do not carry.
 */
export type CanonicalLookupOptions = { fresh: boolean; correlationId: string };
export type CanonicalLookup = <T extends CanonicalTarget>(target: T, options: CanonicalLookupOptions) => Promise<CanonicalLookupResult<T["kind"]> | undefined>;

/**
 * Never throws: an unreachable, slow, incompatible or failing Worker yields
 * `undefined`, so callers render the page instead of deciding its status.
 */
export function createCanonicalLookup(configuration: { origin: string; publicOrigin: string; allowLocal?: boolean; request?: typeof fetch; timeoutMs?: number }): CanonicalLookup {
  const origin = parseServiceOrigin(configuration, "Destino de Classificados inválido.");
  const publicOrigin = new URL(configuration.publicOrigin).origin;
  return (async (target: CanonicalTarget, { fresh, correlationId }: CanonicalLookupOptions) => {
    const headers = new Headers({ "origin": publicOrigin, "x-request-id": classifiedsRequestId(correlationId), [requestCorrelationIdHeader]: correlationId, "x-classifieds-protocol": "1" });
    if (fresh) headers.set(canonicalLookupFreshHeader, "1");
    // `next.revalidate: 0` keeps the answer out of the Next data cache without the
    // `cache-control: no-cache` that `cache: "no-store"` would send to the Worker.
    const init: RequestInit & { next?: { revalidate: number } } = {
      method: "GET", headers, next: { revalidate: 0 }, redirect: "manual", signal: AbortSignal.timeout(configuration.timeoutMs ?? canonicalLookupTimeoutMs),
    };
    try {
      const response = await (configuration.request ?? fetch)(new URL(canonicalLookupPath(target), origin), init);
      // A Worker without this endpoint answers 404 with no body; only a 200 inside the protocol is an answer.
      if (response.status !== 200 || response.headers.get("x-classifieds-protocol") !== "1") return undefined;
      const result = canonicalLookupResults[target.kind].safeParse(await response.json());
      return result.success ? result.data : undefined;
    }
    catch {
      return undefined;
    }
  }) as CanonicalLookup;
}
