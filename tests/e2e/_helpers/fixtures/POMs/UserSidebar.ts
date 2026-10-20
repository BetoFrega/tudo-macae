import { BasePage } from "./BasePage";

export class UserSidebar extends BasePage {
  async open() {
    await this.click(this.getByRole("button", { name: "Minha conta" }));
  }

  async clickMyAds() {
    await this.clickNavLink("Meus Anúncios");
  }

  async clickMyProfiles() {
    await this.clickNavLink("Meus Perfis");
  }

  async clickAdminPanel() {
    await this.clickNavLink("Painel Admin");
  }

  async clickAdminLink() {
    await this.click(this.getByRole("link", { name: "Admin" }));
  }

  private async clickNavLink(name: string) {
    await this.click(this.getByRole("link", { name, exact: true }), {
      ensureVisible: () => this.open(),
    });
  }

  async logout() {
    await this.click(this.getByRole("button", { name: "Sair" }));
  }

  get heading() {
    return this.getByRole("heading", { name: "Minha Conta" });
  }

  get myAdsLink() {
    return this.getByRole("link", { name: "Meus Anúncios" });
  }

  get myProfilesLink() {
    return this.getByRole("link", { name: "Meus Perfis" });
  }

  get logoutButton() {
    return this.getByRole("button", { name: "Sair" });
  }

  get adminPanelLink() {
    return this.getByRole("link", { name: "Painel Admin", exact: true });
  }

  getUserEmail(email: string) {
    return this.getByText(email);
  }
}
