import { expect, type Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";
import type { UserSidebar } from "../../fixtures/POMs/UserSidebar";

export class MyAdsPage extends BasePage {
  userSidebar: UserSidebar;
  constructor(page: Page, userSidebar: UserSidebar) {
    super(page);
    this.userSidebar = userSidebar;
  }

  async goto(): Promise<void> {
    await this.userSidebar.open();
    await this.userSidebar.clickMyAds();
  }

  card(title: string) {
    return this.getByTestId("user-ad-card").filter({ hasText: title });
  }

  async editAd(adText: string): Promise<void> {
    const card = this.card(adText);
    const openMenuButton = card.getByRole("button", { name: "Abrir menu" });
    await this.click(openMenuButton);
    await this.click(this.getByRole("menuitem", { name: `Editar` }));
  }

  async activateAd(title: string) {
    const card = this.card(title);
    await this.click(card.getByRole("button", { name: "Abrir menu" }));
    await this.click(this.getByRole("menuitem", { name: "Ativar", exact: true }));
    await expect(card.getByText("Ativo", { exact: true })).toBeVisible();
  }

  async pauseAd(title: string) {
    const card = this.card(title);
    await this.click(card.getByRole("button", { name: "Abrir menu" }));
    await this.click(this.getByRole("menuitem", { name: "Pausar", exact: true }));
    await expect(card.getByText("Pausado", { exact: true })).toBeVisible();
  }
}
