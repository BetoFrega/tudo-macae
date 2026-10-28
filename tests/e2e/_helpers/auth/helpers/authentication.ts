import { workerFixture } from "../../../../_helpers/auth/helpers/workerFixture";
import { expect, type Page } from "@playwright/test";
import { playwrightTarget } from "../../../../../bin/playwrightTarget";
export {
  registerTestUser,
  deleteUserByEmail,
  deleteUser,
} from "../../../../_helpers/auth/helpers/authentication";

/**
 * Logs in a user by navigating to the home page and using the global login function.
 *
 * Also reloads the page after login to ensure the session is properly established.
 */
export async function loginUser(
  page: Page,
  userCredential: {
    email: string;
    password: string;
  },
) {
  await page.goto("/");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          return typeof window.login === "function";
        }),
      {
        timeout: 5000,
      },
    )
    .toBe(true);
  await page.evaluate(
    async ({ email, password }: { email: string; password: string }) => {
      return await window.login!(email, password);
    },
    {
      email: userCredential.email,
      password: userCredential.password,
    },
  );

  await expect(page.getByRole("button", { name: "Minha conta" })).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Installs an authenticated session as test setup without exercising the UI's
 * Server Action. Journeys that verify login itself continue to use loginUser.
 */
export async function installUserSession(
  page: Page,
  userCredential: {
    email: string;
    password: string;
  },
) {
  await workerFixture("/find", { email: userCredential.email });
  const response = await page.request.post("/api/autenticacao/entrar", {
    headers: { origin: playwrightTarget().origin },
    data: userCredential,
  });
  if (!(await response.json()).success)
    throw new Error("Worker rejected the fixture login");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Minha conta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", {
      name: "Pendência da conta",
      exact: true,
    }),
  ).toContainText("Confirme seu e-mail para publicar anúncios.");
}
