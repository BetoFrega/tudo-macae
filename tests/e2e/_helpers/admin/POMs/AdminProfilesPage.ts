import type { Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";
import type { UserSidebar } from "../../fixtures/POMs/UserSidebar";
import type { AdminDashboardPage } from "./AdminDashboardPage";
import { ActivityAreasForm } from "../../advertiser-profile/POMs/ActivityAreasForm";

/**
 * Page object model for the Admin Advertiser Profiles Page.
 * @link /src/app/admin/perfis/page.tsx
 */
export class AdminProfilesPage extends BasePage {
  get activityAreas() { return new ActivityAreasForm(this.page); }
  sidebar: UserSidebar;
  dash: AdminDashboardPage;
  constructor(page: Page, sidebar: UserSidebar, dash: AdminDashboardPage) {
    super(page);
    this.sidebar = sidebar;
    this.dash = dash;
  }

  async goto() {
    await this.page.goto("/admin/perfis");
  }

  get heading() {
    return this.getByRole("heading", { name: "Perfis de Anunciantes", exact: true }).filter({ visible: true });
  }

  get createClaimableLink() {
    return this.getByRole("link", { name: "Criar perfil reivindicável", exact: true });
  }

  get createPageHeading() {
    return this.getByRole("heading", { name: "Novo perfil reivindicável", exact: true });
  }

  get titleColumnHeader() {
    return this.getByRole("columnheader", { name: "Título", exact: true });
  }

  get descriptionColumnHeader() {
    return this.getByRole("columnheader", { name: "Descrição", exact: true });
  }

  get createdAtColumnHeader() {
    return this.getByRole("columnheader", { name: "Data de Criação", exact: true });
  }

  get lastUpdateColumnHeader() {
    return this.getByRole("columnheader", { name: "Última Atualização", exact: true });
  }

  get actionsColumnHeader() {
    return this.getByRole("columnheader", { name: "Ações", exact: true });
  }

  getProfileRow(title: string) {
    return this.getByRole("row").filter({ has: this.getByRole("cell", { name: title, exact: true }) });
  }

  getEditButton(title: string) {
    return this.getProfileRow(title).getByRole("link", { name: "Editar", exact: true });
  }

  getClaimableRow(title: string) {
    return this.getByRole("row")
      .filter({ hasText: title })
      .filter({ has: this.getByText("Reivindicável", { exact: true }) });
  }

  get emptyMessage() {
    return this.getByText("Nenhum perfil de anunciante encontrado.", { exact: true });
  }

  // Edit page elements
  get editPageHeading() {
    return this.getByRole("heading", {
      name: "Editar Perfil de Anunciante",
      exact: true,
      level: 2,
    }).filter({ visible: true });
  }

  get titleInput() {
    return this.getByLabel("Título do Perfil", { exact: true });
  }

  get descriptionInput() {
    return this.getByLabel("Descrição (Opcional)", { exact: true });
  }

  get addContactButton() {
    return this.getByRole("button", { name: "Adicionar Contato", exact: true });
  }

  get contactInput() {
    return this.getByPlaceholder("(00) 00000-0000");
  }

  get sourceInput() {
    return this.getByLabel("Fonte pública", { exact: true });
  }

  get createButton() {
    return this.getByRole("button", { name: "Criar perfil público", exact: true });
  }

  get deleteButton() {
    return this.getByRole("button", { name: "Excluir perfil", exact: true });
  }

  get saveButton() {
    return this.getByRole("button", { name: "Salvar Alterações", exact: true });
  }

  get backButton() {
    return this.getByRole("link", { name: "Voltar", exact: true });
  }
}
