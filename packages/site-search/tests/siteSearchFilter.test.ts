import { describe, expect, test, vi } from "vitest";
import {
  createSiteSearch,
  normalizeSiteSearchFilter,
  siteSearchFilterParameter,
  type SiteSearchProvider,
} from "../search";
import { origin, searchWith } from "./siteSearchFixture";

describe("site search filter", () => {
  test.each([
    ["negocios", "businesses"],
    ["anuncios", "ads"],
    ["noticias", "articles"],
    ["navegacao", "navigation"],
  ] as const)("reads tipo=%s as %s and writes it back", (parameter, filter) => {
    expect(normalizeSiteSearchFilter(parameter)).toBe(filter);
    expect(siteSearchFilterParameter(filter)).toBe(parameter);
  });

  test("uses the first value of a repeated parameter", () => {
    expect(normalizeSiteSearchFilter(["anuncios", "negocios"])).toBe("ads");
  });

  test.each([undefined, "", "todos", "businesses", "constructor", ["outro"], 1])("ignores %j", (input) => {
    expect(normalizeSiteSearchFilter(input)).toBeUndefined();
  });
});

describe("site search", () => {
  test.each([
    ["businesses", ["business"]],
    ["ads", ["ad"]],
    ["navigation", ["category", "subcategory", "page"]],
  ] as const)("the %s filter keeps only its types", async (filter, types) => {
    const { search, records } = searchWith({
      status: "ok",
      chunks: [
        { key: `${origin}/negocio/b1/padaria`, title: "Padaria", text: "x" },
        { key: `${origin}/anuncio/a1/forno`, title: "Forno", text: "x" },
        { key: `${origin}/noticia/m1/feira`, title: "Feira", text: "x" },
        { key: `${origin}/categoria/c1/alimentacao`, title: "Alimentação", text: "x" },
        { key: `${origin}/categoria/c1/alimentacao/s1/padarias`, title: "Padarias", text: "x" },
        { key: `${origin}/editoria/e1/economia`, title: "Economia", text: "x" },
        { key: `${origin}/assunto/t1/padarias`, title: "Padarias", text: "x" },
        { key: `${origin}/negocios`, title: "Negócios", text: "x" },
      ],
    });

    const response = await search.search("padaria", filter);
    expect(response.outcome === "results" && [...new Set(response.results.map(result => result.type))]).toEqual(types);
    expect(records[0]).toMatchObject({ filter });
  });

  test("asks the provider for the filter's types and searches unfiltered only without a filter", async () => {
    const search = vi.fn<SiteSearchProvider["search"]>().mockResolvedValue({
      status: "ok",
      chunks: [{ key: `${origin}/categoria/c1/restaurantes`, title: "Restaurantes", text: "x" }],
    });
    const site = createSiteSearch({ siteOrigin: origin, provider: { search }, now: () => 0, record: () => {} });

    await site.search("padaria", "navigation");
    await site.search("padaria");
    expect(search.mock.calls).toEqual([
      ["padaria", ["category", "subcategory", "page"]],
      ["padaria", ["business", "ad", "category", "subcategory", "page"]],
    ]);
  });

  test("falls back to an unfiltered search when pages are not yet typed in the index", async () => {
    const search = vi.fn<SiteSearchProvider["search"]>()
      .mockResolvedValueOnce({ status: "ok", chunks: [] })
      .mockResolvedValueOnce({
        status: "ok",
        chunks: [
          { key: `${origin}/noticia/m1/feira`, title: "Feira", text: "x" },
          { key: `${origin}/anuncio/a1/forno`, title: "Forno", text: "x" },
        ],
      });
    const site = createSiteSearch({ siteOrigin: origin, provider: { search }, now: () => 0, record: () => {} });

    const response = await site.search("forno", "ads");
    expect(response.outcome === "results" && response.results.map(result => result.path)).toEqual(["/anuncio/a1/forno"]);
    expect(search.mock.calls).toEqual([["forno", ["ad"]], ["forno"]]);
  });

  test("does not retry a failed filtered search", async () => {
    const search = vi.fn<SiteSearchProvider["search"]>().mockResolvedValue({ status: "quota" });
    const site = createSiteSearch({ siteOrigin: origin, provider: { search }, now: () => 0, record: () => {} });

    await expect(site.search("forno", "ads")).resolves.toEqual({ outcome: "quota" });
    expect(search).toHaveBeenCalledOnce();
  });

  test("a filter without matching pages is an expected empty outcome", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [{ key: `${origin}/negocio/b1/padaria`, title: "Padaria", text: "x" }],
    });

    await expect(search.search("padaria", "ads")).resolves.toEqual({ outcome: "empty" });
  });
});

test("retired editorial URLs never become search results and the old news filter avoids a provider request", async () => {
  const provider = vi.fn<SiteSearchProvider["search"]>().mockResolvedValue({ status: "ok", chunks: [
    { key: `${origin}/noticia/id/titulo`, text: "Texto" },
    { key: `${origin}/editoria/id/cidade`, text: "Texto" },
    { key: `${origin}/assunto/id/cidade`, text: "Texto" },
    { key: `${origin}/noticias`, text: "Texto" },
    { key: `${origin}/anuncio/id/bicicleta`, title: "Bicicleta", text: "Usada" },
  ] });
  const site = createSiteSearch({ siteOrigin: origin, provider: { search: provider }, now: () => 0, record: () => {} });
  await expect(site.search("cidade", "articles")).resolves.toEqual({ outcome: "empty" });
  expect(provider).not.toHaveBeenCalled();
  await expect(site.search("cidade")).resolves.toMatchObject({ outcome: "results", results: [{ path: "/anuncio/id/bicicleta" }] });
});
