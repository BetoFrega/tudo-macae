import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { click, waitForHydration } from "../_helpers/click";

test.describe("User Registration", () => {
  test("Jornada: Registro de novo usuário", async ({
    page,
    registrationPage,
    unregisteredCredentials,
  }) => {
    await test.step("Acessar diálogo de registro", async () => {
      await page.goto("/");
      const registrationCta = pageObject(page).getByRole("main").getByRole("button", { name: "Cadastre seu negócio ou serviço", exact: true });
      await waitForHydration(registrationCta);
      await click(registrationCta);
      await registrationPage.switchToRegistration();
    });

    await test.step("Registrar com sucesso e estar logado", async () => {
      await registrationPage.register(
        unregisteredCredentials.email,
        unregisteredCredentials.password,
      );

      await expect(
        pageObject(page).getByRole("button", { name: "Minha Conta" }).filter({ visible: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/minha-conta\/perfis\/novo\?origem=catalogo&entrada=home$/u);
      await expect(pageObject(page).getByRole("heading", { name: "Criar negócio", exact: true })).toBeVisible();
    });

    await test.step("Verificar que cadastro não cria perfil de anunciante automaticamente", async () => {
      await page.goto("/minha-conta/perfis");
      await expect(
        pageObject(page).getByText("Você ainda não tem nenhum perfil de anunciante.", { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect(pageObject(page).getByRole("link", { name: "Criar Novo Perfil", exact: true }).filter({ visible: true })).toHaveAttribute("href", "/minha-conta/perfis/novo");
    });
  });
});
