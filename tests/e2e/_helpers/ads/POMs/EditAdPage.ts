import { CreateAdPage } from "./CreateAdPage";

export class EditAdPage extends CreateAdPage {
  async saveChanges() {
    await this.click(this.getByRole("button", { name: "Salvar Alterações" }));
    await this.page.waitForURL(url => /^\/anuncio\/[^/]+\/[^/]+$/.test(url.pathname)
      && !url.pathname.endsWith("/editar"));
  }
}
