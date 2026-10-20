import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-raw-playwright-page-selectors.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaVersion: 2022 } },
});

describe("no-raw-playwright-page-selectors", () => {
  ruleTester.run("page-object mode", rule, {
    valid: [
      {
        code: "class Page { get save() { return this.getByRole('button'); } }",
        options: [{ mode: "page-object" }],
      },
    ],
    invalid: [{
      code: "class Page { get save() { return this.page.getByRole('button'); } }",
      options: [{ mode: "page-object" }],
      errors: [{ messageId: "rawPageObjectSelector" }],
    }],
  });

  ruleTester.run("spec mode", rule, {
    valid: [
      {
        code: "await expect(article.title).toBeVisible();",
        options: [{ mode: "spec" }],
      },
      {
        code: "await expect(page.locator('meta[name=robots]')).toHaveCount(1);",
        options: [{ mode: "spec" }],
      },
      {
        code: "const count = await page.getByTestId('item').count();",
        options: [{ mode: "spec" }],
      },
      {
        code: "await expect(pageObject(page).getByRole('heading')).toBeVisible();",
        options: [{ mode: "spec" }],
      },
    ],
    invalid: [
      {
        code: "await expect(page.getByTestId('preview')).toBeVisible();",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
      {
        code: "await page.getByTestId('title').fill('News');",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
      {
        code: "await expect(page.getByRole('heading')).toBeVisible();",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
      {
        code: "await page.getByLabel('Título').fill('News');",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
      {
        code: "const popupPromise = page.waitForEvent('popup'); const verification = await popupPromise; await expect(verification.getByText('News')).toBeVisible();",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
      {
        code: "await expect(page.getByRole('heading').filter({ visible: true })).toBeVisible();",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
      {
        code: "let verification; verification = await page.waitForEvent('popup'); await verification.getByRole('button').click();",
        options: [{ mode: "spec" }],
        errors: [{ messageId: "rawActionableSelector" }],
      },
    ],
  });
});
