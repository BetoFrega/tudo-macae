// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import eslintParserTypeScript from "@typescript-eslint/parser";
import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";
import compactFormatter from "./eslint-compact-formatter.mjs";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const repositoryRoot = process.cwd();
const filePath = "tests/density-probe.spec.ts";
const cliFilePath = "tests/density-probe.js";
// The formatter is what these tests cover, so they skip the repository config and load the
// formatter statically: the Workers runtime cannot import files chosen at run time.
const eslint = new ESLint({
  cwd: repositoryRoot,
  overrideConfigFile: true,
  overrideConfig: { files: ["**/*.ts"], languageOptions: { parser: eslintParserTypeScript } },
});

async function formatSource(source: string) {
  const results = await eslint.lintText(source, { filePath });
  const output = compactFormatter(results, { cwd: repositoryRoot, rulesMeta: eslint.getRulesMetaForResults(results) });

  return {
    output,
    payload: JSON.parse(output),
  };
}

function runDiagnosticCli(source: string) {
  return spawnSync(process.execPath, [
    "node_modules/eslint/bin/eslint.js",
    "--no-config-lookup",
    "--rule",
    "no-debugger:error",
    "--format",
    "./bin/eslint-compact-formatter.mjs",
    "--stdin",
    "--stdin-filename",
    cliFilePath,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: source,
    timeout: 15_000,
  });
}

describe("compact ESLint diagnostic", () => {
  test("reports parser findings without embedding source-sized output", async () => {
    const smallSource = "const =;\n";
    const largeSource = `${"// diagnostic padding\n".repeat(5000)}const =;\n`;

    const small = await formatSource(smallSource);
    const large = await formatSource(largeSource);

    expect(small.payload).toMatchObject({
      summary: {
        errors: 1,
        files: 1,
        rules: { "<parser>": 1 },
        warnings: 0,
      },
      findings: [
        {
          column: 6,
          fatal: true,
          filePath,
          line: 1,
          message: expect.any(String),
          ruleId: null,
          severity: "error",
        },
      ],
    });
    expect(large.payload.findings).toHaveLength(1);
    expect(large.payload.findings[0]).toMatchObject({
      filePath,
      line: 5001,
      ruleId: null,
      severity: "error",
    });
    expect(Buffer.byteLength(large.output)).toBeLessThan(
      Buffer.byteLength(small.output) + 100,
    );
    expect(large.output).not.toContain("diagnostic padding");
  }, 60_000);

  test("returns an empty structured diagnostic for clean source", async () => {
    const { payload } = await formatSource("export const value = 1;\n");

    expect(payload).toEqual({
      summary: {
        errors: 0,
        files: 0,
        rules: {},
        warnings: 0,
      },
      findings: [],
    });
  });

  // A hand-built result: configuring a rule runs ESLint's schema validator, which compiles code
  // from strings, and the Workers runtime forbids that.
  test("preserves rule identifiers and warning severity", () => {
    const results = [{
      filePath: path.join(repositoryRoot, filePath),
      messages: [{ ruleId: "no-debugger", severity: 1, message: "Unexpected 'debugger' statement.", line: 2, column: 1 }],
    }] as ESLint.LintResult[];
    const payload = JSON.parse(compactFormatter(results, { cwd: repositoryRoot, rulesMeta: {} }));

    expect(payload).toEqual({
      summary: {
        errors: 0,
        files: 1,
        rules: { "no-debugger": 1 },
        warnings: 1,
      },
      findings: [
        {
          column: 1,
          fatal: false,
          filePath,
          line: 2,
          message: "Unexpected 'debugger' statement.",
          ruleId: "no-debugger",
          severity: "warning",
        },
      ],
    });
  });

  test.skipIf(inWorkers)("preserves ESLint CLI exit codes for clean and invalid source", () => {
    const clean = runDiagnosticCli("export {};\n");
    const invalid = runDiagnosticCli("const =;\n");

    expect(clean.status, clean.stderr).toBe(0);
    expect(JSON.parse(clean.stdout).findings).toEqual([]);
    expect(invalid.status, invalid.stderr).toBe(1);
    expect(JSON.parse(invalid.stdout).findings).toEqual([
      expect.objectContaining({
        ruleId: null,
        severity: "error",
      }),
    ]);
  }, 30_000);
});
