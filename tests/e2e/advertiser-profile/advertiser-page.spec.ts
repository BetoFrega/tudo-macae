import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";
import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { slugify } from "@tudomacae/text-normalization/slugify";

test.describe("Advertiser Profile Page", () => {
  test("Exibição de perfil com anúncios e 404 para inexistente", async ({
    page,
    userCredentials,
    authentication,
    adProfileFixture,
    adFixture,
  }) => {
    await test.step("Acessar perfil de anunciante com anúncios", async () => {
      await authentication.login(userCredentials);
      await page.goto(`/anunciante/${adProfileFixture.id}`);
      await expect(page).toHaveURL(
        new RegExp(`/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}$`),
      );
      await expect(
        pageObject(page).getByRole("heading", { name: adProfileFixture.title }).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        pageObject(page).getByRole("heading", { name: adFixture.title })
          .filter({ visible: true }),
      ).toBeVisible();
    });

    await test.step("Verificar 404 para perfil inexistente", async () => {
      await page.goto("/anunciante/non-existent-profile-id");
      await expect(
        pageObject(page).getByRole("heading", { name: "404" }).filter({ visible: true })
          .or(pageObject(page).getByText("Perfil não encontrado").filter({ visible: true })),
      ).toBeVisible();
    });
  });

  test("Negócio sem anúncios não exibe um painel vazio de Classificados", async ({
    page,
    userCredentials,
    authentication,
    categoryFixture,
  }) => {
    const title = `Loja Navegação ${makeRandomString()}`;
    const profileId = await createProfileFixture(userCredentials, {
      title,
      description: "Negócio local sem anúncio publicado.",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{
        categoryId: categoryFixture.category.id,
        subcategoryId: categoryFixture.subcategory.id,
      }],
    });
    try {
      await authentication.login(userCredentials);
      await page.goto(`/negocio/${profileId}/${slugify(title)}`);
      await expect(pageObject(page).getByRole("heading", { name: title }).filter({ visible: true })).toBeVisible();
      await expect(pageObject(page).getByRole("heading", { name: /Anúncios deste negócio/u })).toHaveCount(0);
      await expect(pageObject(page).getByText("Sem anúncios publicados agora")).toBeVisible();
      await expect(pageObject(page).getByRole("link", {
        name: `${categoryFixture.category.name}: ${categoryFixture.subcategory.name}`,
        exact: true,
      })).toBeVisible();

      await click(pageObject(page).getByRole("link", { name: "Voltar para Negócios" }).filter({ visible: true }));
      await expect(page).toHaveURL(/\/negocios$/u);
    }
    finally {
      await deleteProfileFixture(profileId);
    }
  });

  test("mantém a leitura legada de perfil coerente fora do catálogo", async ({
    page,
    userCredentials,
    authentication,
  }) => {
    const title = `Perfil legado ${makeRandomString()}`;
    const profileId = await createProfileFixture(userCredentials, {
      title,
      description: "Perfil ainda sem área de atuação ativa.",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
    });
    try {
      await authentication.login(userCredentials);
      await page.goto(`/anunciante/${profileId}`);
      await expect(page).toHaveURL(new RegExp(`/anunciante/${profileId}$`));
      await expect(pageObject(page).getByRole("heading", { name: title }).filter({ visible: true })).toBeVisible();
    }
    finally {
      await deleteProfileFixture(profileId);
    }
  });
});
