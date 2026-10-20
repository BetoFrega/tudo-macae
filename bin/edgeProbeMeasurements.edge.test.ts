import { expect, test } from "vitest";
import {
  measureDocumentCache,
  measurePublicDocumentCaches,
  measureApexRedirects,
} from "./edgeProbeMeasurements.mjs";

test("apex redirect measurement requires a direct canonical redirect from Cloudflare", () => {
  const response = new Response(null, {
    status: 301,
    headers: {
      "location": "https://www.tudomacae.com.br/noticias/servi%C3%A7os?tag=a%2Fb&tag=c",
      "cf-ray": "probe-ray",
    },
  });

  expect(measureApexRedirects([
    { url: "http://tudomacae.com.br/noticias/servi%C3%A7os?tag=a%2Fb&tag=c", response },
  ])).toMatchObject({
    value: "301 canonical=yes by cloudflare app-hosting=absent",
  });
});

test("a Cloudflare challenge on any apex sample is an unmeasurable request rather than topology drift", () => {
  const response = new Response(null, {
    status: 403,
    headers: { "cf-ray": "probe-ray", "cf-mitigated": "challenge" },
  });

  expect(() => measureApexRedirects([
    { url: "https://tudomacae.com.br/robots.txt?edge_probe=1", response },
  ])).toThrow("Cloudflare challenged the apex request");
});

test.each([
  ["HTTPS upgrade on the apex", 301, "https://tudomacae.com.br/robots.txt?probe=1", { "cf-ray": "probe-ray" }, "301 canonical=no by cloudflare app-hosting=absent"],
  ["lost query", 301, "https://www.tudomacae.com.br/robots.txt", { "cf-ray": "probe-ray" }, "301 canonical=no by cloudflare app-hosting=absent"],
  ["origin redirect", 302, "https://www.tudomacae.com.br/robots.txt?probe=1", { "cf-ray": "probe-ray", "via": "1.1 google" }, "302 canonical=yes by app-hosting app-hosting=present"],
  ["server timing from the origin", 301, "https://www.tudomacae.com.br/robots.txt?probe=1", { "cf-ray": "probe-ray", "server-timing": "fah;dur=12" }, "301 canonical=yes by app-hosting app-hosting=present"],
  ["mixed origin and edge timing", 301, "https://www.tudomacae.com.br/robots.txt?probe=1", { "cf-ray": "probe-ray", "server-timing": "cfReqDur;dur=8.813, fah;dur=12" }, "301 canonical=yes by app-hosting app-hosting=present"],
  ["unproven edge", 301, "https://www.tudomacae.com.br/robots.txt?probe=1", {}, "301 canonical=yes by unknown app-hosting=absent"],
])("apex redirect measurement exposes %s on any sampled route", (_case, status, location, headers, expected) => {
  const root = {
    url: "https://tudomacae.com.br/",
    response: new Response(null, { status: 301, headers: { "location": "https://www.tudomacae.com.br/", "cf-ray": "probe-ray" } }),
  };
  const route = {
    url: "https://tudomacae.com.br/robots.txt?probe=1",
    response: new Response(null, { status, headers: { ...headers, location } }),
  };

  expect(measureApexRedirects([route])).toMatchObject({ value: expected });
  expect(measureApexRedirects([root, route]).value)
    .not.toBe("301 canonical=yes by cloudflare app-hosting=absent");
});

test("Cloudflare request timing alone does not indicate an App Hosting origin", () => {
  const response = new Response(null, {
    status: 301,
    headers: {
      "location": "https://www.tudomacae.com.br/",
      "cf-ray": "probe-ray",
      "server-timing": "cfReqDur;dur=8.813",
    },
  });

  expect(measureApexRedirects([
    { url: "http://tudomacae.com.br/", response },
  ])).toMatchObject({ value: "301 canonical=yes by cloudflare app-hosting=absent" });
});

test("document cache accepts revalidated public HTML from Cloud Run without a Next.js cache marker", () => {
  const headers = new Headers({
    "cache-control": "public, no-cache, max-age=0, must-revalidate",
    "cf-cache-status": "DYNAMIC",
    "x-origin-revision": "tudo-macae-www-r-1-1",
    "x-www-origin": "cloud-run",
  });

  expect(measureDocumentCache(headers)).toEqual({
    value: "cf=DYNAMIC origin=cloud-run revalidation=required",
    detail: "cache-control: public, no-cache, max-age=0, must-revalidate, cdn-cache-control: null, x-www-origin: cloud-run, x-origin-revision: tudo-macae-www-r-1-1, x-nextjs-cache: null",
  });
});

test.each([
  "no-cache",
  "max-age=0",
  "must-revalidate",
  "public",
])("document cache rejects the news index when %s is absent", (missingDirective) => {
  const requiredDirectives = [
    "public",
    "no-cache",
    "max-age=0",
    "must-revalidate",
  ];
  const home = new Headers({
    "cache-control": "private, no-store, max-age=0, must-revalidate",
    "cdn-cache-control": "no-store",
    "cf-cache-status": "DYNAMIC",
    "x-origin-revision": "tudo-macae-www-r-1-1",
    "x-www-origin": "cloud-run",
  });
  const newsIndex = new Headers({
    "cache-control": requiredDirectives
      .filter(directive => directive !== missingDirective)
      .join(", "),
    "cf-cache-status": "DYNAMIC",
    "x-origin-revision": "tudo-macae-www-r-1-1",
    "x-www-origin": "cloud-run",
  });

  expect(measurePublicDocumentCaches({ home, newsIndex })).toMatchObject({
    value: "cf=uncached origin=cloud-run home=private-no-store news=revalidation-not-required",
  });
});

test("a document that skipped the edge Worker is not reported as Cloud Run", () => {
  const appHosting = new Headers({
    "cache-control": "public, no-cache, max-age=0, must-revalidate",
    "cdn-cache-status": "miss",
    "cf-cache-status": "DYNAMIC",
  });

  expect(measurePublicDocumentCaches({ home: appHosting, newsIndex: appHosting })).toMatchObject({
    value: "cf=uncached origin=other home=unsafe news=revalidation-required",
  });
});

test("Web Worker documents carry no cf-cache-status and report their origin", () => {
  const worker = (cacheControl: string, extra: Record<string, string> = {}) => new Headers({ "cache-control": cacheControl, "x-www-origin": "terms-workers", ...extra });
  expect(measurePublicDocumentCaches({
    home: worker("private, no-store, max-age=0, must-revalidate", { "cdn-cache-control": "no-store" }),
    newsIndex: worker("public, no-cache, max-age=0, must-revalidate"),
  }).value).toBe("cf=uncached origin=terms-workers home=private-no-store news=revalidation-required");
  expect(measurePublicDocumentCaches({
    home: worker("private, no-store, max-age=0, must-revalidate", { "cdn-cache-control": "no-store", "cf-cache-status": "HIT" }),
    newsIndex: worker("public, no-cache, max-age=0, must-revalidate"),
  }).value).toBe("cf=cached origin=terms-workers home=private-no-store news=revalidation-required");
});

test("the Worker's origin marker without a Cloud Run revision is not proof of Cloud Run", () => {
  const unproven = new Headers({
    "cache-control": "public, no-cache, max-age=0, must-revalidate",
    "cf-cache-status": "DYNAMIC",
    "x-www-origin": "cloud-run",
  });

  expect(measureDocumentCache(unproven)).toMatchObject({
    value: "cf=DYNAMIC origin=other revalidation=required",
  });
});

function documentHeaders(cacheControl: string) {
  return new Headers({
    "cache-control": cacheControl,
    "cdn-cache-control": "no-store",
    "cf-cache-status": "DYNAMIC",
    "x-origin-revision": "tudo-macae-www-r-1-1",
    "x-www-origin": "cloud-run",
  });
}

test("document cache accepts private home HTML and revalidated news HTML", () => {
  expect(measurePublicDocumentCaches({
    home: documentHeaders("private, no-store, max-age=0, must-revalidate"),
    newsIndex: documentHeaders("public, no-cache, max-age=0, must-revalidate"),
  }).value).toBe("cf=uncached origin=cloud-run home=private-no-store news=revalidation-required");
});

test.each([
  "no-store, max-age=0, must-revalidate",
  "private, max-age=0, must-revalidate",
  "private, public, no-store, max-age=0, must-revalidate",
  "public, no-cache, max-age=0, must-revalidate",
])("document cache rejects an unsafe home policy: %s", (cacheControl) => {
  expect(measurePublicDocumentCaches({
    home: documentHeaders(cacheControl),
    newsIndex: documentHeaders("public, no-cache, max-age=0, must-revalidate"),
  }).value).toBe("cf=uncached origin=cloud-run home=unsafe news=revalidation-required");
});

test("document cache requires the home's CDN no-store policy", () => {
  const home = documentHeaders("private, no-store, max-age=0, must-revalidate");
  home.delete("cdn-cache-control");
  expect(measurePublicDocumentCaches({
    home,
    newsIndex: documentHeaders("public, no-cache, max-age=0, must-revalidate"),
  }).value).toBe("cf=uncached origin=cloud-run home=unsafe news=revalidation-required");
});
