import { beforeEach, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
beforeEach((context) => {
  if (inWorkers) context.skip();
});

const authenticationId = "00000000-0000-4000-8000-000000000001";
const classifiedsId = "00000000-0000-4000-8000-000000000002";

// Runs deploy.mjs against a fake Wrangler that records into `output` (absent when Wrangler never runs).
function deploy(args: string[], wrangler: string, overrides: Record<string, string | undefined> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "authentication-deployment-test-"));
  try {
    const executable = join(directory, "wrangler");
    const output = join(directory, "output");
    writeFileSync(executable, `#!/usr/bin/env node\nconst fs = require('node:fs');\n${wrangler}\n`);
    chmodSync(executable, 0o755);
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`, DIAGNOSTIC_TEST_OUTPUT: output,
      AUTHENTICATION_D1_ID: authenticationId, CLASSIFIEDS_D1_ID: classifiedsId,
      AUTHENTICATION_API_ORIGIN: "https://api.test", AUTHENTICATION_RUNTIME_ACCOUNT: "fixture@test.iam.gserviceaccount.com" };
    delete env.AUTHENTICATION_DIAGNOSTICS_ENABLED;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../apps/api-worker/deploy.mjs", import.meta.url)), ...args], { encoding: "utf8", env });
    return { ...result, output: existsSync(output) ? readFileSync(output, "utf8") : undefined };
  }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
const recordConfiguration = "fs.copyFileSync(process.argv[process.argv.indexOf('--config') + 1], process.env.DIAGNOSTIC_TEST_OUTPUT);";
const recordInvocation = "fs.appendFileSync(process.env.DIAGNOSTIC_TEST_OUTPUT, process.argv.slice(2, 6).join(' ') + '\\n');";

test.each([
  { environment: "production", override: undefined, enabled: "true" },
  { environment: "qualification", override: undefined, enabled: "false" },
  { environment: "production", override: "false", enabled: "false" },
])("$environment deployment defaults or overrides diagnostics ($override)", ({ environment, override, enabled }) => {
  const result = deploy([environment, "--dry-run"], recordConfiguration, { AUTHENTICATION_DIAGNOSTICS_ENABLED: override, TURNSTILE_ENFORCEMENT: undefined });
  expect(result.status, result.stderr).toBe(0);
  const configuration = JSON.parse(result.output!);
  expect(configuration.env).toBeUndefined();
  expect(configuration.vars.AUTHENTICATION_DIAGNOSTICS_ENABLED).toBe(enabled);
  expect(configuration.observability.head_sampling_rate).toBe(enabled === "true" ? 1 : 0.1);
  // Production enforces Turnstile by default, so its secret must exist before Wrangler deploys.
  expect(configuration.secrets.required).toEqual(environment === "production" ? ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET"] : ["BETTER_AUTH_SECRET"]);
  expect(configuration.observability.logs.invocation_logs).toBe(false);
  expect(configuration.observability.traces.enabled).toBe(false);
  // Hourly Classifieds maintenance: photo sweep and audit expiry.
  expect(configuration.triggers.crons).toEqual(["23 * * * *"]);
  expect(configuration.d1_databases.map(({ binding, database_id, database_name }: Record<string, string>) => ({ binding, database_id, database_name }))).toEqual([
    { binding: "AUTHENTICATION_DB", database_id: authenticationId, database_name: `tudo-macae-authentication-${environment}` },
    { binding: "CLASSIFIEDS_DB", database_id: classifiedsId, database_name: `tudo-macae-classifieds-${environment}` },
  ]);
});

test("a qualification purge zone refuses production hosts and accepts its own", () => {
  const zone = { PUBLIC_IMAGE_PURGE_ZONE_ID: "0".repeat(32) };
  for (const overrides of [{}, { PUBLIC_APP_ORIGIN: "https://qualification.test" }, { PUBLIC_IMAGE_ORIGIN: "https://images.qualification.test" },
    { PUBLIC_APP_ORIGIN: "https://WWW.tudomacae.com.br:443/", PUBLIC_IMAGE_ORIGIN: "https://images.qualification.test" },
    { PUBLIC_APP_ORIGIN: "https://qualification.test", PUBLIC_IMAGE_ORIGIN: "https://images.tudomacae.com.br." }]) {
    const refused = deploy(["qualification", "--dry-run"], recordInvocation, { ...zone, PUBLIC_APP_ORIGIN: undefined, PUBLIC_IMAGE_ORIGIN: undefined, ...overrides });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("requires its own PUBLIC_APP_ORIGIN and PUBLIC_IMAGE_ORIGIN");
    expect(refused.output).toBeUndefined();
  }
  const accepted = deploy(["qualification", "--dry-run"], recordConfiguration, { ...zone, PUBLIC_APP_ORIGIN: "https://qualification.test", PUBLIC_IMAGE_ORIGIN: "https://images.qualification.test" });
  expect(accepted.status, accepted.stderr).toBe(0);
  expect(JSON.parse(accepted.output!).vars).toMatchObject({ PUBLIC_APP_ORIGIN: "https://qualification.test", PUBLIC_IMAGE_ORIGIN: "https://images.qualification.test" });
});

test("rejects an invalid diagnostics override before invoking Wrangler", () => {
  const result = deploy(["production", "--dry-run"], recordInvocation, { AUTHENTICATION_DIAGNOSTICS_ENABLED: "TRUE" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Authentication diagnostics setting must be true or false");
  expect(result.output).toBeUndefined();
});

test.each([undefined, authenticationId])("refuses a missing or shared Classifieds D1 id (%j) before invoking Wrangler", (id) => {
  const result = deploy(["production", "--migrations-only"], recordInvocation, { CLASSIFIEDS_D1_ID: id });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("distinct authentication and Classifieds D1 ids");
  expect(result.output).toBeUndefined();
});

test("applies the authentication and Classifieds migration sequences to their own databases", () => {
  const result = deploy(["production", "--migrations-only"], recordInvocation);
  expect(result.status, result.stderr).toBe(0);
  expect(result.output!.trim().split("\n")).toEqual([
    "d1 migrations apply AUTHENTICATION_DB", "d1 migrations apply CLASSIFIEDS_DB",
  ]);
});

test("binds and migrates the editorial database only when its id is configured", () => {
  const result = deploy(["production", "--migrations-only"], recordInvocation, { EDITORIAL_D1_ID: "00000000-0000-4000-8000-000000000003" });
  expect(result.status, result.stderr).toBe(0);
  expect(result.output!.trim().split("\n")).toEqual([
    "d1 migrations apply AUTHENTICATION_DB", "d1 migrations apply CLASSIFIEDS_DB", "d1 migrations apply EDITORIAL_DB",
  ]);
});

test("refuses an editorial database id that names another context's D1 in other letter case", () => {
  const result = deploy(["production", "--migrations-only"], recordInvocation, {
    AUTHENTICATION_D1_ID: "0000000a-0000-4000-8000-000000000001", EDITORIAL_D1_ID: "0000000A-0000-4000-8000-000000000001" });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/EDITORIAL_D1_ID must be a distinct D1 id/);
  expect(result.output).toBeUndefined();
});

test("binds the supply snapshot bucket in the EU jurisdiction only when one is configured", () => {
  const bound = deploy(["production", "--dry-run"], recordConfiguration, { PDM_EXPORTS_BUCKET: "tudo-macae-pdm-exports" });
  expect(bound.status, bound.stderr).toBe(0);
  expect(JSON.parse(bound.output!).r2_buckets).toEqual([{ binding: "PDM_EXPORTS", bucket_name: "tudo-macae-pdm-exports", jurisdiction: "eu" }]);
  const unbound = deploy(["production", "--dry-run"], recordConfiguration, { PDM_EXPORTS_BUCKET: undefined });
  expect(unbound.status, unbound.stderr).toBe(0);
  expect(JSON.parse(unbound.output!).r2_buckets).toEqual([]);
  const refused = deploy(["production", "--dry-run"], recordInvocation, { PDM_EXPORTS_BUCKET: "Exports_Bucket" });
  expect(refused.status).toBe(1);
  expect(refused.stderr).toContain("PDM_EXPORTS_BUCKET must name an R2 bucket");
  expect(refused.output).toBeUndefined();
});

test("treats empty settings, as Actions passes unset variables, as absent", () => {
  const result = deploy(["production", "--dry-run"], recordConfiguration, {
    AUTHENTICATION_DIAGNOSTICS_ENABLED: "", TURNSTILE_ENFORCEMENT: "", PUBLIC_IMAGE_PURGE_ZONE_ID: "", PUBLIC_APP_ORIGIN: "", PUBLIC_IMAGE_ORIGIN: "", EDITORIAL_D1_ID: "", PDM_EXPORTS_BUCKET: "" });
  expect(result.status, result.stderr).toBe(0);
  const configuration = JSON.parse(result.output!);
  expect(configuration.vars).toMatchObject({ AUTHENTICATION_DIAGNOSTICS_ENABLED: "true", TURNSTILE_ENFORCEMENT: "on",
    PUBLIC_APP_ORIGIN: "https://www.tudomacae.com.br", PUBLIC_IMAGE_ORIGIN: "https://images.tudomacae.com.br" });
  expect(configuration.d1_databases.map(({ binding }: Record<string, string>) => binding)).toEqual(["AUTHENTICATION_DB", "CLASSIFIEDS_DB"]);
  expect(configuration.r2_buckets).toEqual([]);
});

test("tags the published version with the release SHA when one is given", () => {
  const recordArguments = "fs.writeFileSync(process.env.DIAGNOSTIC_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)));";
  const sha = "a".repeat(40);
  const tagged = deploy(["production", "--dry-run"], recordArguments, { RELEASE_SHA: sha });
  expect(tagged.status, tagged.stderr).toBe(0);
  expect(JSON.parse(tagged.output!)).toEqual(["deploy", "--config", expect.any(String), "--tag", sha, "--dry-run"]);
  const untagged = deploy(["production", "--dry-run"], recordArguments, { RELEASE_SHA: undefined });
  expect(JSON.parse(untagged.output!)).not.toContain("--tag");
});
