// @vitest-environment jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { NavigationCategory } from "../navigation";
import {
  DesktopContextRail,
  DesktopProductNavigation,
  MobileEditorialNavigation,
  SiteNavigationProvider,
} from "../navigation";

const navigation = { pathname: "/" };
const Link = (props: React.ComponentProps<"a">) => <a {...props} />;
function renderNavigation(children: React.ReactNode, presentationEnabled: boolean | "unavailable" = true) {
  return render(
    <SiteNavigationProvider
      link={Link}
      pathname={navigation.pathname}
      {...(presentationEnabled === "unavailable" ? {} : { presentationEnabled })}
    >
      {children}
    </SiteNavigationProvider>,
  );
}

const categories: NavigationCategory[] = [{
  id: "jobs", name: "Empregos", slug: "empregos", isActive: true,
}, {
  id: "services", name: "Serviços", slug: "servicos", isActive: true,
}, {
  id: "inactive", name: "Inativa", slug: "inativa", isActive: false,
}];

const sections = [{
  id: "city", slug: "cidade", name: "Cidade", order: 1, isActive: true,
  revision: 1, createdAt: 1, updatedAt: 1,
}, {
  id: "education", slug: "educacao", name: "Educação", order: 2, isActive: true,
  revision: 1, createdAt: 1, updatedAt: 1,
}, {
  id: "health", slug: "saude", name: "Saúde", order: 3, isActive: true,
  revision: 1, createdAt: 1, updatedAt: 1,
}];

test("opens one mobile public menu with classifieds and businesses", async () => {
  const user = userEvent.setup();
  navigation.pathname = "/";
  renderNavigation(<MobileEditorialNavigation categories={categories} sections={sections} />);

  const trigger = screen.getByRole("button", { name: "Abrir menu" });
  await user.click(trigger);

  const dialog = screen.getByRole("dialog", { name: "Explore o Tudo Macaé" });
  const businessHeading = within(dialog).getByRole("heading", { name: "Negócios" });
  const classifiedsHeading = within(dialog).getByRole("heading", { name: "Classificados" });
  expect(classifiedsHeading.compareDocumentPosition(businessHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(dialog).queryByRole("link", { name: "Cidade" })).not.toBeInTheDocument();
  expect(within(dialog).queryByText("Inativa")).not.toBeInTheDocument();

  await user.click(within(dialog).getByText("Explorar categorias"));
  expect(within(dialog).getByRole("link", { name: "Empregos" })).toHaveAttribute(
    "href",
    "/categoria/jobs/empregos",
  );

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("the main navigation has no editorial entry", () => {
  navigation.pathname = "/";
  renderNavigation(<DesktopProductNavigation categories={categories} sections={sections} />);
  const main = screen.getByRole("navigation", { name: "Navegação principal" });
  expect(within(main).getByRole("link", { name: "Negócios" })).toBeInTheDocument();
  expect(within(main).queryByRole("button", { name: /Matérias|Notícias/ })).not.toBeInTheDocument();
});

test("keeps the desktop classifieds mega menu focused on categories", async () => {
  const user = userEvent.setup();
  navigation.pathname = "/noticias";
  renderNavigation(<DesktopProductNavigation categories={categories} sections={sections} />);

  const mainNavigation = screen.getByRole("navigation", { name: "Navegação principal" });
  await user.click(within(mainNavigation).getByRole("button", { name: "Classificados" }));
  expect(within(mainNavigation).getByRole("link", { name: "Empregos" })).toHaveAttribute(
    "href",
    "/categoria/jobs/empregos",
  );
});

test("limits the desktop classifieds mega menu to six active categories", async () => {
  const user = userEvent.setup();
  navigation.pathname = "/";
  const manyCategories = Array.from({ length: 7 }, (_, index): NavigationCategory => ({
    id: `category-${index}`,
    name: `Categoria ${index + 1}`,
    slug: `categoria-${index + 1}`,
    isActive: true,
  }));
  renderNavigation(<DesktopProductNavigation categories={manyCategories} sections={sections} />);

  const mainNavigation = screen.getByRole("navigation", { name: "Navegação principal" });
  await user.click(within(mainNavigation).getByRole("button", { name: "Classificados" }));

  expect(within(mainNavigation).getByRole("link", { name: "Categoria 6" })).toBeInTheDocument();
  expect(within(mainNavigation).queryByRole("link", { name: "Categoria 7" })).not.toBeInTheDocument();
  expect(within(mainNavigation).getByRole("link", {
    name: "Ver todas as categorias de classificados",
  })).toHaveAttribute("href", "/#classificados");
});

test.each(["/", "/noticias", "/noticia/id/titulo"])("omits the editorial context rail at %s", (pathname) => {
  navigation.pathname = pathname;
  renderNavigation(<DesktopContextRail categories={categories} sections={sections} />);
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

test.each([
  ["/negocios", "Atalhos de negócios", "Negócios"],
  ["/negocio/business/slug", "Atalhos de negócios", "Negócios"],
  ["/categoria/jobs/empregos", "Atalhos de classificados", "Classificados"],
  ["/anuncio/ad/slug", "Atalhos de classificados", "Classificados"],
  ["/publicar", "Atalhos de classificados", "Classificados"],
] as const)("selects contextual navigation for %s", (pathname, label, link) => {
  navigation.pathname = pathname;
  renderNavigation(<DesktopContextRail categories={categories} sections={sections} />);
  expect(within(screen.getByRole("navigation", { name: label })).getByRole("link", { name: link })).toBeInTheDocument();
});
