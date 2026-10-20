import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-positional-playwright-locators.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester();

describe("no-positional-playwright-locators", () => {
  ruleTester.run("no-positional-playwright-locators", rule, {
    valid: [
      { code: "await expect(profile.contactAt(0)).toHaveValue('phone');" },
      { code: "await expect(article.title).toBeVisible();" },
    ],
    invalid: [
      {
        code: "await expect(profile.contacts.first()).toBeVisible();",
        errors: [{ messageId: "positionalSelector", data: { method: "first" } }],
      },
      {
        code: "await click(queue.last());",
        errors: [{ messageId: "positionalSelector", data: { method: "last" } }],
      },
      {
        code: "await fields.nth(2).fill('value');",
        errors: [{ messageId: "positionalSelector", data: { method: "nth" } }],
      },
    ],
  });
});
