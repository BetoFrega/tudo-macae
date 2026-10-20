import { readFileSync } from "node:fs";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";
import { createAdThroughApp } from "../_helpers/ads/createAdThroughApp";
import { readProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteAdFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import {
  circularImageScreenshot,
  type AvatarJourneyPhaseDiagnostic,
} from "../_helpers/advertiser-profile/avatar/avatarEvidence";
import {
  assertAndAttachVariantDelivery,
  inspectAvatarConsumersAtDpr,
  inspectLegacyAdvertiserHeaders,
  type AvatarDeliveryJourney,
} from "../_helpers/advertiser-profile/avatar/visitorDelivery";

test.describe("Business Profile Photo Upload", () => {
  let failedJourneyPhase: AvatarJourneyPhaseDiagnostic | null = null;

  test.afterEach(async ({}, testInfo) => {
    const diagnostic = failedJourneyPhase;
    failedJourneyPhase = null;
    if (!diagnostic || testInfo.status === testInfo.expectedStatus) return;

    await testInfo.attach("avatar-journey-phase.json", {
      body: JSON.stringify(diagnostic, null, 2),
      contentType: "application/json",
    }).catch(() => undefined);
  });

  test("Jornada: Upload de foto em Negócio", async ({
    page,
    browser,
    authentication,
    userCredentials,
    profilePage,
    categoryFixture,
  }) => {
    const phaseDiagnostic: AvatarJourneyPhaseDiagnostic = {
      phase: "profile-setup",
      optimizerFailed: false,
      directRequested: false,
      readyState: "unknown",
      requests: { optimizer: 0, matchingOptimizer: 0, directImage: 0 },
    };
    failedJourneyPhase = phaseDiagnostic;
    const profileName = `Perfil com Foto - ${makeRandomString()}`;
    let businessHref: string | null = null;
    const form = pageObject(page).locator("form").filter({ visible: true });
    const buffer = readFileSync(new URL("../fixtures/profile-photo-gradient-256.png", import.meta.url));

    await test.step("Login e acessar página de novo perfil", async () => {
      await authentication.login(userCredentials);
      await page.goto("/minha-conta/perfis/novo");
    });

    await test.step("Verificar preview quando imagem é selecionada", async () => {
      await expect(
        form.getByRole("button", { name: "Adicionar Foto", exact: true }),
      ).toBeVisible();
      await expect(
        form.getByText("JPEG, PNG, WebP ou GIF. Máximo 20MB.", { exact: true }),
      ).toBeVisible();

      const fileInput = form.locator("input[type=\"file\"]");
      await fileInput.setInputFiles({
        name: "test-image.png",
        mimeType: "image/png",
        buffer: buffer,
      });

      await expect(
        form.getByRole("button", { name: "Trocar Foto", exact: true }),
      ).toBeVisible();
      await expect(
        form.getByRole("button", { name: "Remover", exact: true }),
      ).toBeVisible();

      if (!process.env.CI) {
        await expect(
          pageObject(page).getByRole("img", { name: "Foto do perfil" }).filter({ visible: true }),
        ).toHaveScreenshot(["profile-photo-upload-preview.png"], circularImageScreenshot);
      }
    });

    await test.step("Criar perfil com foto", async () => {
      await form.getByLabel("Título do Perfil").fill(profileName);
      await form
        .getByLabel("Descrição (Opcional)")
        .fill("Perfil de teste com foto");
      await profilePage.addContact();
      await profilePage.lastContact.fill("22999999999");
      await profilePage.activityAreas.add(
        categoryFixture.category.id,
        categoryFixture.subcategory.id,
      );
      await form.getByRole("radio", { name: "Um negócio", exact: true }).check();

      await click(form.getByRole("button", { name: "Criar Perfil" }));

      await expect(page).toHaveURL(/.*\/minha-conta\/perfis$/);
      await expect(
        pageObject(page).getByRole("heading", { name: profileName, exact: true }).filter({ visible: true }),
      ).toBeVisible();
      businessHref = await pageObject(page)
        .getByRole("article", { name: profileName })
        .getByRole("link", { name: "Ver negócio" })
        .getAttribute("href");
      if (!businessHref) throw new Error("O perfil criado precisa ter um link público para a jornada da foto.");

      if (!process.env.CI) {
        await expect(
          pageObject(page).getByRole("img", { name: profileName }).filter({ visible: true }),
        ).toHaveScreenshot(["my-account-profiles.png"], circularImageScreenshot);
      }
    });

    await test.step("Verificar foto na página do negócio", async () => {
      const profileCard = pageObject(page).getByRole("article", { name: profileName });
      await click(profileCard.getByRole("link", { name: "Ver negócio" }));
      await expect(page).toHaveURL(/\/negocio\/[^/]+\/[^/]+$/);

      const publicAvatar = pageObject(page)
        .getByRole("img", { name: profileName })
        .filter({ visible: true });
      await expect(publicAvatar).toBeVisible();
      await expect(publicAvatar).not.toHaveJSProperty("naturalWidth", 0);
      expect(await publicAvatar.getAttribute("src")).not.toContain("/_fah/");

      if (!process.env.CI) {
        await expect(publicAvatar).toHaveScreenshot(
          ["anunciante-profile-page.png"],
          circularImageScreenshot,
        );
      }
    });

    await test.step("O catálogo público entrega a foto sem o loader global", async () => {
      await page.goto(`/negocios?categoria=${categoryFixture.category.id}&subcategoria=${categoryFixture.subcategory.id}`);
      const catalogAvatar = pageObject(page).getByRole("img", { name: profileName }).filter({ visible: true });
      await catalogAvatar.scrollIntoViewIfNeeded();
      await expect(catalogAvatar).toBeVisible();
      await expect(catalogAvatar).not.toHaveJSProperty("naturalWidth", 0);
      expect(await catalogAvatar.getAttribute("src")).not.toContain("/_fah/");
    });

    if (!businessHref) throw new Error("O perfil criado precisa ter um link público para a jornada da foto.");
    const profileId = new URL(businessHref, page.url()).pathname.split("/")[2];
    if (!profileId) throw new Error("Não foi possível obter o ID do perfil criado.");
    const profile = await readProfileFixture(userCredentials, profileId);
    if (!profile?.photoURL) throw new Error("O perfil criado precisa manter a foto pública do upload.");

    const ad = await createAdThroughApp(
      browser,
      userCredentials,
      categoryFixture,
      profile,
      { title: `Anúncio com foto - ${makeRandomString()}`, text: "Anúncio da jornada com foto pública." },
      true,
    );

    const publicBusinessPath = new URL(businessHref, page.url()).pathname;
    const publicAdPath = `/anuncio/${ad.id}/${ad.slug}`;
    const catalogPath = `/negocios?categoria=${categoryFixture.category.id}&subcategoria=${categoryFixture.subcategory.id}`;
    const activityAreaPath = `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`;
    const journey: AvatarDeliveryJourney = {
      phaseDiagnostic,
      evidence: [],
      visualCaptures: [],
      visitorContexts: [],
    };
    const paths = { catalogPath, activityAreaPath, publicBusinessPath, publicAdPath };

    try {
      for (const dpr of [1, 2]) {
        await inspectAvatarConsumersAtDpr({ browser, page, dpr, profileName, paths, journey });
      }

      await profilePage.gotoProfiles();
      await profilePage.editProfileNamed(profileName);
      await profilePage.activityAreas.remove();
      await profilePage.save();
      await expect(page).toHaveURL(/\/minha-conta\/perfis$/);

      await inspectLegacyAdvertiserHeaders({ profileId, profileName, journey });
      await assertAndAttachVariantDelivery(journey);
    }
    finally {
      await Promise.all(journey.visitorContexts.map(({ context }) => context.close()));
      await deleteAdFixture(ad.id);
    }

    await test.step("Atualizar foto em perfil existente", async () => {
      await page.goto("/minha-conta/perfis");
      const incompleteProfile = pageObject(page).getByRole("article", {
        name: profileName,
        exact: true,
      });
      await click(
        incompleteProfile.getByRole("link", {
          name: `Completar cadastro: ${profileName}`,
          exact: true,
        }),
      );
      await expect(page).toHaveURL(/\/minha-conta\/perfis\/[^/]+\/editar$/);

      const fileInput = form.locator("input[type=\"file\"]");
      await fileInput.setInputFiles({
        name: "updated-photo.png",
        mimeType: "image/png",
        buffer: buffer,
      });

      const updatedProfileName = `Perfil - ${makeRandomString()}`;
      await form.getByLabel("Título do Perfil").fill(updatedProfileName);
      await click(form.getByRole("button", { name: "Salvar Alterações" }));

      await expect(page).toHaveURL(/.*\/minha-conta\/perfis$/);

      if (!process.env.CI) {
        await expect(
          pageObject(page).getByRole("img", { name: updatedProfileName }).filter({ visible: true }),
        ).toHaveScreenshot(["updated-profile-photo-on-edit.png"], circularImageScreenshot);
      }
    });
  });
});
