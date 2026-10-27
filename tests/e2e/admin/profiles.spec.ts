import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";

test.describe("Admin Advertiser Profiles", () => {
  test("Jornada: cadastrar informações públicas sem assumir a titularidade", async ({
    adminUserCredentials,
    authentication,
    adminProfilesPage,
    categoryFixture,
    storeCategoriesPage,
    page,
  }) => {
    const profileName = `Negócio público ${makeRandomString()}`;

    await authentication.login(adminUserCredentials);
    await adminProfilesPage.goto();
    await click(adminProfilesPage.createClaimableLink);
    await expect(adminProfilesPage.createPageHeading).toBeVisible();

    await adminProfilesPage.titleInput.fill(profileName);
    await adminProfilesPage.descriptionInput.fill("Informações de atendimento em Macaé.");
    await click(adminProfilesPage.addContactButton);
    await adminProfilesPage.contactInput.fill("22999999999");
    await adminProfilesPage.activityAreas.add(
      categoryFixture.category.id,
      categoryFixture.subcategory.id,
    );
    await adminProfilesPage.sourceInput.fill("https://example.com/negocio-publico");
    await click(adminProfilesPage.createButton);

    await expect(adminProfilesPage.heading).toBeVisible();
    const row = adminProfilesPage.getClaimableRow(profileName);
    await expect(row.getByText("Reivindicável", { exact: true })).toBeVisible();
    const editHref = await row.getByRole("link", { name: "Editar", exact: true }).getAttribute("href");
    expect(editHref).toMatch(/^\/admin\/perfis\//);
    const profileId = editHref!.split("/").at(-1)!;

    await page.goto(`/anunciante/${profileId}`);
    await expect(
      pageObject(page).getByText("Informações públicas", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();

    await page.goto(`/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`);
    const businessRegion = storeCategoriesPage.businesses(categoryFixture.subcategory.name);
    await expect(businessRegion.getByText(profileName, { exact: true })).toBeVisible();
    await expect(businessRegion.getByText("Informações públicas", { exact: true })).toBeVisible();

    await adminProfilesPage.goto();
    await click(adminProfilesPage.getClaimableRow(profileName).getByRole("link", { name: "Editar", exact: true }));
    await click(adminProfilesPage.deleteButton);
    const deletion = pageObject(page).getByRole("dialog").filter({ visible: true });
    await deletion.getByLabel("Motivo da exclusão").fill("Cadastro duplicado");
    await deletion.getByLabel("Digite o nome do perfil para confirmar").fill(profileName);
    await click(deletion.getByRole("button", { name: "Confirmar exclusão", exact: true }));
    await expect(adminProfilesPage.heading).toBeVisible();
    await expect(adminProfilesPage.getClaimableRow(profileName)).toBeHidden();
  });

  test("Jornada: Visualização e gerenciamento de perfis de anunciantes", async ({
    adminUserCredentials,
    authentication,
    userSidebar,
    adminDashboardPage,
    adminCategoriesPage,
    adminProfilesPage,
    adProfileFixture,
    adFixture,
    categoryFixture,
    storeCategoriesPage,
    page,
  }, testInfo) => {
    const updatedTitle = `Admin Updated - ${makeRandomString()}`;
    await test.step("Acessar página de perfis via dashboard card", async () => {
      await authentication.login(adminUserCredentials);
      await userSidebar.open();
      await userSidebar.clickAdminPanel();
      await adminDashboardPage.clickViewProfiles();
      await expect(adminProfilesPage.heading).toBeVisible();
    });

    await test.step("Aquecer a vitrine inicial com o anúncio associado", async () => {
      await page.goto("/");
      await expect(pageObject(page).getByText(adFixture.title, { exact: true }).filter({ visible: true })).toBeVisible();
      await adminProfilesPage.goto();
    });

    await test.step("Verificar cabeçalhos da tabela de perfis", async () => {
      await expect.soft(adminProfilesPage.titleColumnHeader).toBeVisible();
      await expect
        .soft(adminProfilesPage.descriptionColumnHeader)
        .toBeVisible();
      await expect.soft(adminProfilesPage.createdAtColumnHeader).toBeVisible();
      await expect.soft(adminProfilesPage.lastUpdateColumnHeader).toBeVisible();
      await expect.soft(adminProfilesPage.actionsColumnHeader).toBeVisible();
    });

    await test.step("Verificar link de navegação na sidebar admin", async () => {
      await page.goto("/admin");
      await expect(
        pageObject(page).getByRole("link", { name: "Perfis de Anunciantes", exact: true }).filter({ visible: true }),
      ).toBeVisible();
    });

    await test.step("Editar perfil de anunciante", async () => {
      await adminProfilesPage.goto();
      await click(adminProfilesPage.getEditButton(adProfileFixture.title));
      await expect(adminProfilesPage.editPageHeading).toBeVisible();

      await adminProfilesPage.titleInput.clear();
      await adminProfilesPage.titleInput.fill(updatedTitle);
      await adminProfilesPage.descriptionInput.fill(
        "Description updated by admin",
      );
      await click(adminProfilesPage.saveButton);

      await expect(adminProfilesPage.heading).toBeVisible();
      await expect(adminProfilesPage.getProfileRow(updatedTitle)).toBeVisible();

      await click(adminProfilesPage.getEditButton(updatedTitle));
      await expect(adminProfilesPage.descriptionInput).toHaveValue(
        "Description updated by admin",
      );
      await adminProfilesPage.descriptionInput.clear();
      await click(adminProfilesPage.saveButton);
      await expect(adminProfilesPage.heading).toBeVisible();
      await click(adminProfilesPage.getEditButton(updatedTitle));
      await expect(adminProfilesPage.descriptionInput).toHaveValue("");

      await adminProfilesPage.activityAreas.remove();
      await adminProfilesPage.activityAreas.add(categoryFixture.category.id, categoryFixture.subcategory.id);
      await click(adminProfilesPage.saveButton);
      await expect(adminProfilesPage.heading).toBeVisible();
      await click(adminProfilesPage.getEditButton(updatedTitle));
      await expect(
        adminProfilesPage.activityAreas.selection(categoryFixture.category.name, categoryFixture.subcategory.name),
      ).toBeVisible();
    });

    const subcategoryUrl = `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`;
    const businessRegion = storeCategoriesPage.businesses(categoryFixture.subcategory.name);

    await test.step("Desativar suspende a exposição", async () => {
      await page.goto(subcategoryUrl);
      await expect(
        businessRegion.getByText(updatedTitle, { exact: true }),
      ).toBeVisible();

      await adminCategoriesPage.goto();
      await adminCategoriesPage.clickEditCategory(categoryFixture.category.name);
      await adminCategoriesPage.editSubcategory(categoryFixture.subcategory.name);
      await adminCategoriesPage.setEditedSubcategoryActive(
        categoryFixture.subcategory.name,
        false,
      );
      await adminCategoriesPage.saveSubcategory();

      await page.goto(subcategoryUrl);
      await expect(businessRegion).toBeVisible();
      await expect(
        businessRegion.getByText(updatedTitle, { exact: true }),
      ).toBeHidden();
      await expect(
        businessRegion.getByText(
          "Ainda não há negócios publicados nesta subcategoria.",
          { exact: true },
        ),
      ).toBeVisible();
    });

    await test.step("Reativar restaura a exposição do perfil elegível", async () => {
      await adminCategoriesPage.goto();
      await adminCategoriesPage.clickEditCategory(categoryFixture.category.name);
      await adminCategoriesPage.editSubcategory(categoryFixture.subcategory.name);
      await adminCategoriesPage.setEditedSubcategoryActive(
        categoryFixture.subcategory.name,
        true,
      );
      await adminCategoriesPage.saveSubcategory();

      await page.goto(subcategoryUrl);
      await expect(
        businessRegion.getByText(updatedTitle, { exact: true }),
      ).toBeVisible();
    });

    await test.step("Excluir limpa a associação e invalida a página pública", async () => {
      await adminCategoriesPage.goto();
      await adminCategoriesPage.clickEditCategory(categoryFixture.category.name);
      await adminCategoriesPage.deleteSubcategory(
        categoryFixture.subcategory.name,
      );

      await page.goto(subcategoryUrl);
      await expect(
        pageObject(page).getByRole("heading", { name: "Página não encontrada", exact: true }).filter({ visible: true }),
      ).toBeVisible();

      await adminProfilesPage.goto();
      await click(adminProfilesPage.getEditButton(updatedTitle));
      await expect(adminProfilesPage.activityAreas.counter(0)).toBeVisible();
      await expect(adminProfilesPage.activityAreas.unavailable).toBeHidden();
    });

    await test.step("Excluir o perfil com titular pela confirmação administrativa", async () => {
      await adminProfilesPage.deleteButton.focus();
      await adminProfilesPage.deleteButton.press("Enter");
      const deletion = pageObject(page).getByRole("dialog").filter({ visible: true });
      await expect(deletion.getByText(adFixture.title, { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(deletion).toBeHidden();
      await expect(adminProfilesPage.deleteButton).toBeFocused();
      await adminProfilesPage.deleteButton.press("Enter");
      await expect(deletion.getByText(adFixture.title, { exact: true })).toBeVisible();
      await deletion.getByLabel("Motivo da exclusão").fill("Remoção administrativa de teste");
      await deletion.getByLabel("Digite o nome do perfil para confirmar").fill(updatedTitle);
      const viewport = page.viewportSize();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: testInfo.outputPath("admin-identity-deletion-desktop.png"), animations: "disabled" });
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(deletion).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("admin-identity-deletion-mobile.png"), animations: "disabled" });
      await page.setViewportSize({ width: 320, height: 812 });
      await expect(deletion).toBeVisible();
      await expect(deletion.getByRole("button", { name: "Confirmar exclusão", exact: true })).toBeVisible();
      expect(await deletion.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (viewport) await page.setViewportSize(viewport);
      await click(deletion.getByRole("button", { name: "Confirmar exclusão", exact: true }));
      await expect(adminProfilesPage.heading).toBeVisible();
      await expect(adminProfilesPage.getProfileRow(updatedTitle)).toBeHidden();
      await page.goto("/");
      await expect(pageObject(page).getByText(adFixture.title, { exact: true }).filter({ visible: true })).toBeHidden();
      expect((await page.goto(`/anuncio/${adFixture.id}/${adFixture.slug}`))?.status()).toBe(404);
      await expect(pageObject(page).getByRole("heading", { name: "Anúncio não encontrado", exact: true })).toBeVisible();
      expect((await page.goto(`/anunciante/${adProfileFixture.id}`))?.status()).toBe(404);
      await expect(pageObject(page).getByRole("heading", { name: "Perfil não encontrado", exact: true })).toBeVisible();
    });
  });
});
