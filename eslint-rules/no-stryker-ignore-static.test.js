import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-stryker-ignore-static.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester();

describe("no-stryker-ignore-static", () => {
  ruleTester.run("no-stryker-ignore-static", rule, {
    valid: [
      {
        filename: "stryker.component.config.mjs",
        code: "export default { mutate: ['src/lib/**/*.ts'] };",
      },
      {
        filename: "docs/agents/test-selection.md",
        code: "const note = 'ignoreStatic should stay disabled';",
      },
      {
        filename: "src/lib/example.ts",
        code: "const ignoreStatic = true;",
      },
    ],
    invalid: [
      {
        filename: "stryker.pure.config.mjs",
        code: "export default { ignoreStatic: true };",
        errors: [{ messageId: "forbidden" }],
      },
      {
        filename: "stryker.component.config.mjs",
        code: "export default { ignoreStatic: false };",
        errors: [{ messageId: "forbidden" }],
      },
      {
        filename: "package.json",
        code: "const script = \"stryker run --ignoreStatic\";",
        errors: [{ messageId: "forbidden" }],
      },
      {
        filename: ".github/workflows/mutation.yml",
        code: "const run = \"npx stryker run --ignoreStatic\";",
        errors: [{ messageId: "forbidden" }],
      },
    ],
  });
});
