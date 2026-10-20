import { BasePage } from "../../fixtures/POMs/BasePage";

export class LoginPage extends BasePage {
  private async fillEmail(email: string) {
    await this.getByRole("textbox", { name: "Email" }).fill(email);
  }

  private async fillPassword(password: string) {
    await this.getByRole("textbox", { name: "Senha" }).fill(password);
  }

  private async submit() {
    await this.click(this.getByRole("button", { name: "Entrar" }));
  }

  private async openLoginDialog() {
    await this.click(this.getByRole("button", { name: "Entrar" }));
  }

  async login(email: string, password: string) {
    await this.openLoginDialog();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }
}
