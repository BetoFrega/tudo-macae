import { describe, expect, it } from "vitest";
import { extractStaticAssetUrls, firstBrokenAsset } from "./staticAssetsCheck";

describe("extractStaticAssetUrls", () => {
  it("extracts distinct /_next/static/ URLs from src and href attributes", () => {
    const html = `
      <script src="/_next/static/chunks/23gk44fpuptbk.js"></script>
      <link rel="stylesheet" href="/_next/static/css/app.css">
      <script src="/_next/static/chunks/23gk44fpuptbk.js"></script>
    `;

    expect(extractStaticAssetUrls(html)).toEqual([
      "/_next/static/chunks/23gk44fpuptbk.js",
      "/_next/static/css/app.css",
    ]);
  });

  it("normalizes the escaped flight-payload form to the same URL, dropping the trailing backslash", () => {
    const html
      = "<script src=\"/_next/static/chunks/23gk44fpuptbk.js\"></script>"
        + "<script>self.__next_f.push([1,\"...\\\"/_next/static/chunks/23gk44fpuptbk.js\\\"...\"])</script>";

    expect(extractStaticAssetUrls(html)).toEqual([
      "/_next/static/chunks/23gk44fpuptbk.js",
    ]);
  });

  it("ignores a URL prefix split across flight-payload fragments", () => {
    const html = `<script>self.__next_f.push([1,"/_next/static/chunks/0oj9jcc6b"])</script>
      <link href="/_next/static/chunks/0oj9jcc6bnn5f.css?dpl=release" rel="stylesheet">`;

    expect(extractStaticAssetUrls(html)).toEqual([
      "/_next/static/chunks/0oj9jcc6bnn5f.css?dpl=release",
    ]);
  });

  it("ignores URLs outside /_next/static/", () => {
    const html = "<script src=\"/_next/data/build/page.json\"></script><img src=\"/logo.png\">";

    expect(extractStaticAssetUrls(html)).toEqual([]);
  });

  it("returns an empty array when the HTML references no static assets", () => {
    expect(extractStaticAssetUrls("<html><body>hi</body></html>")).toEqual([]);
  });
});

describe("firstBrokenAsset", () => {
  it("returns undefined when every status is 200", () => {
    const statuses = new Map([
      ["/_next/static/chunks/a.js", 200],
      ["/_next/static/chunks/b.js", 200],
    ]);

    expect(firstBrokenAsset(statuses)).toBeUndefined();
  });

  it("returns the first URL whose status is not 200", () => {
    const statuses = new Map([
      ["/_next/static/chunks/a.js", 200],
      ["/_next/static/chunks/b.js", 500],
      ["/_next/static/chunks/c.js", 404],
    ]);

    expect(firstBrokenAsset(statuses)).toBe("/_next/static/chunks/b.js");
  });
});
