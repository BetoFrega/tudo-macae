import { expect, test } from "@playwright/test";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";

test("reader opens terms from the footer and returns to the site", async ({ page }) => {
  const visible = pageObject(page);
  await page.goto("/");
  await click(visible.getByRole("link", { name: "Termos e Condições", exact: true }));
  await expect(page).toHaveURL(/\/termos-e-condicoes$/u);
  await expect(visible.getByRole("heading", { name: "Termos de Uso e Condições Gerais", exact: true })).toBeVisible();
  await expect(visible.getByText("A Natureza da Plataforma", { exact: false })).toBeVisible();
  await expect(visible.getByRole("main")).toHaveCount(1);
  await expect(visible.getByRole("article")).toHaveCSS("-webkit-font-smoothing", "antialiased");
  await click(visible.getByRole("link", { name: "Tudo Macaé — página inicial", exact: true }));
  await expect(page).toHaveURL(/\/$/u);
  await click(visible.getByRole("link", { name: "Política de Privacidade", exact: true }));
  await expect(page).toHaveURL(/\/politica-de-privacidade$/u);
  await expect(visible.getByRole("main")).toHaveCount(1);
});
