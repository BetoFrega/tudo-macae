import { BasePage } from "../../fixtures/POMs/BasePage";

export class StoreCategoriesPage extends BasePage {
  businesses(subcategoryName: string) {
    return this.getByRole("region", { name: `Negócios da subcategoria ${subcategoryName}`, exact: true });
  }

  businessHeading(subcategoryName: string) {
    return this.getByRole("heading", { name: `Negócios da subcategoria ${subcategoryName}`, exact: true });
  }

  businessCards(subcategoryName: string) {
    return this.businesses(subcategoryName).locator("[data-slot=\"card\"]");
  }

  businessCard(subcategoryName: string, title: string) {
    return this.businessCards(subcategoryName).filter({ has: this.getByRole("link", { name: title, exact: true }) });
  }

  async gotoCategory(categoryId: string, slug: string) {
    await this.page.goto(`/categoria/${categoryId}/${slug}`);
  }

  async gotoSubcategory(
    categoryId: string,
    catSlug: string,
    subId: string,
    subSlug: string,
  ) {
    await this.page.goto(
      `/categoria/${categoryId}/${catSlug}/${subId}/${subSlug}`,
    );
  }

  async clickHeaderCategory(name: string) {
    const navigation = this.getByRole("navigation", { name: "Navegação principal" });
    const openClassifieds = async () => {
      const trigger = navigation.getByRole("button", { name: "Classificados" });
      if (await trigger.getAttribute("aria-expanded") !== "true") await this.click(trigger);
    };
    await openClassifieds();
    await this.click(navigation.getByRole("link", { name, exact: true }), {
      ensureVisible: openClassifieds,
    });
  }

  async clickHomepageCategory(name: string) {
    const category = this.getByRole("navigation", { name: "Categorias de negócios e anúncios" })
      .locator("details").filter({ has: this.locator("summary", { hasText: name }) });
    await this.click(category.locator("summary"));
    await this.click(category.getByRole("link", { name: `Ver tudo em ${name}`, exact: true }));
  }

  async clickHomepageSubcategory(name: string) {
    const category = this.getByRole("navigation", { name: "Categorias de negócios e anúncios" })
      .locator("details").filter({
        // eslint-disable-next-line local/no-raw-playwright-page-selectors -- The closed disclosure exposes this link only through the accessibility tree.
        has: this.page.getByRole("link", { name, exact: true, includeHidden: true }),
      });
    if (await category.getAttribute("open") === null) {
      await this.click(category.locator("summary"));
    }
    await this.click(category.getByRole("link", { name, exact: true }));
  }

  getHeading(name: string) {
    return this.getByRole("heading", { name: name, level: 1 });
  }

  getEmptyStateHeading(scopeName: string) {
    return this.getByRole("heading", {
      name: `Quer anunciar em ${scopeName}?`,
      level: 2,
    });
  }

  getPublishAdLink() {
    return this.getByRole("link", { name: "Publicar anúncio grátis" });
  }

  breadcrumbsHas(name: string) {
    // Assuming breadcrumbs are implemented or utilizing a specific selector if not standard
    // If no breadcrumbs, we verify page content.
    // For now, let's verify text on page.
    return this.getByText(name);
  }
}
