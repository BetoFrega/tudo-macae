// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderReact, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SiteSearchProvider, SiteSearchFilters, SiteSearchLoading } from "../ui";
import { SiteSearchForm } from "../ui";
import { SiteSearchResults } from "../ui";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

function render(element: React.ReactNode) {
  return renderReact(<SiteSearchProvider capture={mocks.capture}>{element}</SiteSearchProvider>);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("SiteSearchForm", () => {
  test("submits a shareable GET query and reports only the surface", () => {
    render(<SiteSearchForm surface="header" />);

    const form = screen.getByRole("search", { name: "Buscar no Tudo Macaé" });
    const field = screen.getByRole("searchbox", { name: "O que você procura?" });
    expect(form.getAttribute("action")).toBe("/busca");
    expect(form.getAttribute("method")).toBe("get");
    expect(field.getAttribute("name")).toBe("q");
    expect(form.classList.contains("ph-no-capture")).toBe(true);
    expect(field.classList.contains("ph-no-capture")).toBe(true);

    // jsdom cannot navigate; the browser journey proves the GET submission.
    form.addEventListener("submit", event => event.preventDefault());
    fireEvent.change(field, { target: { value: "padaria privada" } });
    fireEvent.submit(form);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith("site_search_submitted", { source_surface: "header" });
  });

  test("rejects a whitespace-only query before submitting and keeps what was typed", () => {
    render(<SiteSearchForm surface="page" />);
    const field = screen.getByRole("searchbox", { name: "O que você procura?" }) as HTMLInputElement;

    fireEvent.change(field, { target: { value: "   " } });
    expect(field.checkValidity()).toBe(false);
    expect(field.value).toBe("   ");
    fireEvent.change(field, { target: { value: " padaria " } });
    expect(field.checkValidity()).toBe(true);
  });

  test("keeps the current query and type filter in the results page form", () => {
    const { container } = render(<SiteSearchForm surface="page" defaultQuery="oficina" filter="businesses" />);

    expect(screen.getByRole("searchbox", { name: "O que você procura?" })).toHaveProperty("value", "oficina");
    expect(screen.getByRole("button", { name: "Buscar" })).toBeTruthy();
    expect(container.querySelector("input[type=hidden][name=tipo]")?.getAttribute("value")).toBe("negocios");
  });
});

describe("SiteSearchFilters", () => {
  test("offers every type group for the same query and marks the current one", () => {
    render(<SiteSearchFilters query="padaria central" filter="ads" />);

    const navigation = screen.getByRole("navigation", { name: "Filtrar por tipo" });
    expect(navigation.classList.contains("ph-no-capture")).toBe(true);
    const links = screen.getAllByRole("link");
    expect(links.map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Tudo", "/busca?q=padaria+central"],
      ["Negócios", "/busca?q=padaria+central&tipo=negocios"],
      ["Anúncios", "/busca?q=padaria+central&tipo=anuncios"],
      ["Categorias e páginas", "/busca?q=padaria+central&tipo=navegacao"],
    ]);
    expect(screen.getByRole("link", { name: "Anúncios" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Tudo" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("SiteSearchLoading", () => {
  test("announces a longer wait politely while keeping the results area busy", async () => {
    vi.useFakeTimers();
    render(<SiteSearchLoading />);

    const status = screen.getByRole("status");
    const results = screen.getByRole("region", { name: "Resultados da busca" });
    expect(status.textContent).toBe("Buscando…");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(results.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(document.body);

    await act(async () => vi.advanceTimersByTimeAsync(3_000));

    expect(status.textContent).toBe("A busca está levando mais tempo que o normal. Você ainda pode ajustar sua busca.");
    expect(document.activeElement).toBe(document.body);
  });

  // jsdom applies no Tailwind CSS, so this reads the variants the browser would apply:
  // an unprefixed or `motion-reduce:` animation without `motion-reduce:animate-none`
  // would keep the skeleton pulsing for visitors who ask for reduced motion.
  test("pulses the skeleton only when the visitor allows motion", () => {
    render(<SiteSearchLoading />);

    const results = screen.getByRole("region", { name: "Resultados da busca" });
    const tokensOf = (element: Element) => [...element.classList];
    const animated = [...results.querySelectorAll("*")].filter(element =>
      tokensOf(element).some(token => /^(?:motion-safe:|motion-reduce:)?animate-(?!none$)/u.test(token)));
    const animatedUnderReducedMotion = animated.filter((element) => {
      const tokens = tokensOf(element);
      if (tokens.some(token => /^motion-reduce:animate-(?!none$)/u.test(token))) return true;
      return tokens.some(token => /^animate-(?!none$)/u.test(token)) && !tokens.includes("motion-reduce:animate-none");
    });

    expect(animated).toHaveLength(13);
    expect(animatedUnderReducedMotion).toEqual([]);
  });
});

describe("SiteSearchResults", () => {
  test("lists results with type and snippet and reports clicks by position and type only", () => {
    render(
      <SiteSearchResults
        query="padaria"
        response={{
          outcome: "results",
          results: [
            { title: "Padaria Central", type: "business", path: "/negocio/b1/padaria-central", snippet: "Pães frescos." },
            { title: "Café da Praça", type: "article", path: "/noticia/m2/cafe-da-praca", snippet: "Café e pães." },
          ],
        }}
      />,
    );

    const region = screen.getByRole("region", { name: "2 resultados para padaria" });
    expect(region.classList.contains("ph-no-capture")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("2 resultados encontrados");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Negócio");
    expect(items[1]?.textContent).toContain("Notícia");
    expect(items[0]?.textContent).toContain("Pães frescos.");
    const link = screen.getByRole("link", { name: "Café da Praça" });
    expect(link.getAttribute("href")).toBe("/noticia/m2/cafe-da-praca");

    fireEvent.click(link);
    expect(mocks.capture).toHaveBeenCalledWith("site_search_completed", { outcome: "results", result_count: 2, type_filter: "all" });
    expect(mocks.capture).toHaveBeenCalledWith("site_search_result_clicked", { position: 2, result_type: "article", type_filter: "all" });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toMatch(/padaria|Café|negocio|noticia/u);
  });

  test("tells an empty search apart and offers existing navigation", () => {
    render(<SiteSearchResults query="xyz" filter="ads" response={{ outcome: "empty" }} />);

    expect(screen.getByRole("heading", { name: "Nada encontrado para xyz" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Nada encontrado");
    expect(screen.getByRole("link", { name: "Explorar o catálogo de negócios" }).getAttribute("href")).toBe("/negocios");
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith("site_search_completed", { outcome: "empty", result_count: 0, type_filter: "ads" });
  });

  test.each([
    ["timeout", "A busca demorou mais que o esperado."],
    ["unavailable", "A busca está indisponível no momento."],
    ["provider-error", "A busca não conseguiu responder agora."],
    ["quota", "A busca atingiu o limite de uso por enquanto."],
  ] as const)("explains the %s failure and offers existing navigation", (outcome, message) => {
    render(<SiteSearchResults query="padaria" response={{ outcome }} />);

    expect(screen.getByRole("heading", { name: "Não foi possível buscar agora" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(`Não foi possível buscar agora. ${message}`);
    // Visible explanation plus the announced status.
    expect(screen.getAllByText(message, { exact: false })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Ler as notícias" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Nada encontrado/u })).toBeNull();
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith("site_search_completed", { outcome, result_count: 0, type_filter: "all" });
  });
});

test("search UI works with document links and no telemetry adapter", () => {
  renderReact(<SiteSearchFilters query="padaria" />);
  expect(screen.getByRole("link", { name: "Negócios" })).toHaveAttribute("href", "/busca?q=padaria&tipo=negocios");
  expect(mocks.capture).not.toHaveBeenCalled();
});
