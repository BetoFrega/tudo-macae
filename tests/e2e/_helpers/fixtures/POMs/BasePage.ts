import { expect, type Locator, type Page } from "@playwright/test";
import { click } from "../../click";

export class BasePage {
  constructor(public readonly page: Page) {}

  /**
   * PPR can temporarily retain a complete swap tree under a hidden ancestor.
   * Page objects address the UI the user can act on, so their generic CSS,
   * test-id, and text selectors exclude those hidden copies by default.
   * Use `this.page` directly for metadata, deliberately hidden state, or DOM
   * multiplicity checks.
   */
  locator(...args: Parameters<Page["locator"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.locator(...args).filter({ visible: true });
  }

  getByTestId(...args: Parameters<Page["getByTestId"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByTestId(...args).filter({ visible: true });
  }

  getByText(...args: Parameters<Page["getByText"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByText(...args).filter({ visible: true });
  }

  getByAltText(...args: Parameters<Page["getByAltText"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByAltText(...args).filter({ visible: true });
  }

  getByLabel(...args: Parameters<Page["getByLabel"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByLabel(...args).filter({ visible: true });
  }

  getByPlaceholder(...args: Parameters<Page["getByPlaceholder"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByPlaceholder(...args).filter({ visible: true });
  }

  getByRole(...args: Parameters<Page["getByRole"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByRole(...args).filter({ visible: true });
  }

  getByTitle(...args: Parameters<Page["getByTitle"]>) {
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Adapter boundary that adds the visible contract.
    return this.page.getByTitle(...args).filter({ visible: true });
  }

  async goto(path: string) {
    await this.page.goto(path);
  }

  /**
   * Clicks through the shared helper, which waits for navigation when the
   * target turns out to be an in-app link. See `tests/_helpers/click.ts`.
   *
   * Specs import `click` directly; POMs use this so they read as `this.click`
   * alongside `this.page`.
   */
  protected async click(...args: Parameters<typeof click>) {
    await click(...args);
  }

  /**
   * Waits until every locator an operation will use has one visible, enabled
   * target. PPR can leave a unique outer container around duplicated controls,
   * so readiness belongs to the controls themselves.
   */
  protected async waitForReady(...locators: Locator[]) {
    await expect.poll(async () => {
      const ready = [];

      for (const locator of locators) {
        if (await locator.count() !== 1) {
          ready.push(false);
          continue;
        }

        const target = locator.first();
        ready.push(
          await target.isVisible()
          && await target.isEnabled()
          && await locator.count() === 1,
        );
      }

      return ready;
    }, {
      message: "Expected each locator to have one visible, enabled target",
    }).toEqual(locators.map(() => true));
  }

  /**
   * What `forbidden()` from `next/navigation` paints, wherever it is called —
   * `src/app/forbidden.tsx`. Lives here because every guarded area shows the
   * same page, and each area's POM asserting its own copy of the wording would
   * mean fixing them all when it changes.
   */
  get oopsHeading() {
    return this.getByRole("heading", {
      name: "Opa! O que você está tentando fazer?",
    });
  }

  get forbiddenMessage() {
    return this.getByText("Você não tem permissão para ver essa página.");
  }
}
