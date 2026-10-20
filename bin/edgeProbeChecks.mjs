import { measureAdSitemapVolume, measureEdgeReuse, measurePublicDocumentCaches, measureRobotsPolicy } from "./edgeProbeMeasurements.mjs";
import {
  APEX,
  CANONICAL,
  MCP_CONTRACT,
  MCP_HOSTNAME,
  apexRedirectMeasurement,
  editorialSessionRequest,
  initializeMcpRequest,
  request,
  resolver,
  wildcardCertificateMeasurement,
} from "./edgeProbeRequests.mjs";

export const checks = [
  {
    id: "dns.nameservers",
    claim: "the zone is delegated to Cloudflare",
    expected: "kara.ns.cloudflare.com, theo.ns.cloudflare.com",
    async measure() {
      const nameservers = await resolver.resolveNs(APEX);
      return { value: nameservers.sort().join(", ") };
    },
  },
  {
    id: "dns.proxied",
    claim: "apex and www resolve to the same addresses, and Cloudflare answers as a proxy",
    expected: "apex == www, /cdn-cgi/ answers",
    async measure() {
      const [apex, canonical] = await Promise.all([
        resolver.resolve4(APEX),
        resolver.resolve4(CANONICAL),
      ]);
      const same = apex.sort().join(",") === canonical.sort().join(",");
      const { body } = await request(`https://${CANONICAL}/cdn-cgi/trace`);
      const proxied = /^fl=/m.test(body) ? "/cdn-cgi/ answers" : "/cdn-cgi/ silent";
      return {
        value: `${same ? "apex == www" : "apex != www"}, ${proxied}`,
        detail: apex.join(", "),
      };
    },
  },
  {
    id: "tls.termination",
    claim: "TLS is terminated by Cloudflare Universal SSL, not by App Hosting",
    // The wildcard is the discriminator: App Hosting mints per-domain certificates.
    // The issuing CA is deliberately unasserted — Cloudflare rotates it on renewal.
    expected: "wildcard SAN",
    async measure() {
      return wildcardCertificateMeasurement(CANONICAL);
    },
  },
  {
    id: "dns.mcp",
    contract: MCP_CONTRACT,
    claim: "the machine hostname resolves publicly; response checks identify the proxy layer",
    expected: "resolves",
    async measure() {
      const mcp = await resolver.resolve4(MCP_HOSTNAME);
      return {
        value: mcp.length > 0 ? "resolves" : "no addresses",
        detail: mcp.join(", "),
      };
    },
  },
  {
    id: "tls.mcp",
    contract: MCP_CONTRACT,
    claim: "the machine hostname completes TLS through Cloudflare Universal SSL",
    expected: "wildcard SAN",
    async measure() {
      return wildcardCertificateMeasurement(MCP_HOSTNAME);
    },
  },
  {
    id: "mcp.origin",
    contract: MCP_CONTRACT,
    claim: "the edge Worker answers the retired machine host itself, without an origin",
    expected: "origin=edge app-hosting=absent",
    async measure() {
      const { response } = await initializeMcpRequest();
      const appHosting = ["via", "cdn-cache-status", "x-fah-adapter"].some(name => response.headers.has(name));
      return { value: `origin=${response.headers.get("x-www-origin")} app-hosting=${appHosting ? "present" : "absent"}` };
    },
  },
  {
    id: "mcp.retired",
    contract: MCP_CONTRACT,
    claim: "the retired MCP, tools and session routes return 404 without storage",
    expected: "404 no-store=yes challenge=absent",
    async measure() {
      const measurements = await Promise.all([
        initializeMcpRequest(),
        request(`https://${MCP_HOSTNAME}/mcp`),
        request(`https://${MCP_HOSTNAME}/tools/v1`, { method: "POST" }),
        editorialSessionRequest("POST"),
        editorialSessionRequest("DELETE"),
      ]);
      const statuses = [...new Set(measurements.map(({ response }) => response.status))];
      const noStore = measurements.every(({ response }) => response.headers.get("cache-control")?.toLowerCase().includes("no-store"));
      const challenged = measurements.some(({ response, body }) => response.headers.get("cf-mitigated") === "challenge" || body.includes("cdn-cgi/challenge-platform"));
      return { value: `${statuses.join("/")} no-store=${noStore ? "yes" : "no"} challenge=${challenged ? "present" : "absent"}` };
    },
  },
  {
    id: "mcp.cache",
    contract: MCP_CONTRACT,
    claim: "MCP responses do not participate in Cloudflare, App Hosting or Next.js caches",
    expected:
      "no-store=yes cf=uncached app-hosting=uncached nextjs=uncached age=absent",
    async measure() {
      const first = await initializeMcpRequest();
      const second = await initializeMcpRequest();
      const measurements = [first, second];
      const responses = measurements.map(measurement => measurement.response);
      const noStore = responses.every(response =>
        response.headers.get("cache-control")
          ?.toLowerCase()
          .includes("no-store"));
      // The edge Worker's own 404 carries no cf-cache-status.
      const cloudflareUncached = responses.every(response =>
        [undefined, "BYPASS", "DYNAMIC"].includes(
          response.headers.get("cf-cache-status")?.toUpperCase(),
        ));
      const appHostingUncached = responses.every(response =>
        response.headers.get("cdn-cache-status")?.toLowerCase() !== "hit");
      const nextUncached = responses.every(response =>
        response.headers.get("x-nextjs-cache")?.toUpperCase() !== "HIT");
      const ageAbsent = responses.every(response =>
        response.headers.get("age") === null);
      return {
        value: `no-store=${noStore ? "yes" : "no"} cf=${cloudflareUncached ? "uncached" : "cached"} app-hosting=${appHostingUncached ? "uncached" : "cached"} nextjs=${nextUncached ? "uncached" : "cached"} age=${ageAbsent ? "absent" : "present"}`,
      };
    },
  },
  {
    id: "redirect.apex.https",
    claim: "HTTPS apex routes redirect directly to canonical www at the edge, preserving path and query",
    expected: "301 canonical=yes by cloudflare app-hosting=absent",
    async measure() {
      return apexRedirectMeasurement("https");
    },
  },
  {
    id: "redirect.apex.http",
    claim: "HTTP apex routes redirect directly to canonical HTTPS www at the edge, preserving path and query",
    expected: "301 canonical=yes by cloudflare app-hosting=absent",
    async measure() {
      return apexRedirectMeasurement("http");
    },
  },
  {
    id: "robots.precedence",
    contract: "docs/agents/production-crawling.md",
    claim: "the web application serves Allow: / for all crawlers and both canonical sitemaps, without Cloudflare policy or managed content",
    expected: "200 served-by=terms-workers cloudflare-policy=no cloudflare-managed=no crawler-directives=yes application-policy=yes",
    async measure() {
      const { response, body } = await request(`https://${CANONICAL}/robots.txt`);
      return measureRobotsPolicy({ response, body });
    },
  },
  {
    id: "sitemap.ads",
    contract: "docs/agents/production-crawling.md",
    claim: "the Anúncios sitemap is one URL set with headroom below the 50,000-URL file limit",
    expected: "200 urlset=yes urls<=40000",
    async measure() {
      const { response, body } = await request(`https://${CANONICAL}/sitemaps/anuncios.xml`);
      return measureAdSitemapVolume({ response, body });
    },
  },
  {
    id: "sitemap.adsCache",
    contract: "docs/agents/production-crawling.md",
    claim: "the www edge Worker serves a repeated Anúncios sitemap read from its colo cache",
    expected: "repeated=HIT",
    async measure() {
      // Sequential: the second read finds what the first one stored.
      await request(`https://${CANONICAL}/sitemaps/anuncios.xml`);
      const { response } = await request(`https://${CANONICAL}/sitemaps/anuncios.xml`);
      return measureEdgeReuse(response.headers);
    },
  },
  {
    id: "cache.document",
    claim: "Cloudflare stores no HTML; the web application serves visitor-specific home HTML privately without storage and the news index with revalidation",
    expected: "cf=uncached origin=terms-workers home=private-no-store news=revalidation-required",
    async measure() {
      const [home, newsIndex] = await Promise.all([
        request(`https://${CANONICAL}/`, { method: "HEAD" }),
        request(`https://${CANONICAL}/noticias`, { method: "HEAD" }),
      ]);
      return measurePublicDocumentCaches({
        home: home.response.headers,
        newsIndex: newsIndex.response.headers,
      });
    },
  },
  {
    id: "cache.asset",
    claim: "Cloudflare caches immutable build assets",
    expected: "immutable, cacheable at the edge",
    async measure() {
      const { body } = await request(`https://${CANONICAL}/`);
      const asset = body.match(/\/_terms-workers\/[a-f0-9]{40}\/_next\/static\/[^"']+\.css/u)?.[0];
      if (!asset) throw new Error("no build asset found on the home page");
      const { response } = await request(`https://${CANONICAL}${asset}`, { method: "HEAD" });
      const status = response.headers.get("cf-cache-status");
      const immutable = response.headers.get("cache-control")?.includes("immutable");
      const cacheable = ["HIT", "MISS", "EXPIRED", "REVALIDATED", "UPDATING"].includes(status);
      return {
        value: `${immutable ? "immutable" : "not immutable"}, ${cacheable ? "cacheable at the edge" : `cf=${status}`}`,
        detail: `cf-cache-status: ${status}`,
      };
    },
  },
  {
    id: "edge.botDetection",
    claim: "Cloudflare injects its bot-detection script into every document",
    expected: "injected",
    async measure() {
      const { body } = await request(`https://${CANONICAL}/`);
      return { value: body.includes("cdn-cgi/challenge-platform") ? "injected" : "absent" };
    },
  },
  {
    id: "headers.security",
    claim: "no layer sets HSTS or the usual security headers",
    expected: "none",
    async measure() {
      const { response } = await request(`https://${CANONICAL}/`, { method: "HEAD" });
      const present = [
        "strict-transport-security",
        "content-security-policy",
        "x-content-type-options",
        "x-frame-options",
        "referrer-policy",
      ].filter(name => response.headers.get(name));
      return { value: present.length > 0 ? present.join(", ") : "none" };
    },
  },
];
