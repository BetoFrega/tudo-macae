import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./max-file-bytes.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester();

describe("max-file-bytes", () => {
  ruleTester.run("max-file-bytes", rule, {
    valid: [
      { code: "const a = 1;", options: [{ max: 12 }] },
      // "é" is two bytes in UTF-8, so this is exactly 12 bytes.
      { code: "const é = 1", options: [{ max: 12 }] },
    ],
    invalid: [
      {
        code: "const ab = 1;",
        options: [{ max: 12 }],
        errors: [{ messageId: "tooLarge", data: { actual: 13, max: 12 } }],
      },
      {
        code: "const é = 1;",
        options: [{ max: 12 }],
        errors: [{ messageId: "tooLarge", data: { actual: 13, max: 12 } }],
      },
    ],
  });
});
