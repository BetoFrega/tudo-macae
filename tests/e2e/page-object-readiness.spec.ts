import { pageObject } from "./_helpers/fixtures/POMs/pageObject";
import { expect, test } from "@playwright/test";
import { BasePage } from "./_helpers/fixtures/POMs/BasePage";

class VisibleSelectorsPage extends BasePage {
  get panelByCss() {
    return this.locator("[data-panel]");
  }

  get panelByTestId() {
    return this.getByTestId("panel");
  }

  get message() {
    return this.getByText("Conteúdo atual", { exact: true });
  }

  get heading() {
    return this.getByRole("heading", { name: "Conteúdo atual" });
  }

  get field() {
    return this.getByLabel("Título");
  }

  get search() {
    return this.getByPlaceholder("Buscar");
  }

  get image() {
    return this.getByAltText("Praia dos Cavaleiros");
  }

  get help() {
    return this.getByTitle("Ajuda");
  }
}

test("Seletores de Page Object ignoram a árvore oculta sem mascarar duplicatas visíveis", async ({ page }) => {
  await page.setContent(`
    <div hidden>
      <section data-panel data-testid="panel">
        <h2>Conteúdo atual</h2>
        <label>Título <input placeholder="Buscar" /></label>
        <img alt="Praia dos Cavaleiros" />
        <button title="Ajuda">?</button>
      </section>
    </div>
    <section data-panel data-testid="panel">
      <h2>Conteúdo atual</h2>
      <label>Título <input placeholder="Buscar" /></label>
      <img alt="Praia dos Cavaleiros" />
      <button title="Ajuda">?</button>
    </section>
  `);

  const selectors = new VisibleSelectorsPage(page);
  expect(await selectors.panelByCss.count()).toBe(1);
  expect(await selectors.panelByTestId.count()).toBe(1);
  expect(await selectors.message.count()).toBe(1);
  expect(await selectors.heading.count()).toBe(1);
  expect(await selectors.field.count()).toBe(1);
  expect(await selectors.search.count()).toBe(1);
  expect(await selectors.image.count()).toBe(1);
  expect(await selectors.help.count()).toBe(1);

  await pageObject(page).locator("body").filter({ visible: true }).evaluate((body) => {
    const duplicate = document.createElement("section");
    duplicate.dataset.panel = "";
    duplicate.dataset.testid = "panel";
    duplicate.textContent = "Conteúdo atual";
    body.append(duplicate);
  });

  expect(await selectors.panelByCss.count()).toBe(2);
  expect(await selectors.panelByTestId.count()).toBe(2);
  expect(await selectors.message.count()).toBe(2);

  let strictnessError: unknown;
  try {
    await expect(selectors.panelByTestId).toBeVisible();
  }
  catch (error) {
    strictnessError = error;
  }
  expect(strictnessError).toBeInstanceOf(Error);
  expect((strictnessError as Error).message).toContain("strict mode violation");
});
