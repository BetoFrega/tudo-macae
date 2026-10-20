const REQUIRED_DOCUMENT_CACHE_DIRECTIVES = [
  "public",
  "no-cache",
  "max-age=0",
  "must-revalidate",
];

function hasOriginTiming(headers) {
  // Cloudflare can stamp cfReqDur on its own redirects; other timing metrics
  // prevent claiming that a redirect was synthesized without an origin.
  return headers.get("server-timing")?.split(",").some(metric =>
    metric.trim().split(";")[0] !== "cfReqDur") ?? false;
}

export function respondingLayer(headers) {
  if (headers.get("x-www-origin") === "cloud-run") return "cloud-run";
  if (headers.get("x-www-origin") === "terms-workers") return "terms-workers";
  if (headers.get("via")?.includes("google") || headers.has("x-fah-adapter")
    || hasOriginTiming(headers)) {
    return "app-hosting";
  }
  if (headers.get("cf-ray") || headers.get("server") === "cloudflare") {
    return "cloudflare";
  }
  return "unknown";
}

export function measureApexRedirects(measurements) {
  if (measurements.some(({ response }) => response.headers.get("cf-mitigated") === "challenge")) {
    throw new Error("Cloudflare challenged the apex request");
  }
  const canonical = measurements.every(({ url, response }) => {
    const source = new URL(url);
    return response.headers.get("location")
      === `https://www.tudomacae.com.br${source.pathname}${source.search}`;
  });
  const layers = [...new Set(measurements.map(({ response }) => respondingLayer(response.headers)))];
  const statuses = [...new Set(measurements.map(({ response }) => response.status))];
  const appHosting = measurements.some(({ response }) =>
    response.headers.get("via")?.includes("google")
    || response.headers.has("x-fah-adapter")
    || response.headers.has("cdn-cache-status")
    || hasOriginTiming(response.headers));

  return {
    value: `${statuses.join("/")} canonical=${canonical ? "yes" : "no"} by ${layers.join("/")} app-hosting=${appHosting ? "present" : "absent"}`,
    detail: measurements.map(({ url, response }) =>
      `${url}: ${response.status} -> ${response.headers.get("location")}, via: ${response.headers.get("via")}`).join("; "),
  };
}

function documentCacheState(headers) {
  const cacheControl = headers.get("cache-control");
  const directives = new Set(
    cacheControl
      ?.toLowerCase()
      .split(",")
      .map(directive => directive.trim()),
  );
  const revalidationRequired = REQUIRED_DOCUMENT_CACHE_DIRECTIVES.every(
    directive => directives.has(directive),
  ) && !directives.has("private") && !directives.has("no-store");
  const privateNoStore = directives.has("private") && directives.has("no-store")
    && !directives.has("public") && headers.get("cdn-cache-control") === "no-store";
  // The www edge Worker stamps the origin on every response, so only the
  // revision, which Cloud Run's gateway adds, proves the document came from it.
  const origin = headers.get("x-www-origin");
  const revision = headers.get("x-origin-revision");
  const nextCache = headers.get("x-nextjs-cache");

  return {
    cloudflare: headers.get("cf-cache-status"),
    cloudRun: origin === "cloud-run" && /^[a-z][a-z0-9-]{0,62}$/u.test(revision ?? ""),
    worker: origin === "terms-workers",
    revalidationRequired,
    privateNoStore,
    detail: `cache-control: ${cacheControl}, cdn-cache-control: ${headers.get("cdn-cache-control")}, x-www-origin: ${origin}, x-origin-revision: ${revision}, x-nextjs-cache: ${nextCache}`,
  };
}

export function measureDocumentCache(headers) {
  const state = documentCacheState(headers);
  return {
    value: `cf=${state.cloudflare} origin=${state.cloudRun ? "cloud-run" : "other"} revalidation=${state.revalidationRequired ? "required" : "not-required"}`,
    detail: state.detail,
  };
}

export function measurePublicDocumentCaches(documents) {
  const states = Object.entries(documents).map(([name, headers]) => [
    name,
    documentCacheState(headers),
  ]);
  // A Worker's own response carries no cf-cache-status; a proxied origin's says DYNAMIC.
  const cloudflare = states.every(([, state]) => state.cloudflare === "DYNAMIC" || state.cloudflare === null)
    ? "uncached"
    : "cached";
  const cloudRun = states.every(([, state]) => state.cloudRun);
  const worker = states.every(([, state]) => state.worker);
  const homePrivate = states.find(([name]) => name === "home")?.[1].privateNoStore;
  const newsRevalidated = states.find(([name]) => name === "newsIndex")?.[1].revalidationRequired;

  return {
    value: `cf=${cloudflare} origin=${cloudRun ? "cloud-run" : worker ? "terms-workers" : "other"} home=${homePrivate ? "private-no-store" : "unsafe"} news=revalidation-${newsRevalidated ? "required" : "not-required"}`,
    detail: states.map(([name, state]) => `${name}: ${state.detail}`).join("; "),
  };
}

function currentAgentGroup(robots) {
  const { group } = robots;
  if (group && !group.allow.length && !group.disallow.length) return group;
  robots.group = { agents: [], allow: [], disallow: [] };
  robots.groups.push(robots.group);
  return robots.group;
}

function applyRobotsDirective(robots, name, value) {
  if (name === "sitemap") {
    robots.sitemaps.add(value);
    return true;
  }
  if (name === "user-agent") {
    currentAgentGroup(robots).agents.push(value);
    return true;
  }
  if ((name === "allow" || name === "disallow") && robots.group) {
    robots.group[name].push(value);
    return true;
  }
  return false;
}

/** Returns the parsed groups and sitemaps, or null when any line is not a known directive. */
function parseRobotsPolicy(body) {
  const robots = { groups: [], sitemaps: new Set(), group: undefined };
  for (const sourceLine of body.split(/\r\n|\r|\n/)) {
    const line = sourceLine.split("#", 1)[0].replace(/^[ \t]+|[ \t]+$/gu, "");
    if (!line) continue;
    const directive = /^([a-z-]+)[ \t]*:[ \t]*(.*)$/iu.exec(line);
    if (!directive) return null;
    if (!applyRobotsDirective(robots, directive[1].toLowerCase(), directive[2])) return null;
  }
  return robots;
}

function allowsEveryAgentEverywhere(groups) {
  const allow = groups.flatMap(group => group.allow);
  const disallow = groups.flatMap(group => group.disallow);
  return groups.length > 0
    && groups.every(({ agents }) => agents.every(agent => agent === "*"))
    && allow.some(path => path === "/")
    && allow.every(path => path === "" || path === "/")
    && disallow.every(path => path === "");
}

function declaresBothSitemaps(sitemaps) {
  return sitemaps.size === 2
    && sitemaps.has("https://www.tudomacae.com.br/sitemap.xml")
    && sitemaps.has("https://www.tudomacae.com.br/sitemaps/anuncios.xml");
}

function hasApplicationRobotsPolicy(body) {
  const robots = parseRobotsPolicy(body);
  if (!robots) return false;
  return allowsEveryAgentEverywhere(robots.groups) && declaresBothSitemaps(robots.sitemaps);
}

export function measureRobotsPolicy({ response, body }) {
  const hasDefaultPolicy = [
    "# As a condition of accessing this website",
    "# ai-input:",
    "# ai-train:",
    "# search:",
  ].every(token => body.includes(token));
  const managed = body.includes("Cloudflare Managed Content");
  const hasCrawlerDirectives = body.split(/\r\n|\r|\n/)
    .some(line => line.trim() !== "" && !line.trim().startsWith("#"));
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0].replace(/^[ \t]+|[ \t]+$/gu, "").toLowerCase();
  const applicationPolicy = mediaType === "text/plain" && hasApplicationRobotsPolicy(body);
  return {
    value: `${response.status} served-by=${respondingLayer(response.headers)} cloudflare-policy=${hasDefaultPolicy ? "yes" : "no"} cloudflare-managed=${managed ? "yes" : "no"} crawler-directives=${hasCrawlerDirectives ? "yes" : "no"} application-policy=${applicationPolicy ? "yes" : "no"}`,
  };
}

// Leaves headroom below the 50,000-URL file limit, where the route starts omitting Anúncios.
export const AD_SITEMAP_URL_DRIFT_THRESHOLD = 40_000;

export function measureAdSitemapVolume({ response, body }) {
  const urlset = /<urlset[\s>]/u.test(body);
  const urls = body.match(/<url[\s>]/gu)?.length ?? 0;
  return {
    value: `${response.status} urlset=${urlset ? "yes" : "no"} urls${urls > AD_SITEMAP_URL_DRIFT_THRESHOLD ? ">" : "<="}${AD_SITEMAP_URL_DRIFT_THRESHOLD}`,
    detail: `${urls} URLs`,
  };
}

/** A repeated read of an edge-cached path must come from the Worker's colo cache. */
export function measureEdgeReuse(repeatedHeaders) {
  const status = repeatedHeaders.get("cf-cache-status")?.toUpperCase() ?? "absent";
  return { value: `repeated=${status === "HIT" ? "HIT" : "not-hit"}`, detail: `cf-cache-status: ${status}` };
}
