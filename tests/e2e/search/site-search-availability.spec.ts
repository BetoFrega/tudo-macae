import { expect, test } from "../_helpers/fixtures";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { SITE_SEARCH_FAKE_FLAG_FAILURE } from "../bin/siteSearchFake";
import { actAs, clearScriptedReplies, headerSearch } from "../_helpers/siteSearch";

test.afterEach(clearScriptedReplies);

test("busca desligada ou sem avaliação mantém a navegação atual", async ({ context, page }) => {
  for (const [label, distinctId] of [["visitante", undefined], ["avaliação indisponível", SITE_SEARCH_FAKE_FLAG_FAILURE]] as const) {
    await test.step(label, async () => {
      await context.clearCookies();
      if (distinctId) await actAs(context, distinctId);

      await page.goto("/");
      await expect(pageObject(page).getByRole("banner").getByRole("link", { name: "Negócios", exact: true }).filter({ visible: true }))
        .toBeVisible();
      await expect(headerSearch(page)).toHaveCount(0);

      const response = await page.goto("/busca?q=padaria");
      expect(response?.status()).toBe(404);
      expect(response?.headers()["referrer-policy"]).toBe("origin");
      await expect(pageObject(page).getByRole("search", { name: "Buscar no Tudo Macaé" })).toHaveCount(0);
    });
  }
});
