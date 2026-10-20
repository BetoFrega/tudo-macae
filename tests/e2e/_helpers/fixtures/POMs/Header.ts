import { BasePage } from "./BasePage";

export class Header extends BasePage {
  async clickLogin() {
    await this.click(this.getByRole("button", { name: "Entrar" }));
  }

  async clickCreateAd() {
    await this.clickMyAccount();
    await this.click(this.getByRole("dialog", { name: "Minha Conta", exact: true })
      .getByRole("link", { name: "Criar Anúncio", exact: true }));
  }

  async clickMyAccount() {
    await this.click(this.getByRole("button", { name: "Minha conta" }));
  }

  /**
   * Opens the account sidebar and logs out the current user.
   */
  async logout() {
    await this.clickMyAccount();
    await this.click(this.getByRole("button", { name: "Sair" }));
  }
}
