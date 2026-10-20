import {
  registerTestUser,
  deleteUser,
} from "../../_helpers/auth/helpers/authentication";
import { workerFixture } from "../../_helpers/auth/helpers/workerFixture";
import { createWorkerAccount, deleteWorkerAccount } from "../../_helpers/auth/helpers/workerSession";
import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { readDisposablePasswordResetLink } from "../../_helpers/auth/helpers/verificationAccounts";

// Native one-use recovery links must stay out of traces and media artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("conta migrada preserva titularidade e papéis após recuperação e substitui links antigos", async ({
  page,
  loginPage,
}) => {
  const account = await registerTestUser({
    migrated: true,
    claims: { editor: true },
  });
  try {
    await giveProfileTo(account.uid);
    for (const mode of [
      "resetPassword",
      "verifyEmail",
      "verifyAndChangeEmail",
    ]) {
      await page.goto(
        `/minha-conta/acao?mode=${mode}&oobCode=legacy-disposable-code`,
      );
      await expect(
        pageObject(page).getByText(/Este link anterior à mudança de acesso/),
      ).toBeVisible();
      await expect(
        pageObject(page).getByRole("link", {
          name:
            mode === "resetPassword"
              ? "Solicitar um novo link de recuperação"
              : "Entrar e solicitar uma nova verificação",
        }),
      ).toBeVisible();
    }
    await page.goto("/");
    await click(
      pageObject(page)
        .getByRole("button", { name: "Entrar", exact: true })
        .filter({ visible: true }),
    );
    const dialog = pageObject(page)
      .getByRole("dialog")
      .filter({ visible: true });
    await expect(dialog.getByText(/Atualizamos o acesso/)).toBeVisible();
    await click(
      dialog.getByRole("button", { name: "Esqueceu a senha?", exact: true }),
    );
    await dialog
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(account.email);
    await click(
      dialog.getByRole("button", {
        name: "Enviar email de recuperação",
        exact: true,
      }),
    );
    await expect(
      dialog.getByText(
        "Email de recuperação enviado! Verifique sua caixa de entrada.",
        { exact: true },
      ),
    ).toBeVisible();
    const link = await readDisposablePasswordResetLink(account.email);
    await page.goto("/minha-conta/acao");
    await page.evaluate(url => window.location.assign(url), link);
    await pageObject(page)
      .getByLabel("Nova Senha", { exact: true })
      .filter({ visible: true })
      .fill("abc123");
    await click(
      pageObject(page)
        .getByRole("button", { name: "Redefinir senha", exact: true })
        .filter({ visible: true }),
    );
    await expect(
      pageObject(page)
        .getByText("Você já pode entrar com sua nova senha.", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await page.goto(link);
    await pageObject(page).getByLabel("Nova Senha", { exact: true }).fill("other123");
    await page.route("**/minha-conta/acao?*", async (route) => {
      if (route.request().headers()["next-action"]) await route.abort("failed");
      else await route.continue();
    });
    await click(pageObject(page).getByRole("button", { name: "Redefinir senha", exact: true }));
    await expect(pageObject(page).getByRole("alert").filter({ hasText: "Não foi possível redefinir" })).toContainText("Tente novamente.");
    await expect(pageObject(page).getByLabel("Nova Senha", { exact: true })).toHaveValue("other123");
    await page.unroute("**/minha-conta/acao?*");
    await click(pageObject(page).getByRole("button", { name: "Redefinir senha", exact: true }));
    await expect(pageObject(page).getByRole("alert").filter({ hasText: "Código inválido ou expirado." })).toContainText("Código inválido ou expirado.");
    await click(pageObject(page).getByRole("link", { name: "Solicitar um novo link de recuperação" }));
    await expect(page).toHaveURL(url => url.pathname === "/minha-conta/recuperar-senha");
    await page.goto("/");
    await loginPage.login(account.email, "abc123");
    await expect(
      pageObject(page)
        .getByRole("button", { name: "Minha conta", exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    expect(
      await (await page.request.get("/api/autenticacao/sessao")).json(),
    ).toMatchObject({
      uid: account.uid,
      emailVerified: true,
      isEditor: true,
      isAdmin: false,
    });
    await page.goto("/minha-conta/perfis");
    await expect(
      pageObject(page).getByText(
        "Você ainda não tem nenhum perfil de anunciante.",
        { exact: true },
      ),
    ).toHaveCount(0);
  }
  finally {
    await deleteUser(account.uid);
  }
});

/** A migrated account has no password until recovery, so another account creates the profile it owns. */
async function giveProfileTo(uid: string) {
  const creator = await createWorkerAccount();
  try {
    const id = await createProfileFixture(creator, { title: "Perfil migrado", description: "", contacts: [] });
    await workerFixture("/set-profile-owner", { id, uid });
  }
  finally {
    await deleteWorkerAccount(creator.uid);
  }
}
