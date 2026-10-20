import type { Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";
import type { UserSidebar } from "../../fixtures/POMs/UserSidebar";
import type { AdminDashboardPage } from "./AdminDashboardPage";

/**
 * Page object model for the Admin Ads Page.
 * @link /src/app/admin/anuncios/page.tsx
 */
export class AdminAdsPage extends BasePage {
  sidebar: UserSidebar;
  dash: AdminDashboardPage;

  constructor(page: Page, sidebar: UserSidebar, dash: AdminDashboardPage) {
    super(page);
    this.sidebar = sidebar;
    this.dash = dash;
  }

  async goto() {
    await this.sidebar.open();
    await this.sidebar.clickAdminPanel();
    await this.dash.clickViewAds();
  }

  get heading() {
    return this.getByRole("heading", { name: "Anúncios" });
  }

  get adColumnHeader() {
    return this.getByRole("columnheader", { name: "Anúncio" });
  }

  get categoryColumnHeader() {
    return this.getByRole("columnheader", {
      name: "Categoria",
      exact: true,
    });
  }

  get subcategoryColumnHeader() {
    return this.getByRole("columnheader", { name: "Subcategoria" });
  }

  get createdAtColumnHeader() {
    return this.getByRole("columnheader", { name: "Data de Criação" });
  }

  get statusColumnHeader() {
    return this.getByRole("columnheader", { name: "Status" });
  }

  get allFilterButton() {
    return this.getByRole("button", { name: /^Todos/ });
  }

  get activeFilterButton() {
    return this.getByRole("button", { name: /^Ativos/ });
  }

  get pausedFilterButton() {
    return this.getByRole("button", { name: /^Pausados/ });
  }

  getAdRow(text: string) {
    return this.getByRole("row").filter({ hasText: text });
  }

  getAdLink(text: string) {
    return this.getByRole("link", { name: text });
  }

  get noAdsMessage() {
    return this.getByText("Nenhum anúncio encontrado.");
  }
}
