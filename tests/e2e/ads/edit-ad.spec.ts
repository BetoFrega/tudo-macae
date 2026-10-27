import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures/readonly-category-test";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";
import { createProfileFixture, listProfileFixtures } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { makePng } from "../../_helpers/makePng";

// Note: These tests verify edit permissions - each test gets its own fixture to avoid conflicts
test.describe("Edit Ad Permissions", () => {
  // Focused accessibility case: AdFormPartialUploadCard renders only after a photo upload
  // fails, so no happy path shows its "Editar fotos do anúncio salvo" link. The client
  // can only produce a valid photo, so the upload body is corrupted to reach the state.
  // The failure and retry rules are in AdForm.photos.test.tsx and useAdFormLogic.uploads.test.tsx.
  test("o link para corrigir uma foto rejeitada cabe na tela a 200% no celular e recebe o foco", async ({
    page,
    userCredentials,
    authentication,
    adFixture,
    editAdPage,
  }, testInfo) => {
    await authentication.login(userCredentials);
    await page.goto(`/anuncio/${adFixture.id}/editar`);
    const editedText = `Texto salvo antes da foto ${makeRandomString()}`;
    await editAdPage.fillAdText(editedText);
    await editAdPage.choosePhoto("rejected.png", "image/png", makePng(48, 32));
    await expect(editAdPage.photoCounter).toHaveText("1/3");
    let corruptedUploads = 0;
    await page.route(`**/anuncio/${adFixture.id}/editar**`, async (route) => {
      const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
      if (route.request().headers()["next-action"] && body.includes("filename=\"")) {
        corruptedUploads += 1;
        const corrupted = body.replace(/(filename="[^"]*"[^]*?\r\n\r\n)[^]*?(?=\r\n--)/u, "$1not-an-image");
        await route.continue({ postData: Buffer.from(corrupted, "latin1") });
        return;
      }
      await route.continue();
    });

    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações", exact: true }));
    await expect(pageObject(page).getByRole("heading", { name: "Alterações salvas; fotos pendentes", exact: true })).toBeFocused();
    await expect(pageObject(page).getByRole("alert").filter({ hasText: "Escolha uma foto válida de até 1MB." })).toBeVisible();
    const edit = pageObject(page).getByRole("link", { name: "Editar fotos do anúncio salvo", exact: true });
    await expect(edit).toHaveAttribute("href", `/anuncio/${adFixture.id}/editar`);
    expect(corruptedUploads).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(edit).toBeVisible();
    expect(await edit.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("invalid-photo-mobile-zoom.png"), fullPage: true });
    await page.keyboard.press("Tab");
    await expect(edit).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editAdPage.photoCounter).toHaveText("0/3");
    await expect(pageObject(page).getByRole("textbox", { name: "Texto do Anúncio", exact: true })).toHaveValue(editedText);
  });

  test("perfil único mostra contato e correção retorna ao mesmo anúncio no celular", async ({
    page, userCredentials, authentication, adFixture,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const profiles = await listProfileFixtures(userCredentials);
    for (const profile of profiles) {
      if (profile.id !== adFixture.advertiserProfileId) await deleteProfileFixture(profile.id);
    }
    await authentication.login(userCredentials);
    const editUrl = `/anuncio/${adFixture.id}/editar`;
    await page.goto(editUrl);
    await expect(pageObject(page).getByText("Contato exibido no anúncio", { exact: true })).toBeVisible();
    await expect(pageObject(page).getByRole("combobox", { name: "Perfil do Anunciante" })).toHaveCount(0);
    const contactLink = pageObject(page).getByRole("link", { name: "Corrigir contato do anunciante" });
    await expect(contactLink).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("single-profile-ad-contact-mobile.png"), fullPage: true });

    const editedTitle = `Anúncio revisado ${makeRandomString()}`;
    const editedText = `Texto revisado ${makeRandomString()} com detalhes suficientes.`;
    await pageObject(page).getByRole("textbox", { name: "Título do Anúncio" }).fill(editedTitle);
    await pageObject(page).getByRole("textbox", { name: "Texto do Anúncio" }).fill(editedText);
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }));
    await expect(page).not.toHaveURL(new RegExp(`${editUrl}$`, "u"));
    await expect(pageObject(page).getByRole("heading", { name: editedTitle }).filter({ visible: true })).toBeVisible();
    await page.goto(editUrl);
    await contactLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/minha-conta/perfis/[^/]+/editar\\?returnTo=%2Fanuncio%2F${adFixture.id}%2Feditar$`, "u"));
    const phone = pageObject(page).getByRole("textbox", { name: "Número de contato 1" });
    await phone.fill("22888887777");
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }));
    await expect(page).toHaveURL(new RegExp(`${editUrl}$`, "u"));
    await expect(pageObject(page).getByText("(22) 88888-7777")).toBeVisible();
    await expect(pageObject(page).getByRole("textbox", { name: "Título do Anúncio" })).toHaveValue(editedTitle);
    await expect(pageObject(page).getByRole("textbox", { name: "Texto do Anúncio" })).toHaveValue(editedText);
    await page.screenshot({ path: testInfo.outputPath("updated-ad-contact-mobile.png"), fullPage: true });
  });

  test("Não-proprietário não vê controles de edição/exclusão e acesso direto é bloqueado", async ({
    page,
    anotherUserCredentials,
    authentication,
    adFixture,
  }) => {
    const adUrl = `/anuncio/${adFixture.id}/${adFixture.slug}`;

    await authentication.login(anotherUserCredentials);
    await expect(
      pageObject(page).getByRole("button", { name: "Minha conta" }).filter({ visible: true }),
    ).toBeVisible();

    await page.goto(adUrl);
    await expect(
      pageObject(page).getByRole("heading", { name: adFixture.title })
        .filter({ visible: true }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      pageObject(page).getByRole("link", { name: "Editar Anúncio" }).filter({ visible: true }),
    ).not.toBeVisible();

    await expect(
      pageObject(page).getByRole("button", { name: "Excluir" }).filter({ visible: true }),
    ).not.toBeVisible();

    // Also verify direct URL access is blocked - should redirect away from edit
    await page.goto(`/anuncio/${adFixture.id}/editar`);
    await expect(page).not.toHaveURL(/.*\/editar/);
  });

  test("Admin vê exclusão e pode editar anúncio de outro usuário", async ({
    page,
    userCredentials,
    adminUserCredentials,
    authentication,
    editAdPage,
    adFixture,
  }) => {
    const alternateProfileTitle = `Perfil alternativo ${makeRandomString()}`;
    const alternateProfileId = await createProfileFixture(userCredentials, {
      title: alternateProfileTitle,
      description: "Perfil alternativo para edição administrativa.",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
    });
    try {
      const adUrl = `/anuncio/${adFixture.id}/${adFixture.slug}`;

      await authentication.login(adminUserCredentials);
      await page.goto(adUrl);
      await expect(
        pageObject(page).getByRole("heading", { name: adFixture.title })
          .filter({ visible: true }),
      ).toBeVisible({ timeout: 10000 });

      await expect(pageObject(page).getByRole("button", { name: "Excluir" }).filter({ visible: true })).toBeVisible();

      await click(pageObject(page).getByRole("link", { name: "Editar Anúncio" }).filter({ visible: true }));

      await click(pageObject(page).getByRole("combobox", { name: "Perfil do Anunciante" }).filter({ visible: true }));
      await expect(pageObject(page).getByRole("option", { name: alternateProfileTitle }).filter({ visible: true })).toBeVisible();
      await expect(pageObject(page).getByRole("link", { name: "Administrar perfis" }).filter({ visible: true })).not.toBeVisible();
      await click(pageObject(page).getByRole("option", { name: alternateProfileTitle }).filter({ visible: true }));
      await expect(pageObject(page).getByText("Contato exibido no anúncio", { exact: true })).toBeVisible();
      await expect(pageObject(page).getByText("(22) 99999-9999 (WhatsApp)", { exact: true })).toBeVisible();

      const adminEditedText = `Editado por Admin - ${makeRandomString()}`;
      await editAdPage.fillAdText(adminEditedText);
      await editAdPage.saveChanges();

      await expect(pageObject(page).getByText(adminEditedText).filter({ visible: true })).toBeVisible();
      await expect(pageObject(page).getByText(alternateProfileTitle).filter({ visible: true })).toBeVisible();
    }
    finally {
      await deleteProfileFixture(alternateProfileId);
    }
  });
});
