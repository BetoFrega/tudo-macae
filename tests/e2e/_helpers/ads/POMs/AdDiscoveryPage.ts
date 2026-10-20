import { expect } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";

export class AdDiscoveryPage extends BasePage {
  async expectHeadingBelowNavigation() {
    await expect.poll(async () => {
      const heading = await this.adsHeading.boundingBox();
      const navigation = await this.getByRole("banner").boundingBox();
      return heading && navigation ? heading.y - navigation.y - navigation.height : -1;
    }).toBeGreaterThanOrEqual(6);
  }

  get adsSection() { return this.locator("#anuncios"); }
  get adsHeading() { return this.adsSection.getByRole("heading", { level: 2 }); }
  get firstAdLink() { return this.adsSection.locator("a[href^=\"/anuncio/\"]").filter({ visible: true }).first(); }
}
