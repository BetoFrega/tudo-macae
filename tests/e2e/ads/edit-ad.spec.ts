import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures/readonly-category-test";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";
import { createProfileFixture, listProfileFixtures } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { makePng } from "../../_helpers/makePng";

// Note: These tests verify edit permissions - each test gets its own fixture to avoid conflicts
test.describe("Edit Ad Permissions", () => {
  test("a foto pendente pode ser reenviada sem salvar as alterações novamente", async ({
    page,
    userCredentials,
    authentication,
    adFixture,
    editAdPage,
    adDetailsPage,
  }, testInfo) => {
    await authentication.login(userCredentials);
    await page.goto(`/anuncio/${adFixture.id}/${adFixture.slug}`);
    await expect(pageObject(page).getByRole("heading", { name: adFixture.title }).filter({ visible: true })).toBeVisible();
    await adDetailsPage.clickEdit();
    const editedText = `Texto salvo antes da foto ${makeRandomString()}`;
    await editAdPage.fillAdText(editedText);
    await editAdPage.choosePhoto("photo.png", "image/png", makePng(48, 32));
    await expect(editAdPage.photoCounter).toHaveText("1/3");

    let actionCount = 0;
    await page.route(`**/anuncio/${adFixture.id}/editar**`, async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        actionCount += 1;
        if (actionCount === 2) {
          await route.abort("failed");
          return;
        }
        if (actionCount === 5) {
          const body = route.request().postDataBuffer()!.toString("latin1");
          const corrupted = body.replace(/(filename="[^"]*"[^]*?\r\n\r\n)[^]*?(?=\r\n--)/u, "$1not-an-image");
          expect(corrupted).not.toBe(body);
          await route.continue({ postData: Buffer.from(corrupted, "latin1") });
          return;
        }
      }
      await route.continue();
    });

    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }));
    await expect(pageObject(page).getByRole("heading", { name: "Alterações salvas; fotos pendentes" })).toBeVisible();
    await expect(pageObject(page).getByRole("heading", { name: "Alterações salvas; fotos pendentes" })).toBeFocused();
    await expect(pageObject(page).getByRole("status")).toContainText("Uma foto ainda não foi enviada.");
    await expect(pageObject(page).getByRole("status")).toContainText("photo.png");
    await expect(pageObject(page).getByRole("link", { name: "Ver anúncio salvo" })).toHaveAttribute("href", new RegExp(`/anuncio/${adFixture.id}/`));
    await page.screenshot({ path: "/tmp/issue-1402-partial-photo.png", fullPage: true });

    await click(pageObject(page).getByRole("button", { name: "Tentar enviar fotos novamente" }));
    await page.waitForURL(new RegExp(`/anuncio/${adFixture.id}/[^/]+$`));
    await expect(pageObject(page).getByText(editedText).filter({ visible: true })).toBeVisible();
    const recoveredPhoto = pageObject(page).getByRole("img", { name: adFixture.title, exact: true }).filter({ visible: true });
    await expect(recoveredPhoto).toBeVisible();
    await expect(recoveredPhoto).not.toHaveJSProperty("naturalWidth", 0);
    expect(actionCount).toBe(3);

    await test.step("Foto rejeitada explica a causa e permite corrigir no anúncio salvo", async () => {
      await page.goto(`/anuncio/${adFixture.id}/editar`);
      await editAdPage.choosePhoto("rejected.png", "image/png", makePng(48, 32));
      await expect(editAdPage.photoCounter).toHaveText("2/3");
      await click(pageObject(page).getByRole("button", { name: "Salvar Alterações", exact: true }));
      const heading = pageObject(page).getByRole("heading", { name: "Alterações salvas; fotos pendentes", exact: true });
      await expect(heading).toBeFocused();
      await expect(pageObject(page).getByRole("alert").filter({ hasText: "Escolha uma foto válida de até 1MB." })).toBeVisible();
      await expect(pageObject(page).getByRole("button", { name: "Tentar enviar fotos novamente", exact: true })).toHaveCount(0);
      const edit = pageObject(page).getByRole("link", { name: "Editar fotos do anúncio salvo", exact: true });
      await expect(edit).toHaveAttribute("href", `/anuncio/${adFixture.id}/editar`);
      await page.screenshot({ path: testInfo.outputPath("invalid-photo-desktop.png"), fullPage: true });
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
      await expect(editAdPage.photoCounter).toHaveText("1/3");
      await expect(pageObject(page).getByRole("textbox", { name: "Texto do Anúncio", exact: true })).toHaveValue(editedText);
      await editAdPage.choosePhoto("replacement.png", "image/png", makePng(48, 32));
      await expect(editAdPage.photoCounter).toHaveText("2/3");
      await editAdPage.saveChanges();
      await page.waitForURL(new RegExp(`/anuncio/${adFixture.id}/[^/]+$`));
      for (const name of ["Foto 1", "Foto 2"]) {
        const photo = pageObject(page).getByRole("img", { name, exact: true });
        await expect(photo).toBeVisible();
        await expect(photo).not.toHaveJSProperty("naturalWidth", 0);
      }
      expect(actionCount).toBe(7);
    });
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
    const editedText = `Texto ainda não salvo ${makeRandomString()} com detalhes suficientes.`;
    await pageObject(page).getByRole("textbox", { name: "Título do Anúncio" }).fill(editedTitle);
    await pageObject(page).getByRole("textbox", { name: "Texto do Anúncio" }).fill(editedText);
    const photos = pageObject(page).getByRole("group", { name: /Fotos Boas fotos ajudam/ });

    await photos.locator("input#image-upload").setInputFiles({
      name: "foto.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });
    await expect(photos.getByTestId("photo-counter")).toHaveText("1/3");
    let confirmationSeen = false;
    page.once("dialog", (dialog) => {
      confirmationSeen = true;
      return dialog.dismiss();
    });
    await contactLink.focus();
    await page.keyboard.press("Enter");
    expect(confirmationSeen).toBe(true);
    await expect(page).toHaveURL(new RegExp(`${editUrl}$`, "u"));
    await expect(pageObject(page).getByRole("textbox", { name: "Título do Anúncio" })).toHaveValue(editedTitle);
    await expect(pageObject(page).getByRole("textbox", { name: "Texto do Anúncio" })).toHaveValue(editedText);
    await expect(photos.getByTestId("photo-counter")).toHaveText("1/3");

    await click(pageObject(page).getByRole("button", { name: "Remover foto 1" }));
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
