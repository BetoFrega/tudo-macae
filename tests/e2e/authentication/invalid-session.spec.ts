import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { readFile } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "../_helpers/fixtures";
import { E2E_SERVER_LOG_PATH, E2E_SERVER_READY, e2eRenderer } from "../../../bin/e2eStack";
import { playwrightTarget } from "../../../bin/playwrightTarget";

const protectedRoutes = [
  "/admin",
  "/minha-conta/anuncios",
  "/anuncio/inexistente/editar",
];

test("Cookie de sessão inválido mostra acesso não autorizado e deixa de ser enviado", async ({
  context,
  page,
}) => {
  for (const route of protectedRoutes) {
    await test.step(`${route} trata a sessão inválida como visita`, async () => {
      await context.addCookies([{
        name: "session",
        value: "not-a-real-session-cookie",
        domain: new URL(playwrightTarget().origin).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      }]);

      await page.goto(route);

      await expect(
        pageObject(page).getByText("Você precisa se autenticar para ver essa página.").filter({ visible: true }),
      ).toBeVisible();
      /* eslint-disable local/no-positional-playwright-locators, local/no-raw-playwright-page-selectors -- Root and route metadata are non-visible and coexist; either robots directive proves this protected response is not indexable. */
      await expect(page.locator("meta[name=\"robots\"]").first()).toHaveAttribute(
        "content",
        /noindex/,
      );
      /* eslint-enable local/no-positional-playwright-locators, local/no-raw-playwright-page-selectors */
      await expect.poll(async () =>
        (await context.cookies()).some(cookie => cookie.name === "session"),
      ).toBe(false);
    });
  }

  const nextNavigation = page.waitForRequest(request =>
    request.isNavigationRequest()
    && new URL(request.url()).pathname === "/admin",
  );
  await page.goto("/admin");

  const navigationHeaders = await (await nextNavigation).allHeaders();
  expect(navigationHeaders.cookie ?? "").not.toContain("session=");

  await expect.poll(async () => stripVTControlCharacters(await readFile(E2E_SERVER_LOG_PATH, "utf8")))
    .toMatch(E2E_SERVER_READY[e2eRenderer()]);
  expect(await readFile(E2E_SERVER_LOG_PATH, "utf8"))
    .not.toContain("Cookies can only be modified in a Server Action or Route Handler");
});
