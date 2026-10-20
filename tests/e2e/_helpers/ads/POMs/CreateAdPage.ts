import { expect } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";

export class CreateAdPage extends BasePage {
  get titleCharacterCount() {
    return this.locator("span").filter({ hasText: /^\s*\d+\s*\/\s*140\s*$/ });
  }

  get textCharacterCount() {
    return this.locator("span").filter({ hasText: /^\s*\d+\s*\/\s*1000\s*$/ });
  }

  async fillTitle(title: string) {
    const input = this.getByRole("textbox", { name: /Título do anúncio/i });
    // A value typed before hydration is reset when React attaches; vinext hydrates later than `next start`.
    await expect.poll(() => input.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
    await input.fill(title);
  }

  async selectCategory(categoryName: string) {
    await this.click(this.getByRole("combobox", { name: "Categoria", exact: true }));
    // Wait for the option to be visible before clicking
    const option = this.getByRole("option", { name: categoryName });
    await expect(option).toBeVisible({ timeout: 10000 });
    await this.click(option);
  }

  async selectSubcategory(subcategoryName: string) {
    await this.click(this.getByRole("combobox", { name: "Subcategoria" }));
    await this.click(this.getByRole("option", { name: subcategoryName }));
  }

  async fillAdText(text: string) {
    await this.getByRole("textbox", { name: /Texto do anúncio/i })
      .fill(text);
  }

  /**
   * The file input the "Adicionar Foto" area hides. The browser processes the
   * image before it is ever sent — resize, JPEG, compression — so the photo
   * card only appears once that finishes.
   */
  async choosePhoto(name: string, mimeType: string, buffer: Buffer) {
    const input = this.getByRole("button", { name: /Adicionar foto JPEG, PNG/ });
    // A file chosen before hydration fires no React change event; vinext hydrates after `load`.
    await expect.poll(() => input.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
    await input.setInputFiles({ name, mimeType, buffer });
  }

  photoTitleField(index = 0) {
    return this.getByLabel(/Título da imagem\s*\(opcional\)/i).nth(index);
  }

  /**
   * During a navigation the outgoing form can still be in the DOM, so `last()`
   * selects the form being navigated to.
   */
  get photoCounter() {
    return this.getByTestId("photo-counter").last();
  }

  async submit() {
    await this.click(this.getByRole("button", { name: "Continuar", exact: true }));
  }

  /**
   * Creates an ad with the specified category, subcategory, title, and text.
   * Convenience method combining fillTitle, selectCategory, selectSubcategory, fillAdText, and submit.
   */
  async createAd(options: {
    category: string;
    subcategory: string;
    title: string;
    text: string;
    advertiserProfile?: string;
  }) {
    await this.fillTitle(options.title);
    await this.selectCategory(options.category);
    await this.selectSubcategory(options.subcategory);
    await this.fillAdText(options.text);
    await this.submit();
    await this.finishPublication(options.advertiserProfile);
  }

  async finishPublication(advertiserProfile?: string) {
    await expect(this.getByText("Seu anúncio está salvo e ainda não foi publicado.")).toBeVisible();
    if (advertiserProfile) {
      const section = this.getByRole("button", { name: /Quem anuncia e como entrar em contato/ });
      if (await section.getAttribute("aria-expanded") !== "true") await this.click(section);
      const selector = this.getByRole("combobox", { name: "Perfil do Anunciante" });
      if (await selector.count()) {
        await this.click(selector);
        const option = this.getByRole("option", { name: advertiserProfile, exact: true });
        await expect(option).toBeVisible();
        await option.press("Enter");
        await expect(selector).toHaveText(advertiserProfile);
      }
    }
    const profileName = this.getByRole("textbox", { name: "Nome do anunciante" });
    if (await profileName.isVisible()) {
      if (!await profileName.inputValue()) await profileName.fill(advertiserProfile ?? "Anunciante de teste");
      const phone = this.getByRole("textbox", { name: "Telefone 1", exact: true });
      if (!await phone.inputValue()) await phone.fill("22999999999");
      // Only the API Worker composition asks for a type when the journey creates the profile.
      const businessType = this.getByRole("radio", { name: "Um negócio", exact: true });
      if (await businessType.isVisible()) await businessType.check();
      await this.click(this.getByRole("button", { name: /^(Criar|Salvar) perfil$/ }));
      await expect(this.getByRole("button", { name: "Publicar anúncio", exact: true })).toBeVisible();
    }
    const publication = this.getByRole("button", { name: /^Publicação/ });
    if (await publication.getAttribute("aria-expanded") !== "true") await this.click(publication);
    await this.click(this.getByRole("button", { name: "Publicar anúncio", exact: true }));
    await expect(this.getByRole("heading", { name: "Seu anúncio está publicado" })).toBeVisible({ timeout: 15_000 });
    await this.click(this.getByRole("link", { name: "Ver anúncio", exact: true }));
  }
}
