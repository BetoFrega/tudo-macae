// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { prerender } from "react-dom/static";
import { afterEach, expect, test } from "vitest";
import AccountActionsPage from "./page";

type Search = Record<string, string>;

async function renderPage(search: Search) {
  const page = await AccountActionsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(search) });
  const { prelude } = await prerender(page);
  document.body.innerHTML = await new Response(prelude).text();
  return screen.getByRole("main");
}

afterEach(() => {
  document.body.innerHTML = "";
});

test.each<[string, Search, string, string]>([
  ["no parameters", {}, "Entrar e solicitar uma nova verificação", "/minha-conta/verificar-email"],
  ["a pre-migration password reset", { mode: "resetPassword", oobCode: "legacy-disposable-code" }, "Solicitar um novo link de recuperação", "/minha-conta/recuperar-senha"],
  ["a pre-migration email verification", { mode: "verifyEmail", oobCode: "legacy-disposable-code" }, "Entrar e solicitar uma nova verificação", "/minha-conta/verificar-email"],
  ["a pre-migration email change", { mode: "verifyAndChangeEmail", oobCode: "legacy-disposable-code" }, "Entrar e solicitar uma nova verificação", "/minha-conta/verificar-email"],
])("an action link with %s announces the retired link and offers a fresh request", async (_, search, name, href) => {
  const status = within(await renderPage(search)).getByRole("status");
  expect(status).toHaveTextContent("Este link anterior à mudança de acesso não funciona mais.");
  expect(within(status).getByRole("link")).toHaveAccessibleName(name);
  expect(within(status).getByRole("link", { name })).toHaveAttribute("href", href);
});

test("an action link with a current token is not treated as retired", async () => {
  const main = await renderPage({ mode: "unknownMode", token: "disposable-proof" });
  expect(within(main).getByRole("alert")).toHaveTextContent("Operação inválida ou código ausente.");
  expect(within(main).queryByRole("status")).not.toBeInTheDocument();
});
