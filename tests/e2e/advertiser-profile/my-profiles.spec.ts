import { expect, test } from "../_helpers/fixtures";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";

// The card's title and status must reflow without hiding its actions.
test("Meus Perfis reflows long content and keeps catalogue and edit actions keyboard accessible", async ({
  page, authentication, userCredentials, adProfileFixture,
}) => {
  const longTitle = `Ateliê ${makeRandomString()} ${"MóveisSobMedida".repeat(8)}`.slice(0, 100);
  const incompleteId = await createProfileFixture(userCredentials, {
    title: longTitle,
    description: "Peças sob medida para sua casa.\nAtendimento em Macaé.",
    contacts: [],
    activityAreas: [],
  });
  await authentication.login(userCredentials);
  await page.goto("/minha-conta/perfis");
  const surface = pageObject(page);
  await expect(surface.getByRole("main")).toHaveCount(1);
  const completeCard = surface.getByRole("article", { name: adProfileFixture.title, exact: true }).filter({ visible: true });
  const incompleteCard = surface.getByRole("article", { name: longTitle, exact: true }).filter({ visible: true });
  const createLink = surface.getByRole("link", { name: "Criar Novo Perfil", exact: true }).filter({ visible: true });
  const completeLink = incompleteCard.getByRole("link", { name: `Completar cadastro: ${longTitle}`, exact: true });
  const publicLink = completeCard.getByRole("link", { name: `Ver negócio: ${adProfileFixture.title}`, exact: true });
  await expect(completeCard.getByText("Visível no catálogo", { exact: true })).toBeVisible();
  await expect(incompleteCard.getByRole("heading", { name: longTitle, level: 2, exact: true })).toBeVisible();
  await expect(completeLink).toHaveAttribute("href", `/minha-conta/perfis/${incompleteId}/editar`);
  await expect(incompleteCard.getByRole("link", { name: /^Ver negócio:/ })).toHaveCount(0);
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const link of [createLink, publicLink, completeLink]) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: test.info().outputPath(`profiles-${width}.png`), fullPage: true });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  for (const card of [completeCard, incompleteCard]) {
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await publicLink.focus();
  await page.keyboard.press("Tab");
  await expect(completeCard.getByRole("link", { name: `Editar: ${adProfileFixture.title}`, exact: true })).toBeFocused();
  await completeLink.focus();
  await expect(completeLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/minha-conta/perfis/${incompleteId}/editar$`));
  await expect(surface.getByRole("main")).toHaveCount(1);
});

test("Meus Perfis empty state keeps the create action available on mobile", async ({ page, authentication, userCredentials }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authentication.login(userCredentials);
  await page.goto("/minha-conta/perfis");
  const surface = pageObject(page);
  await expect(surface.getByRole("main")).toHaveCount(1);
  await expect(surface.getByText("Você ainda não tem nenhum perfil de anunciante.", { exact: true }).filter({ visible: true })).toBeVisible();
  const createLink = surface.getByRole("link", { name: "Criar Novo Perfil", exact: true }).filter({ visible: true });
  await expect(createLink).toHaveAttribute("href", "/minha-conta/perfis/novo");
  await page.screenshot({ path: test.info().outputPath("profiles-empty-mobile.png"), fullPage: true });
  await createLink.focus();
  await expect(createLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/minha-conta\/perfis\/novo$/);
  await expect(surface.getByRole("main")).toHaveCount(1);
  const title = `Perfil próprio ${makeRandomString()}`;
  const form = surface.locator("form").filter({ visible: true });
  await form.getByLabel("Título do Perfil").fill(title);
  await form.getByRole("radio", { name: "Um negócio", exact: true }).check();
  await click(form.getByRole("button", { name: "Criar Perfil", exact: true }));
  await expect(page).toHaveURL(/\/minha-conta\/perfis$/);
  const card = surface.getByRole("article", { name: title, exact: true }).filter({ visible: true });
  await expect(card.getByRole("heading", { name: title, level: 2, exact: true })).toBeVisible();
  const completeLink = card.getByRole("link", { name: `Completar cadastro: ${title}`, exact: true });
  await completeLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/minha-conta\/perfis\/[^/]+\/editar$/);
  await expect(surface.getByLabel("Título do Perfil").filter({ visible: true })).toHaveValue(title);
});
