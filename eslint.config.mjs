import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintPluginBetterTailwindcss from "eslint-plugin-better-tailwindcss";
import eslintParserTypeScript from "@typescript-eslint/parser";
import eslintPluginYml from "eslint-plugin-yml";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import { tailwind4 } from "tailwind-csstree";
import json from "@eslint/json";
import stylistic from "@stylistic/eslint-plugin";
import local from "./eslint-rules/index.js";
import { playwrightConventions } from "./eslint.playwright.mjs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

// `eslint-config-next` ships `settings.react.version: "detect"`, and the
// detection path in eslint-plugin-react 7.x calls the `context.getFilename()`
// method that ESLint 10 removed, which crashes the whole run before any file
// is linted. Reading the installed version here skips detection entirely.
// Drop this once eslint-config-next ships an ESLint 10 compatible
// eslint-plugin-react.
const reactVersion = createRequire(import.meta.url)("react/package.json")
  .version;

// `pnpm run lint`'s ESLint cache re-lints a file only when it or its resolved
// config changes, so inputs from outside the config ride in the settings: the
// Tailwind theme (CSS) and today in UTC (local/no-expired-notes).
const cacheInputs = {
  tailwindTheme: createHash("sha256").update(readFileSync(new URL("src/app/globals.css", import.meta.url)))
    .update(readFileSync(new URL("packages/design-foundations/styles.css", import.meta.url))).digest("hex"),
  expiredNotesDay: new Date().toISOString().slice(0, 10),
};

// A module whose *first* statement is the `"use server"` directive — matching
// the directive node itself rather than `> ExpressionStatement > Literal`,
// which esquery does not resolve through two child combinators inside `:has()`.
const USE_SERVER_MODULE
  = "Program:has(> ExpressionStatement[directive='use server'])";

// Every code file, tests included, stays within 300 lines and 20 KiB. A file
// over either limit is split by responsibility; raising a limit or exempting a
// file would let the oversized modules this gate removed grow back.
const MAX_FILE_LINES = 300;
const MAX_FILE_BYTES = 20 * 1024;

// Cyclomatic complexity per function, classic variant (each `case` counts).
// Raising the cap lets branch-heavy functions grow back.
const MAX_FUNCTION_COMPLEXITY = 10;

const eslintConfig = defineConfig([
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  {
    // Installed agent packages are validated by the harness and their own
    // release process; project lint rules apply only to project-owned source.
    ignores: [
      ".prompts/**",
      ".github/prompts/**",
      ".github/agents/**",
      ".github/skills/**",
      ".agents/**",
      ".claude/worktrees/**",
    ],
  },
  {
    // pnpm owns the lockfile; linting it as YAML only slows every run.
    ignores: ["pnpm-lock.yaml"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ...stylistic.configs.customize({
      indent: 2,
      quotes: "double",
      semi: true,
      jsx: true,
    }),
  },
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      react: { version: reactVersion },
    },
  },
  {
    files: ["**/*.json"],
    language: "json/json",
    plugins: { json },
    rules: {
      "json/no-duplicate-keys": "error",
      "json/no-empty-keys": "error",
    },
  },
  ...eslintPluginYml.configs["flat/recommended"],
  {
    files: [
      "stryker*.config.mjs",
      "package.json",
      ".github/workflows/**/*.{yml,yaml}",
    ],
    plugins: { local },
    rules: {
      "local/no-stryker-ignore-static": "error",
    },
  },
  ...markdown.configs.recommended,
  {
    files: ["**/*.css"],
    language: "css/css",
    languageOptions: {
      customSyntax: tailwind4,
      tolerant: true,
    },
    plugins: { css },
    rules: {
      "css/no-duplicate-imports": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      parser: eslintParserTypeScript,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "better-tailwindcss": eslintPluginBetterTailwindcss,
    },
    rules: {
      ...eslintPluginBetterTailwindcss.configs["recommended"].rules,
      // PostHog excludes elements with this class from autocapture and session replay.
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["^ph-no-capture$"] }],
      "better-tailwindcss/no-deprecated-classes": "error",
      "better-tailwindcss/enforce-consistent-variable-syntax": "error",
      "better-tailwindcss/enforce-shorthand-classes": "error",
      "better-tailwindcss/enforce-consistent-important-position": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          caughtErrors: "all",
          argsIgnorePattern: "^_", // args starting in _ are ignored, like `(_id, slug) => slug`
          caughtErrorsIgnorePattern: "^_", // errors starting in _ are ignored, `try {...} catch (_error) {...}`
          destructuredArrayIgnorePattern: "^_", // destructured array starting in _ are ignored, like `const [_id, slug] = props`
          varsIgnorePattern: "^_", // vars starting in _ are ignored, like `let _id = 'something'`
          ignoreRestSiblings: true, // siblings to ...rest are ignored, like `const { imageUrl, ...propsNoImage } = defaultProps`
        },
      ],
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "src/app/globals.css",
      },
    },
  },
  {
    // Every extension listed here already has its language established by a
    // block above, so this one only adds the rule — flat config merges the two.
    //
    // `eslint-rules` is excluded because the rule's own source and tests are
    // full of example markers with dates in the past; linting them would fail
    // the build permanently.
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx,json,yml,yaml,md,css}"],
    ignores: ["eslint-rules/**"],
    plugins: { local },
    rules: {
      "local/no-expired-notes": ["error", { bumpMonths: 3 }],
    },
    settings: { cacheInputs },
  },
  {
    // Tests assert and fake PostHog request bodies with literal identities on
    // purpose; production code is where a fixed id merges real visitors.
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    ignores: ["eslint-rules/**", "**/*.test.*", "**/tests/**", "tests/**"],
    plugins: { local },
    rules: {
      "local/no-fixed-posthog-distinct-id": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    plugins: { local },
    rules: {
      "max-lines": ["error", { max: MAX_FILE_LINES, skipBlankLines: false, skipComments: false }],
      "local/max-file-bytes": ["error", { max: MAX_FILE_BYTES }],
      "complexity": ["error", { max: MAX_FUNCTION_COMPLEXITY, variant: "classic" }],
    },
  },
  {
    // No other block claims these extensions, so they would fall back to the
    // JavaScript parser and fail on type syntax.
    files: ["**/*.{mts,cts}"],
    languageOptions: { parser: eslintParserTypeScript },
  },
  {
    // The two rules below encode conventions that used to live only in prose,
    // pasted into every ticket. Prose is advice; this is the build.
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    plugins: { local },
    rules: {
      "local/no-portuguese-identifiers": "error",
      "local/no-raw-custom-claims": [
        "error",
        {
          // One entry, and it is the module that reads the current claims and
          // writes them back merged. **It stays at one.** A second means the
          // merge logic was copied, and the next grant silently revokes a role.
          allow: ["src/integrations/authentication/claims.ts"],
        },
      ],
    },
  },
  {
    // Next registers *every* export of a `"use server"` module as a server
    // action, and type-only exports are erased before that indirection is
    // resolved — the generated `.next-internal/**/actions.js` then imports a
    // binding that no longer exists and the whole build fails with
    // `Export <Name> doesn't exist in target module`.
    //
    // Scoped to the module-level directive, not the `actions/` folder: a
    // sibling module without `"use server"` is compiled normally, and this
    // fires the moment someone adds the directive to it.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: [
          "TSTypeAliasDeclaration",
          "TSInterfaceDeclaration",
          "TSEnumDeclaration",
        ]
          .map(decl => `${USE_SERVER_MODULE} > ExportNamedDeclaration > ${decl}`)
          .concat(
            `${USE_SERVER_MODULE} > ExportNamedDeclaration[exportKind='type']`,
            `${USE_SERVER_MODULE} > ExportNamedDeclaration`
            + " > ExportSpecifier[exportKind='type']",
          )
          .join(","),
        message:
          "A \"use server\" module may only export async functions. Next turns "
          + "every export into a server action, and a type export is erased at "
          + "build time, so the generated actions entry references a binding "
          + "that does not exist. Declare the type in the use-case or db module "
          + "and have consumers import it from there.",
      }],
    },
  },
  {
    // The vinext build swaps `@/components/ui/image` for `web-worker/image.tsx`, which
    // builds the srcset vinext omits. A direct `next/image` import skips that swap.
    files: ["src/**/*.{ts,tsx}", "web-worker/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/image.tsx", "web-worker/image.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "next/image",
          message:
            "Import Image from \"@/components/ui/image\". Under vinext a direct "
            + "next/image import calls the loader once, without a srcset, and "
            + "ignores images.loaderFile.",
        }],
      }],
    },
  },
  ...playwrightConventions,
]);

export default eslintConfig;
