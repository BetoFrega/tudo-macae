import { describe, expect, test, vi } from "vitest";
import {
  createSiteSearch,
  normalizeSiteSearchQuery,
} from "../search";
import { origin, searchWith } from "./siteSearchFixture";

describe("site search query", () => {
  test.each([
    ["  padaria   do  centro ", "padaria do centro"],
    ["a", "a"],
    [["primeira", "segunda"], "primeira"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeSiteSearchQuery(input)).toBe(expected);
  });

  test.each([undefined, "", "   ", 42])("treats %j as no query", (input) => {
    expect(normalizeSiteSearchQuery(input)).toBeUndefined();
  });

  test("bounds the query length", () => {
    expect(normalizeSiteSearchQuery("x".repeat(500))).toHaveLength(200);
  });
});

describe("site search", () => {
  test("presents each page once, in provider order, with title, type and snippet", async () => {
    const { search } = searchWith({
      status: "ok",
      providerDurationMs: 40,
      chunks: [
        { key: `${origin}/negocio/b1/padaria-central`, title: "Padaria Central", text: "## Padaria  Central\n\nPães **frescos** todos os dias. [Veja](https://x.test)" },
        { key: `${origin}/negocio/b2/oficina-do-joao`, title: "Oficina do João", text: "Conserto de motos." },
        { key: `${origin}/negocio/b1/padaria-central`, title: "Padaria Central", text: "Outro trecho da mesma página." },
      ],
    });

    await expect(search.search("padaria")).resolves.toEqual({
      outcome: "results",
      results: [
        { title: "Padaria Central", type: "business", path: "/negocio/b1/padaria-central", snippet: "Padaria Central Pães frescos todos os dias. Veja" },
        { title: "Oficina do João", type: "business", path: "/negocio/b2/oficina-do-joao", snippet: "Conserto de motos." },
      ],
    });
  });

  test("classifies the public pages of the site and drops private or unknown ones", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [
        { key: "https://outro.example/negocio/b1/fora", title: "Fora", text: "x" },
        { key: `${origin}/negocio/b1`, title: "Incompleto", text: "x" },
        { key: `${origin}/negocio/b1/slug/extra`, title: "Profundo", text: "x" },
        { key: `${origin}/anuncio/a1/editar`, title: "Edição", text: "x" },
        { key: `${origin}/minha-conta/anuncios`, title: "Conta", text: "x" },
        { key: `${origin}/busca`, title: "Busca", text: "x" },
        { key: "not a url", title: "Inválido", text: "x" },
        { key: `${origin}/negocio/b3/cafe?utm=1#topo`, title: "Café", text: "Café coado." },
        { key: `${origin}/anuncio/a1/bicicleta-aro-29`, title: "Bicicleta aro 29", text: "Usada." },
        { key: `${origin}/noticia/m1/obra-na-linha-verde`, title: "Obra na Linha Verde", text: "Trânsito." },
        { key: `${origin}/categoria/c1/servicos`, title: "Serviços", text: "Categoria." },
        { key: `${origin}/categoria/c1/servicos/s1/eletricistas`, title: "Eletricistas", text: "Subcategoria." },
        { key: `${origin}/editoria/e1/cidade`, title: "Cidade", text: "Editoria." },
        { key: `${origin}/assunto/t1/transito`, title: "Trânsito", text: "Assunto." },
        { key: `${origin}/termos-e-condicoes`, title: "Termos e Condições", text: "Regras." },
      ],
    });

    const response = await search.search("macaé");
    expect(response.outcome === "results" && response.results.map(({ type, path }) => [type, path])).toEqual([
      ["business", "/negocio/b3/cafe"],
      ["ad", "/anuncio/a1/bicicleta-aro-29"],
      ["category", "/categoria/c1/servicos"],
      ["subcategory", "/categoria/c1/servicos/s1/eletricistas"],
      ["page", "/termos-e-condicoes"],
    ]);
  });

  test("prefers the page description the crawler records as front matter", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [{
        key: `${origin}/negocio/b1/022-pizzas`,
        title: "022 Pizzas",
        text: "---\ndescription: Encontre informações e contatos de 022 Pizzas, negócio de Macaé.\ntitle: 022 Pizzas\nimage: https://www.tudomacae.com.br/social-preview.png\n---\n\nCarregando...\n\n022 Pizzas em Macaé | Tudo Macaé",
      }],
    });

    const response = await search.search("pizza");
    expect(response.outcome === "results" && response.results[0]?.snippet)
      .toBe("Encontre informações e contatos de 022 Pizzas, negócio de Macaé.");
  });

  test("drops front matter and the loading placeholder from body snippets", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [{
        key: `${origin}/anuncio/m1/obra`,
        title: "Obra",
        text: "---\ntitle: Obra\n---\n\nCarregando...\n\nA prefeitura começou a obra na Linha Verde.",
      }],
    });

    const response = await search.search("obra");
    expect(response.outcome === "results" && response.results[0]?.snippet)
      .toBe("A prefeitura começou a obra na Linha Verde.");
  });

  test("shows a Classifieds category and its subcategory as a path", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [
        { key: `${origin}/categoria/c1/restaurantes/s1/padarias`, title: "Padarias em Macaé | Restaurantes | Tudo Macaé", text: "x" },
        { key: `${origin}/categoria/c1/restaurantes`, title: "Restaurantes em Macaé | Tudo Macaé", text: "x" },
        { key: `${origin}/editoria/e1/cidade`, title: "Cidade em Macaé | Tudo Macaé", text: "x" },
      ],
    });

    const response = await search.search("padaria");
    expect(response.outcome === "results" && response.results.map(result => result.title))
      .toEqual(["Restaurantes › Padarias", "Restaurantes"]);
  });

  test("derives a title from the address when the page has none and bounds the snippet", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [{ key: `${origin}/negocio/b4/salao-da-maria`, text: `${"palavra ".repeat(60)}fim` }],
    });

    const response = await search.search("salão");
    expect(response.outcome).toBe("results");
    if (response.outcome !== "results") return;
    expect(response.results[0]?.title).toBe("Salao da maria");
    expect(response.results[0]?.snippet.length).toBeLessThanOrEqual(201);
    expect(response.results[0]?.snippet.endsWith("…")).toBe(true);
    expect(response.results[0]?.snippet).not.toContain("palavr…");
  });

  test("removes the site suffix from provider titles", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: [{ key: `${origin}/negocio/b5/bar`, title: "Bar do Zé em Macaé | Tudo Macaé", text: "Petiscos." }],
    });

    const response = await search.search("bar");
    expect(response.outcome === "results" && response.results[0]?.title).toBe("Bar do Zé em Macaé");
  });

  test("limits the presented pages", async () => {
    const { search } = searchWith({
      status: "ok",
      chunks: Array.from({ length: 30 }, (_, index) => ({
        key: `${origin}/negocio/id-${index}/negocio-${index}`,
        title: `Negócio ${index}`,
        text: "Serviço.",
      })),
    });

    const response = await search.search("serviço");
    expect(response.outcome === "results" && response.results).toHaveLength(10);
  });

  test("reports no presentable page as an expected empty outcome", async () => {
    const { search, records } = searchWith({
      status: "ok",
      providerDurationMs: 12,
      chunks: [{ key: `${origin}/minha-conta/anuncios`, title: "Conta", text: "x" }],
    });

    await expect(search.search("nada")).resolves.toEqual({ outcome: "empty" });
    expect(records).toEqual([{ outcome: "empty", filter: "all", resultCount: 0, durationMs: 25, providerDurationMs: 12 }]);
  });

  test.each(["timeout", "unavailable", "provider-error", "quota"] as const)(
    "distinguishes the %s failure",
    async (status) => {
      const { search, records } = searchWith({ status });

      await expect(search.search("padaria")).resolves.toEqual({ outcome: status });
      expect(records).toEqual([{ outcome: status, filter: "all", resultCount: 0, durationMs: 25 }]);
    },
  );

  test("treats a provider exception as unavailability", async () => {
    const { search } = searchWith(() => Promise.reject(new Error("socket closed with private details")));

    await expect(search.search("padaria")).resolves.toEqual({ outcome: "unavailable" });
  });

  test("records outcome, count and latencies without the query or results", async () => {
    const record = vi.fn();
    const search = createSiteSearch({
      siteOrigin: origin,
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(180),
      provider: {
        search: async () => ({
          status: "ok",
          providerDurationMs: 60,
          chunks: [{ key: `${origin}/negocio/b1/padaria-secreta`, title: "Padaria Secreta", text: "trecho privado" }],
        }),
      },
      record,
    });

    await search.search("consulta privada");
    expect(record).toHaveBeenCalledExactlyOnceWith({
      outcome: "results",
      filter: "all",
      resultCount: 1,
      durationMs: 80,
      providerDurationMs: 60,
    });
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/privad|secreta|negocio/u);
  });
});
