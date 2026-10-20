import type { Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";
import type { UserSidebar } from "../../fixtures/POMs/UserSidebar";

export class AdminDashboardPage extends BasePage {
  sidebar: UserSidebar;
  constructor(page: Page, sidebar: UserSidebar) {
    super(page);
    this.sidebar = sidebar;
  }

  async goto() {
    await this.sidebar.open();
    await this.sidebar.clickAdminPanel();
  }

  async clickManageCategories() {
    await this.click(this.getByRole("link", { name: "Gerenciar Categorias" }));
  }

  async clickViewUsers() {
    await this.click(this.getByRole("link", { name: "Ver Usuários" }));
  }

  async clickViewProfiles() {
    await this.click(this.getByRole("link", { name: "Ver Perfis" }));
  }

  async clickViewAds() {
    await this.click(this.getByRole("link", { name: "Ver Anúncios" }));
  }

  get heading() {
    return this.getByRole("heading", { name: "Painel Administrativo" });
  }
}
