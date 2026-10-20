import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { createClaimableProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";

test("preferência por Negócios mantém os Anúncios visíveis na Subcategoria", async ({
  page, categoryFixture, adFixture, authentication, adminUserCredentials,
}) => {
  const { category, subcategory } = categoryFixture;
  const { id: businessId } = await createClaimableProfileFixture({
    title: `Negócio ${makeRandomString()}`,
    description: "Negócio local para a composição da categoria.",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: category.id, subcategoryId: subcategory.id }],
    sourceUrl: "https://example.com/category-composition",
  });
  try {
    await authentication.login(adminUserCredentials);
    await page.goto(`/admin/categorias/${category.id}`);
    await pageObject(page).getByLabel("Primeira camada pública").selectOption("businesses");
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }));
    await expect(page).toHaveURL(/\/admin\/categorias$/);

    await page.goto(`/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`);
    const businessHeading = pageObject(page).getByRole("heading", {
      name: `Negócios da subcategoria ${subcategory.name}`,
    });
    const adsHeading = pageObject(page).getByRole("heading", {
      name: `Anúncios de ${subcategory.name}`,
    });
    await expect(businessHeading).toBeVisible();
    await expect(adsHeading).toBeVisible();
    await expect(pageObject(page).getByRole("heading", { name: adFixture.title })).toBeVisible();
    const businessBox = await businessHeading.boundingBox();
    const adsBox = await adsHeading.boundingBox();
    expect(businessBox?.y).toBeLessThan(adsBox?.y ?? 0);
  }
  finally {
    await deleteProfileFixture(businessId);
  }
});
