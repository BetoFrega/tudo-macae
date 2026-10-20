import type { Page } from "@playwright/test";
import { BasePage } from "./BasePage";
import type { UserSidebar } from "./UserSidebar";
import { ActivityAreasForm } from "../../advertiser-profile/POMs/ActivityAreasForm";

export class ProfilePage extends BasePage {
  get activityAreas() { return new ActivityAreasForm(this.page); }
  get titleInput() { return this.getByLabel("Título do Perfil", { exact: true }); }
  get descriptionInput() { return this.getByLabel("Descrição (Opcional)", { exact: true }); }
  get contactInputs() { return this.getByPlaceholder("(00) 00000-0000", { exact: true }); }
  get removeContactButtons() { return this.getByRole("button", { name: "Remover Contato", exact: true }); }
  get whatsappCheckboxes() { return this.getByRole("checkbox"); }
  get editHeading() { return this.getByRole("heading", { name: "Editar Perfil", exact: true }).filter({ visible: true }); }

  contactAt(index: number) { return this.contactInputs.nth(index); }
  get lastContact() { return this.contactInputs.last(); }
  removeContactAt(index: number) { return this.removeContactButtons.nth(index); }
  get lastRemoveContactButton() { return this.removeContactButtons.last(); }
  get firstRemoveContactButton() { return this.removeContactButtons.first(); }
  get lastWhatsappCheckbox() { return this.whatsappCheckboxes.last(); }
  get identityTypeSection() { return this.getByRole("region", { name: "Tipo do perfil", exact: true }); }
  identityTypeChoice(label: "Meu perfil pessoal" | "Um negócio") { return this.getByRole("radio", { name: label, exact: true }); }

  async classifyAs(label: "Meu perfil pessoal" | "Um negócio") {
    await this.identityTypeChoice(label).check();
    await this.click(this.getByRole("button", { name: "Definir tipo", exact: true }));
  }

  async editProfileNamed(title: string) {
    await this.click(
      this.getByRole("article", { name: title, exact: true })
        .getByRole("link", { name: `Editar: ${title}`, exact: true }),
    );
  }

  async edit(id: string) {
    await this.click(this.getByRole("link", { name: /^(Editar|Completar cadastro):/ }).and(this.locator(`a[href*="${id}"]`)));
  }

  async addContact() {
    await this.click(this.getByRole("button", { name: "Adicionar Contato", exact: true }));
  }

  async save() {
    await this.click(this.getByRole("button", { name: "Salvar Alterações", exact: true }));
  }

  sidebar: UserSidebar;
  constructor(page: Page, sidebar: UserSidebar) {
    super(page);
    this.sidebar = sidebar;
  }

  async gotoProfiles() {
    await this.sidebar.open();
    await this.sidebar.clickMyProfiles();
  }

  async clickCreateNewProfile() {
    const link = this.getByRole("link", { name: "Criar Novo Perfil" });
    await link.waitFor({ state: "visible" });
    await this.click(link);
  }

  async fillProfileTitle(title: string) {
    await this.getByRole("textbox", { name: "Título do Perfil" })
      .fill(title);
  }

  async fillProfileDescription(description: string) {
    await this.getByRole("textbox", { name: "Descrição" })
      .fill(description);
  }

  async submit() {
    await this.click(this.getByRole("button", { name: "Criar Perfil" }));
  }
}
