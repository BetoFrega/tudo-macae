import { NextResponse, type NextRequest } from "next/server";
import type { CanonicalLookup, CanonicalLookupResult, CanonicalTarget } from "@tudomacae/classifieds-client/canonical";

/** The heading and message of the entity's own not-found page, which the proxy answers in its place. */
export type NotFoundCopy = { heading: string; message: string };
type NotFoundDecision = { kind: "notFound"; copy?: NotFoundCopy };
type RedirectDecision = { kind: "redirect"; path: string; carryAdCursor?: boolean; temporary?: boolean };
type Decision = { kind: "render" } | NotFoundDecision | RedirectDecision;
type PageRule<K extends CanonicalTarget["kind"]> = {
  target: CanonicalTarget & { kind: K };
  decide(result: CanonicalLookupResult<K>): Decision;
  /** The answer when the lookup is unavailable; absent, the page renders. */
  unavailable?: Decision;
};
type AnyPageRule = { [K in CanonicalTarget["kind"]]: PageRule<K> }[CanonicalTarget["kind"]];
/** A path whose identifier no public entity can carry needs no lookup to answer 404. */
type DefiniteRule = { definite: NotFoundDecision };

const render: Decision = { kind: "render" };
const notFound: NotFoundDecision = { kind: "notFound" };
const adNotFound: NotFoundDecision = { kind: "notFound", copy: { heading: "Anúncio não encontrado", message: "O anúncio que você está procurando não existe ou foi removido." } };
const profileNotFound: NotFoundDecision = { kind: "notFound", copy: { heading: "Perfil não encontrado", message: "O perfil de anunciante que você está procurando não existe ou está indisponível." } };
function rule<K extends CanonicalTarget["kind"]>(target: CanonicalTarget & { kind: K }, decide: (result: CanonicalLookupResult<K>) => Decision, unavailable?: Decision): AnyPageRule {
  return { target, decide, ...(unavailable ? { unavailable } : {}) } as unknown as AnyPageRule;
}
const segment = encodeURIComponent;

function decodedSegments(pathname: string) {
  try {
    return pathname.split("/").slice(1).map(decodeURIComponent);
  }
  catch {
    return undefined;
  }
}

/** The page validates pagination before redirecting a paginated listing to its canonical slug. */
function slugRedirect(request: NextRequest, path: string): Decision {
  return request.nextUrl.searchParams.has("adCursor") ? render : { kind: "redirect", path };
}

async function adRule(id: string, slug: string | undefined): Promise<AnyPageRule | DefiniteRule> {
  const { publicationIdentifier } = await import("@tudomacae/ads/validation");
  if (!publicationIdentifier.safeParse(id).success) return { definite: adNotFound };
  return rule({ kind: "ad", id }, (result) => {
    if (!result.exists) return adNotFound;
    return result.slug === slug ? render : { kind: "redirect", path: `/anuncio/${segment(id)}/${segment(result.slug)}` };
  });
}

function categoryRule(request: NextRequest, categoryId: string, slug: string | undefined): AnyPageRule {
  return rule({ kind: "category", categoryId }, (result) => {
    if (!result.exists) return notFound;
    const path = `/categoria/${segment(categoryId)}/${segment(result.slug)}`;
    if (slug === undefined) return { kind: "redirect", path };
    return result.slug === slug ? render : slugRedirect(request, path);
  });
}

function subcategoryRule(request: NextRequest, [categoryId, categorySlug, subcategoryId, subcategorySlug]: string[]): AnyPageRule {
  return rule({ kind: "subcategory", categoryId: categoryId!, subcategoryId: subcategoryId! }, (result) => {
    if (!result.exists) return notFound;
    if (result.categorySlug === categorySlug && result.slug === subcategorySlug) return render;
    return slugRedirect(request, `/categoria/${segment(categoryId!)}/${segment(result.categorySlug)}/${segment(subcategoryId!)}/${segment(result.slug)}`);
  });
}

async function profileRule(request: NextRequest, route: "anunciante" | "negocios" | "negocio", id: string): Promise<AnyPageRule | DefiniteRule | null> {
  const [{ isPublicAdProfileId }, { businessCanonicalPath }] = await Promise.all([
    import("@tudomacae/ads/publicDiscovery"),
    import("@tudomacae/advertiser-identity/businessPresentation"),
  ]);
  if (!isPublicAdProfileId(id)) {
    // Only the advertiser and Business pages exist under these ids; `/negocios/:id` is a legacy alias the router answers.
    if (route === "anunciante") return { definite: profileNotFound };
    return route === "negocio" ? { definite: notFound } : null;
  }
  return rule({ kind: "profile", id }, (result) => {
    if (result.exists && result.businessTitle !== undefined) {
      const path = businessCanonicalPath({ id, title: result.businessTitle });
      if (request.nextUrl.pathname === path) return render;
      // The Business page validates pagination before redirecting to its canonical slug.
      if (route === "negocio" && request.nextUrl.searchParams.has("adCursor")) return render;
      // Legacy advertiser paths carry their pagination to the Business page, which validates it.
      return { kind: "redirect", path, carryAdCursor: true };
    }
    // The Business page exists only for a public Business; the legacy advertiser page renders any public Profile.
    if (route === "negocio") return notFound;
    if (route === "anunciante" && !result.exists) return profileNotFound;
    return render;
  }, route === "negocios"
    // No page answers `/negocios/:id`; during an outage the advertiser page, which renders any public Profile, stands in.
    ? { kind: "redirect", path: `/anunciante/${segment(id)}`, carryAdCursor: true, temporary: true }
    : undefined);
}

type PathRule = (request: NextRequest, segments: string[]) => AnyPageRule | Promise<AnyPageRule | DefiniteRule | null> | null;

/** Path shapes by first segment and segment count; any other shape stays with the router. */
const pathRules = new Map<string, Partial<Record<number, PathRule>>>([
  ["anuncio", {
    1: (_request, [id]) => adRule(id!, undefined),
    2: (_request, [id, slug]) => slug === "editar" ? null : adRule(id!, slug),
  }],
  ["categoria", {
    1: (request, [categoryId]) => categoryRule(request, categoryId!, undefined),
    2: (request, [categoryId, slug]) => categoryRule(request, categoryId!, slug),
    4: subcategoryRule,
  }],
  ["anunciante", { 1: (request, [id]) => profileRule(request, "anunciante", id!) }],
  ["negocios", { 1: (request, [id]) => profileRule(request, "negocios", id!) }],
  ["negocio", { 2: (request, [id]) => profileRule(request, "negocio", id!) }],
]);

/** Matches only the public entity pages whose status depends on a canonical lookup. */
async function pageRule(request: NextRequest): Promise<AnyPageRule | DefiniteRule | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname } = request.nextUrl;
  if (!/^\/(?:anuncio|categoria|anunciante|negocios?)\//u.test(pathname)) return null;
  const parts = decodedSegments(pathname);
  if (!parts || parts.some(part => part === "")) return null;
  const [route, ...rest] = parts;
  return await pathRules.get(route!)?.[rest.length]?.(request, rest) ?? null;
}

function decide(rule: AnyPageRule, result: CanonicalLookupResult<CanonicalTarget["kind"]> | undefined): Decision {
  // An unavailable lookup never answers 404: the page renders, or the rule names a page that does.
  return result === undefined ? rule.unavailable ?? render : (rule.decide as (value: typeof result) => Decision)(result);
}

function redirectDestination(request: NextRequest, decision: RedirectDecision) {
  const destination = new URL(decision.path, request.url);
  if (!decision.carryAdCursor) {
    destination.search = request.nextUrl.search;
    return destination;
  }
  const cursors = request.nextUrl.searchParams.getAll("adCursor");
  for (const cursor of cursors) destination.searchParams.append("adCursor", cursor);
  if (cursors.length > 0) destination.hash = "anuncios";
  return destination;
}

/**
 * A slug can change back, so no cache may keep a 308 that a later edit would turn
 * into a redirect loop; each request asks the lookup again. A redirect chosen
 * without an answer is a 307, so clients do not keep it as the canonical URL.
 */
function redirectResponse(request: NextRequest, decision: RedirectDecision): Response {
  const response = NextResponse.redirect(redirectDestination(request, decision), decision.temporary ? 307 : 308);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

/**
 * Decides 404 or 308 for public entity pages before rendering, because a
 * streamed page commits status 200 before its own not-found or redirect runs.
 * A cached answer may only let the page render; a 404 or 308 is confirmed with
 * a fresh lookup, so a slug edited within the cache lifetime never redirects
 * back to the previous slug.
 */
export async function canonicalPageResponse(request: NextRequest, lookup: () => Promise<CanonicalLookup>, notFound: (copy?: NotFoundCopy) => Response, inboundCorrelationId?: string): Promise<Response | null> {
  const rule = await pageRule(request);
  if (!rule) return null;
  if ("definite" in rule) return notFound(rule.definite.copy);
  const read = await lookup();
  const correlationId = inboundCorrelationId ?? crypto.randomUUID();
  if (decide(rule, await read(rule.target, { fresh: false, correlationId })).kind === "render") return null;
  const decision = decide(rule, await read(rule.target, { fresh: true, correlationId }));
  if (decision.kind === "notFound") return notFound(decision.copy);
  return decision.kind === "redirect" ? redirectResponse(request, decision) : null;
}
