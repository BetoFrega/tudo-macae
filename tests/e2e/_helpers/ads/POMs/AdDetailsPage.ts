import { BasePage } from "../../fixtures/POMs/BasePage";

export class AdDetailsPage extends BasePage {
  get businessInfoSection() {
    return this.getByRole("complementary").filter({ has: this.getByRole("heading", { level: 3, name: "Negócio" }) });
  }

  get businessInfoSectionHeader() {
    return this.businessInfoSection
      .getByRole("heading", { level: 4 })
      .filter({ visible: true });
  }

  async gotoAd(id: string, slug?: string) {
    if (slug) {
      await this.goto(`/anuncio/${id}/${slug}`);
    }
    else {
      await this.goto(`/anuncio/${id}`);
    }
  }

  async clickEdit() {
    await this.click(this.getByRole("link", { name: "Editar Anúncio" }));
  }

  async clickDelete() {
    await this.click(this.getByRole("button", { name: "Excluir" }));
  }

  async confirmDelete() {
    // Handling the confirmation dialog
    await this.click(this.getByRole("button", { name: "Excluir" }).filter({ visible: true }).last());
  }
}
