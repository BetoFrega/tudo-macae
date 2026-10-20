import { BasePage } from "./BasePage";

/**
 * Page object model for the front door.
 * @link /src/app/page.tsx
 */
export class HomePage extends BasePage {
  async open() {
    await this.page.goto("/");
  }

  get publishCta() {
    return this.locator("[data-homepage-publish-cta]").getByRole("link", { name: "Anunciar grátis" });
  }

  get discoveryHeading() {
    return this.getByRole("heading", {
      name: "Encontre em Macaé", exact: true,
    });
  }

  get recentAds() {
    return this.getByRole("heading", { name: "Anúncios recentes" });
  }
}
