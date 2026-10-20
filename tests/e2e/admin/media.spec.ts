import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { expect, test } from "../_helpers/fixtures";
import { readWebpSize } from "../_helpers/readWebpSize";
import { makeRandomString } from "../../_helpers/makeRandomString";

const smallPng = () => sharp(randomBytes(48 * 32 * 3), { raw: { width: 48, height: 32, channels: 3 } }).png().toBuffer();

test.describe("Acervo de mídia", () => {
  test("Administrador cadastra e corrige Mídia gerada sem aviso de IA no alt e na legenda", async ({
    userWithClaims,
    adminMediaPage,
  }, testInfo) => {
    const alt = `Fachada da Prefeitura ${makeRandomString()}`;
    const creator = `Maria Souza ${makeRandomString()}`;
    const caption = `Sede da Prefeitura ${makeRandomString()}`;
    const credit = "Tudo Macaé AI";
    const newCredit = "Tudo Macaé AI / Equipe editorial";
    const newAlt = `${alt} em Macaé`;

    await test.step("Setup: Usuário administrador", async () => {
      await userWithClaims({ admin: true });
    });

    await adminMediaPage.open();
    await expect(adminMediaPage.heading).toBeVisible();

    await test.step("Cadastrar a mídia com espécie, arquivo e metadados", async () => {
      await expect(adminMediaPage.kindSelect).toHaveText("Imagem de matéria");
      await adminMediaPage.originSelect.focus();
      await adminMediaPage.originSelect.press("Space");
      await pageObject(adminMediaPage.page).getByRole("option", { name: "Conteúdo gerado", exact: true }).press("Enter");
      await adminMediaPage.chooseFile("prefeitura.png", "image/png", await smallPng());
      await adminMediaPage.altField.fill(alt);
      await adminMediaPage.captionField.fill(caption);
      await adminMediaPage.creatorField.fill(creator);
      await adminMediaPage.creditField.fill(credit);
      await adminMediaPage.acquiredAtField.fill("2026-08-20T14:30");
      await adminMediaPage.submit();
    });

    await test.step("Ver a mídia na listagem do acervo", async () => {
      const card = adminMediaPage.card(alt);
      await expect(card).toBeVisible();
      await expect(card).toContainText("Conteúdo gerado");
      await expect(card.locator("[data-media-credit]")).toHaveText(credit);
      await expect(card).toContainText(caption);
      await expect(card).toContainText(credit);
      await expect(card.getByRole("img", { name: alt })).toBeVisible();
    });

    await test.step("Editar o crédito revisionado, sem poder trocar o arquivo", async () => {
      await adminMediaPage.openEditDialog(alt);
      await expect(adminMediaPage.editCreditField).toHaveValue(credit);
      await expect(adminMediaPage.editFileField).toHaveCount(0);
      await expect(adminMediaPage.editReasonField).toHaveCount(0);

      await adminMediaPage.editAltField.fill(newAlt);
      await adminMediaPage.editCreditField.fill(newCredit);
      await adminMediaPage.saveEdit();
    });

    await test.step("Ver o crédito atualizado no acervo", async () => {
      await expect(adminMediaPage.card(newAlt).locator("[data-media-credit]")).toHaveText(newCredit);
      await adminMediaPage.open();
      await adminMediaPage.openEditDialog(newAlt);
      await expect(adminMediaPage.editAltField).toHaveValue(newAlt);
      await expect(adminMediaPage.editCreditField).toHaveValue(newCredit);
      await adminMediaPage.editCreditField.fill(credit);
      await adminMediaPage.saveEdit();
      await expect(adminMediaPage.saveEditButton).not.toBeVisible();
    });
    const card = adminMediaPage.card(newAlt);
    await expect(card.locator("[data-media-credit]")).toHaveText(credit);
    await expect(card).toContainText("Conteúdo gerado");
    await expect(card.locator("figcaption")).toHaveText(caption);
    await expect(card).not.toContainText(alt);
    for (const width of [1280, 390, 320]) {
      await adminMediaPage.page.setViewportSize({ width, height: 900 });
      await card.screenshot({ path: testInfo.outputPath(`library-${width}.png`) });
    }
    await adminMediaPage.page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    try {
      await expect(card.locator("[data-media-credit]")).toHaveCSS("font-size", "24px");
      await expect.poll(() => card.locator("[data-media-credit]").evaluate((element) => {
        const box = element.getBoundingClientRect();
        const visual = element.closest("[data-media-visual]")!.getBoundingClientRect();
        return box.left >= visual.left && box.right <= visual.right + 1 && box.top >= visual.top && box.bottom <= visual.bottom + 1 && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
      await card.screenshot({ path: testInfo.outputPath("library-320-text-200-percent.png") });
    }
    finally {
      await adminMediaPage.page.evaluate(() => {
        document.documentElement.style.removeProperty("font-size");
      });
    }
  });

  test("Cadastro sem texto alternativo e sem Procedência estruturada é recusado", async ({
    userWithClaims,
    adminMediaPage,
  }) => {
    const caption = `Legenda sem alt ${makeRandomString()}`;

    await test.step("Setup: Usuário administrador", async () => {
      await userWithClaims({ admin: true });
    });

    await adminMediaPage.open();

    await adminMediaPage.chooseFile("prefeitura.png", "image/png", await smallPng());
    await adminMediaPage.captionField.fill(caption);
    await adminMediaPage.submit();

    await expect(
      pageObject(adminMediaPage.page).getByText("Informe o texto alternativo da imagem."),
    ).toBeVisible();
    await expect(
      pageObject(adminMediaPage.page).getByText("Informe a autoria da mídia."),
    ).toBeVisible();

    // The caption is unique to this test and was never saved, so its absence
    // from the shared library is a fact about this run, not about the emulator.
    await test.step("A mídia não foi guardada", async () => {
      await adminMediaPage.open();
      await expect(adminMediaPage.card(caption)).not.toBeVisible();
    });
  });

  test("Administrador escolhe pelo seletor uma mídia já guardada no acervo", async ({
    userWithClaims,
    adminMediaPage,
  }) => {
    const alt = `Fachada da Prefeitura ${makeRandomString()}`;
    const credit = `Assessoria de Imprensa da Prefeitura ${makeRandomString()}`;

    await test.step("Setup: Usuário administrador", async () => {
      await userWithClaims({ admin: true });
    });

    await adminMediaPage.open();

    await test.step("Setup: Uma mídia já guardada no acervo", async () => {
      await adminMediaPage.chooseFile("prefeitura.png", "image/png", await smallPng());
      await adminMediaPage.altField.fill(alt);
      await adminMediaPage.creatorField.fill("Assessoria da Prefeitura");
      await adminMediaPage.creditField.fill(credit);
      await adminMediaPage.acquiredAtField.fill("2026-08-20T14:30");
      await adminMediaPage.submit();
      await expect(adminMediaPage.card(alt)).toBeVisible();
    });

    await test.step("Abrir o seletor e escolher a mídia guardada", async () => {
      await adminMediaPage.openPicker();
      await expect(adminMediaPage.pickerOption(alt)).toBeVisible();
      await adminMediaPage.chooseFromPicker(alt);
    });

    await test.step("A escolha fica registrada e o seletor se fecha", async () => {
      await expect(adminMediaPage.pickerChoice).not.toContainText(alt);
      await expect(adminMediaPage.pickerChoice).toContainText(credit);
      await expect(adminMediaPage.pickerChoice.getByRole("img", { name: alt }))
        .toBeVisible();
      await expect(adminMediaPage.picker).not.toBeVisible();
    });
  });

  test("Administrador cadastra uma mídia nova de dentro do seletor, sem sair do fluxo", async ({
    userWithClaims,
    adminMediaPage,
  }) => {
    const alt = `Praia dos Cavaleiros ${makeRandomString()}`;
    const credit = `Arquivo do Tudo Macaé ${makeRandomString()}`;

    await test.step("Setup: Usuário administrador", async () => {
      await userWithClaims({ admin: true });
    });

    await adminMediaPage.open();
    await adminMediaPage.openPicker();

    await test.step("Cadastrar a mídia dentro do seletor", async () => {
      // A espécie vem do contexto que abriu o seletor: não há o que escolher.
      await expect(adminMediaPage.pickerKindSelect).toHaveCount(0);

      await adminMediaPage.choosePickerFile("orla.png", "image/png", await smallPng());
      await adminMediaPage.pickerAltField.fill(alt);
      await adminMediaPage.pickerCreatorField.fill("Equipe Tudo Macaé");
      await adminMediaPage.pickerCreditField.fill(credit);
      await adminMediaPage.pickerAcquiredAtField.fill("2026-08-20T14:30");
      await adminMediaPage.submitPickerForm();
    });

    await test.step("A mídia nova já fica escolhida, sem sair do fluxo", async () => {
      await expect(adminMediaPage.pickerChoice).not.toContainText(alt);
      await expect(adminMediaPage.pickerChoice).toContainText(credit);
      await expect(adminMediaPage.picker).not.toBeVisible();
    });

    await test.step("E está guardada no acervo", async () => {
      await adminMediaPage.open();
      await expect(adminMediaPage.card(alt)).toContainText(credit);
    });
  });

  test("Imagem maior que 1920px chega ao acervo redimensionada, em WebP e com menos de 1MB", async ({
    userWithClaims,
    adminMediaPage,
  }) => {
    const alt = `Panorâmica da orla ${makeRandomString()}`;

    await test.step("Setup: Usuário administrador", async () => {
      await userWithClaims({ admin: true });
    });

    await adminMediaPage.open();

    await test.step("Cadastrar uma imagem de 2400x1200", async () => {
      // Each run needs distinct pixels: the library deduplicates processed bytes.
      const largePng = await sharp(await smallPng())
        .resize(2400, 1200, { kernel: "nearest" }).png().toBuffer();
      await adminMediaPage.chooseFile(
        "orla.png",
        "image/png",
        largePng,
      );
      await adminMediaPage.altField.fill(alt);
      await adminMediaPage.creatorField.fill("Equipe Tudo Macaé");
      await adminMediaPage.creditField.fill("Foto: Equipe Tudo Macaé");
      await adminMediaPage.acquiredAtField.fill("2026-08-20T14:30");
      await adminMediaPage.submit();
      await expect(adminMediaPage.altField).toHaveValue("");
    });

    const image = adminMediaPage.card(alt).getByRole("img", { name: alt });
    await expect(image).toBeVisible();

    const source = (await image.getAttribute("src")) ?? "";

    await test.step("A mídia preparada é servida pela rota privada", () => {
      expect(new URL(source, adminMediaPage.page.url()).pathname)
        .toMatch(/^\/midia\/[A-Za-z0-9-]+$/);
    });

    await test.step("O arquivo no bucket foi redimensionado e cabe em 1MB", async () => {
      const response = await adminMediaPage.page.request.get(source);
      const stored = await response.body();

      expect(response.headers()["content-type"]).toBe("image/webp");
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(readWebpSize(stored)).toEqual({ width: 1920, height: 960 });
      expect(stored.length).toBeLessThanOrEqual(1024 * 1024);
    });
  });
});
