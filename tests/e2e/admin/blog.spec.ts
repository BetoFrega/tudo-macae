import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

/**
 * The newsroom journey through the API Worker. Each step reopens the post, so it asserts the durable state.
 * The API Worker fixture confirms the public index write and the image purge, so each mutation reports a confirmed
 * distribution. The unconfirmed outcome is covered by `apps/api-worker/tests/editorialBlogDistribution.runtime.test.ts`,
 * `editorialBlogMediaCleanup.runtime.test.ts` and `ArticleDraftForm.test.tsx`.
 */

const smallPng = () => sharp(randomBytes(48 * 32 * 3), { raw: { width: 48, height: 32, channels: 3 } }).png().toBuffer();

async function listedPost(page: Page, title: string) {
  await page.goto("/redacao/materias");
  const view = pageObject(page);
  return view.getByRole("listitem").filter({ has: view.getByRole("link", { name: title, exact: true }) });
}

async function openPost(page: Page, title: string) {
  const row = await listedPost(page, title);
  await click(row.getByRole("link", { name: title, exact: true }));
  await expect(pageObject(page).getByRole("heading", { name: "Editar post", exact: true })).toBeVisible();
}

test.describe("Posts da redação", () => {
  test("Editor cria um rascunho, publica e retira o post do ar", async ({ page, userWithClaims }) => {
    const view = pageObject(page);
    const title = `Obra na Linha Verde ${makeRandomString()}`;
    const body = `A obra começa na segunda-feira. ${makeRandomString()}`;
    const coverAlt = `Máquinas na Linha Verde ${makeRandomString()}`;
    let postId = "";
    let coverUrl = "";

    await test.step("Setup: Usuário editor", async () => {
      await userWithClaims({ editor: true });
    });

    await test.step("Salvar um rascunho novo", async () => {
      await page.goto("/redacao/materias/nova");
      await view.getByLabel("Título", { exact: true }).fill(title);
      await view.getByLabel("Texto", { exact: true }).fill(body);
      await click(view.getByRole("button", { name: "Escolher capa", exact: true }));
      const picker = view.getByTestId("media-picker").getByTestId("media-form");
      await picker.getByLabel("Arquivo").setInputFiles({ name: "linha-verde.png", mimeType: "image/png", buffer: await smallPng() });
      await picker.getByLabel("Texto alternativo").fill(coverAlt);
      await picker.getByLabel("Autoria").fill("Equipe Tudo Macaé");
      await picker.getByLabel("Crédito").fill(`Arquivo do Tudo Macaé ${makeRandomString()}`);
      await picker.getByLabel("Data de aquisição").fill("2026-08-20T14:30");
      await click(picker.getByRole("button", { name: "Cadastrar e escolher", exact: true }));
      await expect(view.getByText("Capa selecionada.", { exact: true })).toBeVisible();
      await click(view.getByRole("button", { name: "Salvar rascunho", exact: true }));
      // A new post's form remounts on its own URL, so the save message does not survive.
      await expect(page).toHaveURL(/\/redacao\/materias\/(?!nova$)[^/]+$/u);
      postId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
      await expect(await listedPost(page, title)).toContainText("Rascunho");
    });

    await test.step("Publicar o rascunho", async () => {
      await openPost(page, title);
      await expect(view.getByLabel("Texto", { exact: true })).toHaveValue(body);
      await click(view.getByRole("button", { name: "Publicar", exact: true }));
      await expect(view.getByRole("status")).toHaveText("Post publicado.");
      await expect(await listedPost(page, title)).toContainText("Publicado");
    });

    await test.step("Leitor encontra o post publicado", async () => {
      await page.goto("/noticias");
      await click(view.getByRole("link", { name: title, exact: true }));
      await expect(page).toHaveURL(new RegExp(`/noticia/${postId}/[^/]+$`, "u"));
      await expect(view.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
      await expect(view.getByText(body)).toBeVisible();
      const cover = view.getByRole("img", { name: coverAlt, exact: true });
      await expect(cover).toBeVisible();
      coverUrl = new URL((await cover.getAttribute("src"))!, page.url()).href;
      const image = await page.request.get(coverUrl);
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toMatch(/^image\//u);
    });

    await test.step("Retirar o post do ar", async () => {
      await openPost(page, title);
      await click(view.getByRole("button", { name: "Retirar do ar", exact: true }));
      await expect(view.getByRole("status")).toHaveText("Post retirado do ar. Conteúdo preservado.");
      await expect(await listedPost(page, title)).toContainText("Rascunho");
    });

    await test.step("Leitor não encontra mais o post", async () => {
      // Any slug reaches the reader route; a post taken offline answers as not found instead of redirecting.
      await page.goto(`/noticia/${encodeURIComponent(postId)}/qualquer`);
      await expect(view.getByRole("heading", { level: 1, name: "Matéria não encontrada", exact: true })).toBeVisible();
      expect((await page.request.get(coverUrl)).status()).toBe(404);
    });
  });
});
