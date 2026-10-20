import { playwrightTarget } from "../../../bin/playwrightTarget";
import { expect, test } from "../_helpers/fixtures";

test.describe("Ad Page - Business Info", () => {
  test("should display business info on ad page", async ({
    adFixture,
    adProfileFixture,
    adDetailsPage,
  }) => {
    await adDetailsPage.gotoAd(adFixture.id, adFixture.slug);
    const businessSection = adDetailsPage.businessInfoSection;
    await expect(businessSection).toBeVisible();
    await expect(businessSection).toContainText(adProfileFixture.description);
    await expect(adDetailsPage.businessInfoSectionHeader).toHaveText(
      adProfileFixture.title,
    );

    await test.step("Metadados usam a origem canônica", async () => {
      const expectedUrl = `${playwrightTarget().canonicalOrigin}/anuncio/${adFixture.id}/${adFixture.slug}`;

      await expect(adDetailsPage.page.locator("link[rel=\"canonical\"]")).toHaveAttribute(
        "href",
        expectedUrl,
      );
      await expect(adDetailsPage.page.locator("meta[property=\"og:url\"]")).toHaveAttribute(
        "content",
        expectedUrl,
      );
    });
  });
});
