import type { Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";
import type { UserSidebar } from "../../fixtures/POMs/UserSidebar";
import type { AdminDashboardPage } from "./AdminDashboardPage";

/**
 * Page object model for the Admin Users Page.
 * @link /src/app/admin/usuarios/page.tsx
 */
export class AdminUsersPage extends BasePage {
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
    await this.dash.clickViewUsers();
  }

  /**
   * Navigate to users page via sidebar (open sidebar -> admin panel -> users link).
   * Useful when already logged in as admin but not on admin pages.
   */
  async gotoViaAdminSidebar() {
    await this.click(this.getByRole("button", { name: "Minha conta" }));
    await this.click(this.getByRole("link", { name: "Painel Admin" }));
    await this.click(this.getByRole("navigation").getByRole("link", { name: "Usuários" }));
  }

  get heading() {
    return this.getByRole("heading", { name: "Usuários" });
  }

  get emailColumnHeader() {
    return this.getByRole("columnheader", { name: "Email" });
  }

  get nameColumnHeader() {
    return this.getByRole("columnheader", { name: "Nome" });
  }

  get createdAtColumnHeader() {
    return this.getByRole("columnheader", { name: "Data de Criação" });
  }

  get lastAccessColumnHeader() {
    return this.getByRole("columnheader", { name: "Último Acesso" });
  }

  get adminColumnHeader() {
    return this.getByRole("columnheader", { name: "Admin" });
  }

  getUserRow(email: string) {
    return this.getByRole("row").filter({ hasText: email });
  }

  getUserEmailCell(email: string) {
    return this.getByRole("cell", { name: email, exact: true });
  }

  getGrantAdminButton(email: string) {
    return this.getUserRow(email).getByRole("button", {
      name: /Tornar.*admin/i,
    });
  }

  getRemoveAdminButton(email: string) {
    return this.getUserRow(email).getByRole("button", {
      name: /Remover admin/i,
    });
  }

  get editorColumnHeader() {
    return this.getByRole("columnheader", { name: "Editor" });
  }

  getGrantEditorButton(email: string) {
    return this.getUserRow(email).getByRole("button", {
      name: /Tornar.*editor/i,
    });
  }

  getRemoveEditorButton(email: string) {
    return this.getUserRow(email).getByRole("button", {
      name: /Remover editor/i,
    });
  }

  get addEditorDialogTitle() {
    return this.getByText("Adicionar Editor");
  }

  get removeEditorDialogTitle() {
    return this.getByText("Remover Editor");
  }

  get dialog() {
    return this.getByRole("dialog");
  }

  get addAdminDialogTitle() {
    return this.getByText("Adicionar Admin");
  }

  get removeAdminDialogTitle() {
    return this.getByText("Remover Admin");
  }

  get confirmButton() {
    return this.getByRole("button", { name: "Confirmar" });
  }

  get cancelButton() {
    return this.getByRole("button", { name: "Cancelar" });
  }

  get selfRemoveWarning() {
    return this.getByText(
      "Você não pode remover seu próprio status de admin",
    );
  }
}
