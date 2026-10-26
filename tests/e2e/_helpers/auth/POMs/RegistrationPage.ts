import { BasePage } from "../../fixtures/POMs/BasePage";

export class RegistrationPage extends BasePage {
  async openRegistrationDialog() {
    await this.click(this.getByRole("button", { name: "Entrar" }));
    await this.switchToRegistration();
  }

  /**
   * Switches an already-open login modal into registration mode — the modal
   * the publish form opens on its own when a visitor submits while logged out.
   */
  async switchToRegistration() {
    await this.click(this.getByRole("button", { name: "Não tem conta? Criar uma nova" }));
  }

  async fillEmail(email: string) {
    await this.getByRole("textbox", { name: "Email" }).fill(email);
  }

  async fillPassword(password: string) {
    await this.getByRole("textbox", { name: "Senha" }).fill(password);
  }

  async acceptTerms() {
    await this.getByRole("checkbox", { name: "Termos de Uso" }).check();
  }

  async submit() {
    await this.click(this.getByRole("button", { name: "Criar conta" }));
  }

  async register(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.acceptTerms();
    await this.submit();
  }
}
