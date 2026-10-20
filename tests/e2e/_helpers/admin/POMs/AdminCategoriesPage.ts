import { expect, type Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";
import type { UserSidebar } from "../../fixtures/POMs/UserSidebar";
import type { AdminDashboardPage } from "./AdminDashboardPage";

export class AdminCategoriesPage extends BasePage {
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
    await this.dash.clickManageCategories();
  }

  async clickNewCategory() {
    await this.click(
      this.getByRole("link", { name: "Nova Categoria" }),
    );
  }

  async fillCategoryName(name: string) {
    await this.getByLabel("Nome").fill(name);
  }

  async fillCategorySlug(slug: string) {
    await this.getByLabel("Slug").fill(slug);
  }

  async fillCategoryOrder(order: string) {
    await this.getByLabel("Ordem", { exact: true }).fill(order);
  }

  async fillCategoryIcon(icon: string) {
    await this.getByLabel("Ícone").fill(icon);
  }

  get categoryIconField() {
    return this.getByLabel("Ícone");
  }

  async submitCategory() {
    await this.click(this.getByRole("button", { name: "Criar Categoria" }));
  }

  async clickEditCategory(categoryName: string) {
    await this.click(
      this.locator("div.border", { hasText: categoryName })
        .getByRole("link", { name: "Editar" }),
    );
  }

  async clickNewSubcategory() {
    await this.click(this.getByRole("button", { name: "Nova Subcategoria" }));
  }

  async fillSubcategoryName(name: string) {
    await this.getByPlaceholder("Nome").fill(name);
  }

  async fillSubcategorySlug(slug: string) {
    await this.getByPlaceholder("Slug").fill(slug);
  }

  async fillSubcategoryOrder(order: string) {
    await this.getByPlaceholder("0").fill(order);
  }

  async saveSubcategory() {
    await this.click(this.locator("button[aria-label=\"Salvar\"]"));
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Completion is the deliberate disappearance of this control.
    await expect(this.page.locator("button[aria-label=\"Salvar\"]")).toBeHidden();
  }

  async editSubcategory(name: string) {
    await this.click(
      this.getSubcategoryInList(name).getByRole("button", {
        name: "Editar",
        exact: true,
      }),
    );
  }

  async setEditedSubcategoryActive(name: string, isActive: boolean) {
    const checkbox = this.getSubcategoryInList(name).getByRole("checkbox");
    if (isActive) await checkbox.check();
    else await checkbox.uncheck();
  }

  async deleteSubcategory(name: string) {
    this.page.once("dialog", dialog => dialog.accept());
    await this.click(
      this.getSubcategoryInList(name).getByRole("button", {
        name: "Excluir",
        exact: true,
      }),
    );
    await expect(this.getSubcategoryInList(name)).toBeHidden();
  }

  get categoriesHeading() {
    return this.getByRole("heading", { name: "Categorias", exact: true });
  }

  getCategoryHeading(categoryName: string) {
    return this.getByRole("heading", { name: categoryName });
  }

  getSubcategoryInList(subcategoryName: string) {
    return this.getByRole("row", { name: subcategoryName });
  }

  async clickCategoryName(name: string) {
    await this.click(
      this.getByRole("main").getByRole("link", { name, exact: true }),
    );
  }

  async clickSubcategoryName(name: string) {
    // In subcategory list table
    await this.click(
      this.getByRole("link", { name, exact: true }),
    );
  }
}
