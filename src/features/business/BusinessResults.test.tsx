// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { StrictMode, type MouseEvent, type ReactNode } from "react";
import type { Category } from "@tudomacae/categories/model";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import { BusinessResults } from "./BusinessResults";
import {
  BusinessNavigationFocusHeading,
  BusinessNavigationFocusRouteObserver,
} from "./BusinessNavigationFocus";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, className, onClick, children }: {
    href: string;
    className?: string;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
    children: ReactNode;
  }) => (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

const categories: Category[] = [{
  id: "services",
  name: "Serviços",
  slug: "servicos",
  order: 0,
  isActive: true,
  subcategories: [{
    id: "repairs",
    name: "Manutenção",
    slug: "manutencao",
    order: 0,
    isActive: true,
  }],
}];

function business(id: string, title: string): BusinessPublicData {
  return {
    id,
    title,
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "services", subcategoryId: "repairs" }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

test("focuses the exact Business heading once after keyboard activation from the directory", async () => {
  window.history.replaceState(null, "", "/negocios");
  const user = userEvent.setup();
  const { rerender } = render(
    <StrictMode>
      <BusinessResults
        initialPage={{ items: [business("business-a", "Alfa"), business("business-b", "Beta")] }}
        categories={categories}
        source="catalog"
      />
    </StrictMode>,
  );

  const destination = "/negocio/business-a/alfa";
  const link = screen.getByRole("link", { name: "Alfa" });
  link.focus();
  await user.keyboard("{Enter}");
  window.history.pushState(null, "", destination);

  rerender(
    <StrictMode>
      <BusinessNavigationFocusHeading href={destination} title="Alfa" />
    </StrictMode>,
  );
  const heading = screen.getByRole("heading", { name: "Alfa" });
  expect(heading).toHaveAttribute("tabindex", "-1");
  expect(heading).toHaveFocus();
  expect(heading).toHaveClass("focus-visible:outline-2");

  rerender(
    <StrictMode>
      <BusinessNavigationFocusHeading key="second-mount" href={destination} title="Alfa" />
    </StrictMode>,
  );
  expect(screen.getByRole("heading", { name: "Alfa" })).not.toHaveFocus();
});

test("keeps the focus intent when the same Business redirects to its canonical slug", async () => {
  window.history.replaceState(null, "", "/negocios");
  const user = userEvent.setup();
  const { rerender } = render(
    <BusinessResults
      initialPage={{ items: [business("business-a", "Alfa antigo")] }}
      categories={categories}
      source="catalog"
    />,
  );

  const clickedPath = "/negocio/business-a/alfa-antigo";
  const canonicalPath = "/negocio/business-a/alfa-atual";
  const link = screen.getByRole("link", { name: "Alfa antigo" });
  expect(link).toHaveAttribute("href", clickedPath);
  link.focus();
  await user.keyboard("{Enter}");
  window.history.pushState(null, "", canonicalPath);

  rerender(<BusinessNavigationFocusHeading href={canonicalPath} title="Alfa atual" />);

  expect(screen.getByRole("heading", { name: "Alfa atual" })).toHaveFocus();
});

test("keeps the focus intent while the root route observer sees the canonical slug redirect", async () => {
  window.history.replaceState(null, "", "/negocios");
  const user = userEvent.setup();
  const { rerender } = render(
    <>
      <BusinessNavigationFocusRouteObserver />
      <BusinessResults
        initialPage={{ items: [business("business-a", "Alfa antigo")] }}
        categories={categories}
        source="catalog"
      />
    </>,
  );

  const canonicalPath = "/negocio/business-a/alfa-atual";
  screen.getByRole("link", { name: "Alfa antigo" }).focus();
  await user.keyboard("{Enter}");
  window.history.pushState(null, "", "/negocio/business-a/alfa-antigo");
  rerender(
    <>
      <BusinessNavigationFocusRouteObserver />
      <p>Carregando</p>
    </>,
  );
  window.history.replaceState(null, "", canonicalPath);
  rerender(
    <>
      <BusinessNavigationFocusRouteObserver />
      <BusinessNavigationFocusHeading href={canonicalPath} title="Alfa atual" />
    </>,
  );

  expect(screen.getByRole("heading", { name: "Alfa atual" })).toHaveFocus();
});

test("drops the focus intent when an interrupted navigation commits an unrelated route", async () => {
  window.history.replaceState(null, "", "/negocios");
  const user = userEvent.setup();
  const { rerender } = render(
    <>
      <BusinessNavigationFocusRouteObserver />
      <BusinessResults
        initialPage={{ items: [business("business-a", "Alfa")] }}
        categories={categories}
        source="catalog"
      />
    </>,
  );

  const destination = "/negocio/business-a/alfa";
  screen.getByRole("link", { name: "Alfa" }).focus();
  await user.keyboard("{Enter}");
  window.history.pushState(null, "", "/noticias");
  rerender(
    <>
      <BusinessNavigationFocusRouteObserver />
      <p>Notícias</p>
    </>,
  );
  window.history.pushState(null, "", destination);
  rerender(
    <>
      <BusinessNavigationFocusRouteObserver />
      <BusinessNavigationFocusHeading href={destination} title="Alfa" />
    </>,
  );

  expect(screen.getByRole("heading", { name: "Alfa" })).not.toHaveFocus();
});

test("does not carry the focus intent to a different Business ID", async () => {
  window.history.replaceState(null, "", "/negocios");
  const user = userEvent.setup();
  const { rerender } = render(
    <BusinessResults
      initialPage={{ items: [business("business-a", "Alfa")] }}
      categories={categories}
      source="catalog"
    />,
  );

  const differentBusiness = "/negocio/business-b/beta";
  const link = screen.getByRole("link", { name: "Alfa" });
  link.focus();
  await user.keyboard("{Enter}");
  window.history.pushState(null, "", differentBusiness);

  rerender(<BusinessNavigationFocusHeading href={differentBusiness} title="Beta" />);

  expect(screen.getByRole("heading", { name: "Beta" })).not.toHaveFocus();
});

test.each([
  ["pointer activation", async (user: ReturnType<typeof userEvent.setup>, link: HTMLElement) => user.click(link)],
  ["modified keyboard activation", async (user: ReturnType<typeof userEvent.setup>, link: HTMLElement) => {
    link.focus();
    await user.keyboard("{Control>}{Enter}{/Control}");
  }],
])("does not focus a destination after %s", async (_name, activate) => {
  window.history.replaceState(null, "", "/negocios");
  const user = userEvent.setup();
  const { rerender } = render(
    <BusinessResults
      initialPage={{ items: [business("business-a", "Alfa")] }}
      categories={categories}
      source="catalog"
    />,
  );
  const destination = "/negocio/business-a/alfa";
  const link = screen.getByRole("link", { name: "Alfa" });
  await activate(user, link);
  window.history.pushState(null, "", destination);
  rerender(<BusinessNavigationFocusHeading href={destination} title="Alfa" />);
  expect(screen.getByRole("heading", { name: "Alfa" })).not.toHaveFocus();
});

test("does not move focus for a direct route load", () => {
  const destination = "/negocio/business-a/alfa";
  window.history.replaceState(null, "", destination);
  render(<BusinessNavigationFocusHeading href={destination} title="Alfa" />);
  expect(screen.getByRole("heading", { name: "Alfa" })).not.toHaveFocus();
});

test("appends another business batch and updates the loaded count", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [business("c", "Casa Clara")] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();

  render(
    <BusinessResults
      initialPage={{
        items: [business("a", "Alfa"), business("b", "Beta")],
        nextCursor: "next-batch",
      }}
      categories={categories}
      source="catalog"
    />,
  );

  expect(screen.getByText("2 negócios exibidos")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Carregar mais negócios" }));

  expect(await screen.findByText("Casa Clara")).toBeInTheDocument();
  expect(screen.getByText("3 negócios exibidos")).toBeInTheDocument();
  expect(screen.getByText("Alfa")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Carregar mais negócios" }))
    .not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/negocios?cursor=next-batch",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
