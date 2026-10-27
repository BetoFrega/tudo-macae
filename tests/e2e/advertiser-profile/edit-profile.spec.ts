import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { formatPhoneNumber } from "@/lib/formatters";
import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { StoreCategoriesPage } from "../_helpers/categories/POMs/StoreCategoriesPage";
import { playwrightTarget } from "../../../bin/playwrightTarget";
import { CANONICAL_APP_ORIGIN } from "../../../bin/appOrigin";
import { expect, test } from "../_helpers/fixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { makePng } from "../../_helpers/makePng";

test.describe("Edit Advertiser Profile", () => {
  test("classifies an untyped profile and creates a personal profile in D1", async ({
    page, userCredentials, authentication, profilePage, adProfileFixture,
  }) => {
    await authentication.login(userCredentials);
    await test.step("an existing untyped profile becomes a business without changing its fields", async () => {
      await page.goto(`/minha-conta/perfis/${adProfileFixture.id}/editar`);
      await profilePage.classifyAs("Um negócio");
      await expect(profilePage.identityTypeSection.getByText("Um negócio", { exact: true })).toBeVisible();
      await page.reload();
      await expect(profilePage.identityTypeSection.getByText("Um negócio", { exact: true })).toBeVisible();
      await expect(profilePage.identityTypeSection.getByRole("button", { name: "Definir tipo", exact: true })).toHaveCount(0);
      await expect(profilePage.titleInput).toHaveValue(adProfileFixture.title);
    });
    await test.step("creation accepts a personal profile", async () => {
      await page.goto("/minha-conta/perfis/novo");
      await profilePage.fillProfileTitle(`Pessoal ${makeRandomString()}`);
      await profilePage.contactAt(0).fill("22999999992");
      await profilePage.identityTypeChoice("Meu perfil pessoal").check();
      await profilePage.submit();
      await expect(page).toHaveURL(/\/minha-conta\/perfis$/);
    });
  });

  test("should edit an existing advertiser profile", async ({
    page, browser, userCredentials, authentication, profilePage, adProfileFixture,
  }) => {
    await authentication.login(userCredentials);
    await profilePage.gotoProfiles();
    await profilePage.edit(adProfileFixture.id);
    await expect(profilePage.editHeading).toBeVisible();
    await expect(profilePage.titleInput).toHaveValue(adProfileFixture.title);
    await expect(profilePage.descriptionInput).toHaveValue(adProfileFixture.description);
    await expect(profilePage.contactAt(0)).toHaveValue(formatPhoneNumber(adProfileFixture.contacts![0].number!));
    await expect(profilePage.contactAt(1)).toHaveValue(formatPhoneNumber(adProfileFixture.contacts![1].number!));

    const newTitle = "Perfil Atualizado - " + makeRandomString();
    const newDescription = "Descrição Atualizada - " + makeRandomString();
    await profilePage.titleInput.fill(newTitle);
    await profilePage.descriptionInput.fill(newDescription);
    await click(profilePage.removeContactAt(0));
    await click(profilePage.lastRemoveContactButton);
    await profilePage.addContact();
    const newPhone = "22999999991";
    await profilePage.lastContact.fill(newPhone);
    await profilePage.whatsappCheckboxes.check();
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- File inputs are hidden; setInputFiles needs the underlying input.
    await page.locator("input[type=\"file\"]").setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: makePng(48, 32) });
    await profilePage.save();
    await expect(page).toHaveURL(/\/minha-conta\/perfis$/);
    await expect(pageObject(page).getByRole("heading", { name: newTitle, exact: true }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByText(newDescription, { exact: true }).filter({ visible: true })).toBeVisible();
    const businessCard = pageObject(page).getByRole("article", { name: newTitle });
    const photo = businessCard.getByRole("img", { name: newTitle, exact: true });
    await expect(photo).toBeVisible();
    await expect(photo).not.toHaveJSProperty("naturalWidth", 0);
    const src = await photo.getAttribute("src");
    expect(src).toContain("/api/classifieds/photos/public/");
    const visitor = await browser.newContext({ baseURL: playwrightTarget().origin });
    try {
      const response = await visitor.request.get(src!, { headers: { accept: "image/webp" } });
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/webp");
      expect((await response.body()).byteLength).toBeGreaterThan(0);
      const jpeg = new URL(src!, playwrightTarget().origin);
      const fallback = await visitor.request.get(jpeg.toString(), { headers: { accept: "image/jpeg" } });
      expect(fallback.status()).toBe(200);
      expect(fallback.headers()["content-type"]).toBe("image/jpeg");
    }
    finally { await visitor.close(); }
    await page.goto(`/negocio/${adProfileFixture.id}/${slugify(newTitle)}`);
    const publicPhoto = pageObject(page).getByRole("img", { name: newTitle, exact: true });
    await expect(publicPhoto).toBeVisible();
    await expect(publicPhoto).not.toHaveJSProperty("naturalWidth", 0);
  });

  test("um visitante encontra o negócio sem Anúncios, abre o cartão completo e observa o estado vazio após remover a associação", async ({
    page, browser, userCredentials, authentication, profilePage, adProfileFixture, categoryFixture,
  }) => {
    const noContactTitle = `Sem contato ${makeRandomString()}`;
    await createProfileFixture(userCredentials, {
      title: noContactTitle, description: "", contacts: [],
      activityAreas: [{ categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id }],
    });
    await authentication.login(userCredentials);
    await profilePage.gotoProfiles();
    const noContactCard = pageObject(page).getByRole("article", { name: noContactTitle });
    await expect(noContactCard.getByText("Para aparecer no catálogo, falta: contato.", { exact: true })).toBeVisible();
    await expect(noContactCard.getByRole("link", { name: "Completar cadastro" })).toBeVisible();
    await expect(noContactCard.getByRole("link", { name: "Ver negócio" })).toHaveCount(0);
    await profilePage.edit(adProfileFixture.id);
    await profilePage.activityAreas.remove();
    await profilePage.activityAreas.add(categoryFixture.category.id, categoryFixture.subcategory.id);
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- File inputs are intentionally hidden and setInputFiles supports them directly.
    await page.locator("input[type=\"file\"]").setInputFiles({
      name: "avatar.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });
    await profilePage.save();
    await expect(page).toHaveURL(/\/minha-conta\/perfis$/);

    const visitorContext = await browser.newContext({ baseURL: playwrightTarget().origin });
    try {
      const visitor = await visitorContext.newPage();
      const categories = new StoreCategoriesPage(visitor);
      const visit = () => categories.gotoSubcategory(categoryFixture.category.id, categoryFixture.category.slug, categoryFixture.subcategory.id, categoryFixture.subcategory.slug);
      await visit();
      const businesses = categories.businesses(categoryFixture.subcategory.name);
      await expect(businesses).toBeVisible();
      await expect(categories.businessCards(categoryFixture.subcategory.name)).toHaveCount(1);
      await expect(businesses.getByRole("link", { name: noContactTitle, exact: true })).toHaveCount(0);
      await expect(categories.businessHeading(categoryFixture.subcategory.name)).toBeVisible();
      const emptyAds = pageObject(visitor).getByRole("region", {
        name: `Quer anunciar em ${categoryFixture.subcategory.name}?`,
        exact: true,
      }).filter({ visible: true });
      await expect(emptyAds).toBeVisible();
      expect((await businesses.boundingBox())!.y).toBeLessThan((await emptyAds.boundingBox())!.y);
      const card = categories.businessCard(categoryFixture.subcategory.name, adProfileFixture.title);
      await expect(card.getByRole("img", { name: adProfileFixture.title, exact: true })).toBeVisible();
      await expect(card.getByText(adProfileFixture.description!, { exact: true })).toBeVisible();
      const whatsappLink = card.getByRole("link", {
        name: `WhatsApp ${formatPhoneNumber("22999999999")}`,
        exact: true,
      });
      const whatsappUrl = new URL((await whatsappLink.getAttribute("href"))!);
      expect(whatsappUrl.origin + whatsappUrl.pathname).toBe(
        "https://wa.me/5522999999999",
      );
      expect(whatsappUrl.searchParams.get("text")).toBe(
        `Olá! Encontrei seu telefone no Tudo Macaé: ${CANONICAL_APP_ORIGIN}/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}`,
      );
      await expect(card.getByRole("link", { name: formatPhoneNumber("22999999990"), exact: true })).toHaveAttribute("href", "tel:22999999990");
      await click(card.getByRole("link", { name: adProfileFixture.title, exact: true }));
      await expect(visitor).toHaveURL(new RegExp(`/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}$`));

      await profilePage.edit(adProfileFixture.id);
      await profilePage.activityAreas.remove();
      await profilePage.save();
      await expect(page).toHaveURL(/\/minha-conta\/perfis$/);
      await visit();
      await expect(businesses).toBeVisible();
      await expect(categories.businessCards(categoryFixture.subcategory.name)).toHaveCount(0);
      await expect(categories.businessHeading(categoryFixture.subcategory.name)).toBeVisible();
      await expect(
        businesses.getByText(
          "Ainda não há negócios publicados nesta subcategoria.",
          { exact: true },
        ),
      ).toBeVisible();
    }
    finally {
      await visitorContext.close();
    }
  });

  test("limita a seis cartões depois dos Anúncios", async ({
    page, userCredentials, categoryFixture, storeCategoriesPage, adFixture, authentication, profilePage,
  }) => {
    const area = { categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id };
    const title = `Negócio elegível ${makeRandomString()}`;
    const ids = await Promise.all(
      Array.from({ length: 7 }, (_, index) => createProfileFixture(userCredentials, {
        title: `${title} ${index}`, description: "Atuação declarada",
        contacts: [{ number: "22999999999", isWhatsapp: false }], activityAreas: [area],
      })),
    );
    await authentication.login(userCredentials);
    await profilePage.gotoProfiles();
    await profilePage.edit(ids[0]);
    await profilePage.save();
    await expect(page).toHaveURL(/\/minha-conta\/perfis$/);
    await storeCategoriesPage.gotoSubcategory(area.categoryId, categoryFixture.category.slug, area.subcategoryId, categoryFixture.subcategory.slug);
    await expect(pageObject(page).getByRole("heading", {
      name: `Anúncios de ${categoryFixture.subcategory.name}`,
      exact: true,
    })).toBeVisible();
    const businesses = storeCategoriesPage.businesses(categoryFixture.subcategory.name);
    await expect(storeCategoriesPage.businessHeading(categoryFixture.subcategory.name)).toBeVisible();
    await expect(storeCategoriesPage.businessCards(categoryFixture.subcategory.name)).toHaveCount(6);
    await expect(businesses.getByRole("heading", { name: new RegExp(`^${title}`) })).not.toHaveCount(0);
    const adCard = pageObject(page).locator("[data-slot=\"card\"]").filter({ visible: true }).filter({ has: pageObject(page).getByRole("heading", { name: adFixture.title, exact: true }).filter({ visible: true }) });
    await expect(adCard).toBeVisible();
    expect((await businesses.boundingBox())!.y).toBeGreaterThanOrEqual((await adCard.boundingBox())!.y + (await adCard.boundingBox())!.height);
  });
});
