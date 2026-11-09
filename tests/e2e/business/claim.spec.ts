import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { repositoryRoot } from "../../../bin/appPorts";
import { playwrightTarget } from "../../../bin/playwrightTarget";
import { e2eRenderer } from "../../../bin/e2eStack";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { installUserSession } from "../_helpers/auth/helpers/authentication";
import { createClaimableProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { makeRandomString } from "../../_helpers/makeRandomString";

// Only the vinext renderer evaluates Flagship flags; it reads Wrangler's local flag store.
const flagshipApp = "bbf7fbfb-4575-410d-b948-bb1c47ef30ff";
test.skip(e2eRenderer() !== "vinext", "The business-claim flag is read only through the web Worker's Flagship binding.");

function setLocalClaimFlag(state: "on" | "off") {
  const base = ["exec", "wrangler", "flagship", "flags"];
  const scope = ["--local", "--persist-to", ".wrangler/state", "-c", "wrangler.web.jsonc"];
  try {
    execFileSync("pnpm", [...base, "delete", flagshipApp, "business-claim", "--force", ...scope], { cwd: repositoryRoot, stdio: "ignore" });
  }
  catch {
    // Absent from a fresh local store.
  }
  execFileSync("pnpm", [...base, "create", flagshipApp, "business-claim", "--default", state, ...scope], { cwd: repositoryRoot, stdio: "ignore" });
}

/** `installUserSession` expects the unverified-e-mail notice; a claimant must have a confirmed e-mail. */
async function signInVerified(page: Page, credentials: { email: string; password: string }) {
  const response = await page.request.post("/api/autenticacao/entrar", { headers: { origin: playwrightTarget().origin }, data: credentials });
  expect((await response.json()).success).toBe(true);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const directory = testInfo.outputPath("journey");
  mkdirSync(directory, { recursive: true });
  const path = `${directory}/${name}.png`;
  // A full-page capture of a scrolled page paints the sticky header mid-image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeAll(() => setLocalClaimFlag("on"));
test.afterAll(() => setLocalClaimFlag("off"));

test("dono pede a página, administrador aprova e o dono passa a administrar o Negócio", async ({
  browser, page, verifiedUserCredentials, adminUserCredentials, categoryFixture,
}, testInfo) => {
  const title = `Padaria Reivindicada ${makeRandomString()}`;
  const { id } = await createClaimableProfileFixture({
    title,
    description: "Pães e cafés no centro de Macaé.",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id }],
    sourceUrl: "https://example.com/padaria",
  });
  const publicPath = businessCanonicalPath({ id, title });
  const admin = await browser.newContext();
  try {
    await page.goto(publicPath);
    const invite = pageObject(page).getByRole("link", { name: "Assumir esta página" });
    await expect(invite).toBeVisible();
    await capture(page, testInfo, "01-visitante-ve-o-convite");

    await signInVerified(page, verifiedUserCredentials);
    await page.goto(publicPath);
    await expect(pageObject(page).getByRole("button", { name: "Minha conta", exact: true })).toBeVisible();
    await click(pageObject(page).getByRole("link", { name: "Assumir esta página" }));
    await expect(pageObject(page).getByLabel("Seu nome")).toBeVisible();
    await capture(page, testInfo, "02-dono-abre-o-pedido");

    await pageObject(page).getByLabel("Seu nome").fill("Ana Souza");
    await pageObject(page).getByLabel("CNPJ do negócio").fill("11.222.333/0001-81");
    await pageObject(page).getByLabel("Mensagem para a equipe (opcional)").fill("Pode ligar de manhã.");
    await click(pageObject(page).getByRole("button", { name: "Enviar pedido" }));
    await expect(pageObject(page).getByRole("status").filter({ hasText: "Seu pedido está em análise" })).toBeVisible();
    await capture(page, testInfo, "03-pedido-em-analise");

    const adminPage = await admin.newPage();
    await installUserSession(adminPage, adminUserCredentials);
    await adminPage.goto("/admin/reivindicacoes");
    const claim = pageObject(adminPage).getByRole("region", { name: title });
    await expect(claim).toBeVisible();
    await capture(adminPage, testInfo, "04-fila-do-admin");
    await claim.getByLabel("Liguei para o telefone publicado na página e o negócio confirmou o pedido").check();
    await click(claim.getByRole("button", { name: "Aprovar" }));
    // Revalidation re-renders the queue, so the approved claim leaves it.
    await expect(pageObject(adminPage).getByText(title)).toHaveCount(0);
    await capture(adminPage, testInfo, "05-admin-aprovou");

    await page.goto(`/minha-conta/negocios/${id}/assumido`);
    await expect(pageObject(page).getByRole("heading", { name: `Agora você administra ${title}` })).toBeVisible();
    await capture(page, testInfo, "06-boas-vindas-do-novo-dono");

    await page.goto(publicPath);
    await expect(pageObject(page).getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(pageObject(page).getByRole("link", { name: "Assumir esta página" })).toHaveCount(0);
    await capture(page, testInfo, "07-pagina-sem-convite");
  }
  finally {
    await admin.close();
    await deleteProfileFixture(id);
  }
});
