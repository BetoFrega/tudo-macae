import { expect, test } from "vitest";
import { AD_SITEMAP_URL_DRIFT_THRESHOLD, measureAdSitemapVolume, measureEdgeReuse, measureRobotsPolicy } from "./edgeProbeMeasurements.mjs";

const applicationRobots = [
  "User-Agent: *",
  "Allow: /",
  "",
  "Sitemap: https://www.tudomacae.com.br/sitemap.xml",
  "Sitemap: https://www.tudomacae.com.br/sitemaps/anuncios.xml",
].join("\n");
const expectedRobotsMeasurement = "200 served-by=cloud-run cloudflare-policy=no cloudflare-managed=no crawler-directives=yes application-policy=yes";

function robotsResponse(status = 200, origin = "cloud-run") {
  return new Response(null, { status, headers: { "x-www-origin": origin, "content-type": "text/plain; charset=utf-8" } });
}

test("robots measurement verifies the application allow rule and both canonical sitemaps", () => {
  expect(measureRobotsPolicy({ response: robotsResponse(), body: applicationRobots }).value)
    .toBe(expectedRobotsMeasurement);
});

test("robots policy accepts equivalent directive case, whitespace, comments, line endings and sitemap order", () => {
  const body = [
    "# Public crawler policy", "  user-agent: * # all crawlers", "allow: /",
    "disallow: ", "", "sitemap: https://www.tudomacae.com.br/sitemaps/anuncios.xml",
    "SITEMAP: https://www.tudomacae.com.br/sitemap.xml",
  ].join("\r\n");
  expect(measureRobotsPolicy({ response: robotsResponse(), body }).value)
    .toBe(expectedRobotsMeasurement);
});

test.each([
  ["missing allow", applicationRobots.replace("Allow: /", "")],
  ["restricted allow", applicationRobots.replace("Allow: /", "Allow: /noticias")],
  ["restricted crawler", applicationRobots.replace("User-Agent: *", "User-Agent: Googlebot")],
  ["missing crawler", applicationRobots.replace("User-Agent: *", "")],
  ["blocked root", applicationRobots.replace("Allow: /", "Disallow: /")],
  ["conflicting root restriction", `${applicationRobots}\nDisallow: /`],
  ["blocked subtree", applicationRobots.replace("Allow: /", "Allow: /\nDisallow: /noticias")],
  ["second restricted group", `${applicationRobots}\nUser-Agent: Googlebot\nDisallow: /`],
  ["second wildcard group blocks", `${applicationRobots}\nUser-Agent: *\nDisallow: /`],
  ["missing classifieds sitemap", applicationRobots.replace("Sitemap: https://www.tudomacae.com.br/sitemaps/anuncios.xml", "")],
  ["changed sitemap URL", applicationRobots.replace("/sitemaps/anuncios.xml", "/sitemaps/negocios.xml")],
  ["extra sitemap", `${applicationRobots}\nSitemap: https://www.tudomacae.com.br/other.xml`],
  ["commented policy", applicationRobots.split("\n").map(line => `# ${line}`).join("\n")],
  ["unrelated content", "a response with no crawler policy"],
  ["empty content", ""],
])("robots measurement exposes actual directive drift: %s", (_case, body) => {
  expect(measureRobotsPolicy({ response: robotsResponse(), body }).value)
    .not.toBe(expectedRobotsMeasurement);
});

test.each([
  ["status", robotsResponse(503), applicationRobots],
  ["responding layer", robotsResponse(200, "other"), applicationRobots],
  ["managed block", robotsResponse(), `# Cloudflare Managed Content\n${applicationRobots}`],
  ["default policy", robotsResponse(), `# As a condition of accessing this website\n# ai-input:\n# ai-train:\n# search:\n${applicationRobots}`],
])("valid directives do not mask changed %s", (_case, response, body) => {
  expect(measureRobotsPolicy({ response, body }).value).not.toBe(expectedRobotsMeasurement);
});

test("robots policy accepts redundant root rules and duplicate sitemap records", () => {
  const body = `${applicationRobots}\nAllow: /\nDisallow: \nSitemap: https://www.tudomacae.com.br/sitemap.xml`;
  expect(measureRobotsPolicy({ response: robotsResponse(), body }).value)
    .toBe(expectedRobotsMeasurement);
});

test("robots policy combines matching wildcard groups with a redundant ruleless group", () => {
  const body = `${applicationRobots}\nUser-Agent: *`;
  expect(measureRobotsPolicy({ response: robotsResponse(), body }).value)
    .toBe(expectedRobotsMeasurement);
});

test.each([null, "text/html", "application/json"])("robots policy rejects non-plain media type %s", (contentType) => {
  const response = robotsResponse();
  if (contentType === null) response.headers.delete("content-type");
  else response.headers.set("content-type", contentType);
  expect(measureRobotsPolicy({ response, body: applicationRobots }).value)
    .not.toBe(expectedRobotsMeasurement);
});

test.each(["\u00a0text/plain", "text/plain\u00a0", "text/plain\u00a0; charset=utf-8"])("robots policy rejects invalid media-type padding %j", (contentType) => {
  const response = robotsResponse();
  response.headers.set("content-type", contentType);
  expect(measureRobotsPolicy({ response, body: applicationRobots }).value)
    .not.toBe(expectedRobotsMeasurement);
});

test.each([" Text/Plain\t; charset=utf-8", "\ttext/plain "])("robots policy accepts HTTP media-type whitespace %j", (contentType) => {
  const response = robotsResponse();
  response.headers.set("content-type", contentType);
  expect(measureRobotsPolicy({ response, body: applicationRobots }).value)
    .toBe(expectedRobotsMeasurement);
});

test.each(["\r", "\n", "\r\n"])("robots policy accepts equivalent line separators %j", (separator) => {
  const body = `# Public crawler policy\n${applicationRobots}`.replaceAll("\n", separator);
  expect(measureRobotsPolicy({ response: robotsResponse(), body }).value)
    .toBe(expectedRobotsMeasurement);
});

test("robots policy ignores an empty Allow alongside the configured root rule", () => {
  expect(measureRobotsPolicy({ response: robotsResponse(), body: `${applicationRobots}\nAllow:` }).value)
    .toBe(expectedRobotsMeasurement);
  expect(measureRobotsPolicy({ response: robotsResponse(), body: applicationRobots.replace("Allow: /", "Allow:") }).value)
    .not.toBe(expectedRobotsMeasurement);
});

test.each([
  ["nonbreaking space before field", "User-Agent: *", "\u00a0User-Agent: *"],
  ["vertical tab before field", "User-Agent: *", "\u000bUser-Agent: *"],
  ["nonbreaking space before colon", "Sitemap: https://www.tudomacae.com.br/sitemap.xml", "Sitemap\u00a0: https://www.tudomacae.com.br/sitemap.xml"],
  ["vertical tab before colon", "Allow: /", "Allow\u000b: /"],
  ["nonbreaking space before value", "Allow: /", "Allow: \u00a0/"],
  ["vertical tab before value", "Allow: /", "Allow: \u000b/"],
  ["nonbreaking space after value", "Allow: /", "Allow: /\u00a0"],
  ["vertical tab after value", "Allow: /", "Allow: /\u000b"],
])("robots policy preserves non-protocol whitespace as drift: %s", (_label, from, to) => {
  expect(measureRobotsPolicy({ response: robotsResponse(), body: applicationRobots.replace(from, to) }).value)
    .toContain("application-policy=no");
});

test("robots policy accepts ASCII spaces and tabs around fields, colons and values", () => {
  const body = applicationRobots.split("\n").map(line => ` \t${line.replace(": ", "\t: \t")}\t `).join("\n");
  expect(measureRobotsPolicy({ response: robotsResponse(), body }).value).toBe(expectedRobotsMeasurement);
});

const adSitemap = (count: number) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
  "<url><loc>https://www.tudomacae.com.br/anuncio/id/slug</loc><lastmod>2026-10-11T00:00:00.000Z</lastmod></url>".repeat(count)}</urlset>`;

test.each([
  [1, "200 urlset=yes urls<=40000"],
  [AD_SITEMAP_URL_DRIFT_THRESHOLD, "200 urlset=yes urls<=40000"],
  [AD_SITEMAP_URL_DRIFT_THRESHOLD + 1, "200 urlset=yes urls>40000"],
])("ad sitemap volume with %i URLs measures %s", (count, value) => {
  expect(measureAdSitemapVolume({ response: new Response(null, { status: 200 }), body: adSitemap(count) }))
    .toEqual({ value, detail: `${count} URLs` });
});

test.each([
  ["a sitemap index", 200, "<sitemapindex><sitemap><loc>https://www.tudomacae.com.br/x.xml</loc></sitemap></sitemapindex>", "200 urlset=no urls<=40000"],
  ["an unavailable sitemap", 503, "Sitemap temporariamente indisponível.", "503 urlset=no urls<=40000"],
])("ad sitemap volume drifts on %s", (_case, status, body, value) => {
  expect(measureAdSitemapVolume({ response: new Response(null, { status }), body }).value).toBe(value);
});

test.each([
  ["HIT", "repeated=HIT"],
  ["hit", "repeated=HIT"],
  ["MISS", "repeated=not-hit"],
  ["DYNAMIC", "repeated=not-hit"],
])("a repeated edge-cached read reporting %s measures %s", (status, value) => {
  expect(measureEdgeReuse(new Headers({ "cf-cache-status": status })).value).toBe(value);
});

test("a repeated edge-cached read without a cache status drifts", () => {
  expect(measureEdgeReuse(new Headers())).toEqual({ value: "repeated=not-hit", detail: "cf-cache-status: absent" });
});
