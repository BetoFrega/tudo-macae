import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { deploymentConfiguration } from "./deploy.mjs";
const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", await readFile(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
test("deployment refuses an absent or non-origin Classifieds URL before invoking Wrangler", () => {
  for (const origin of [undefined, "", "http://api.example", "https://api.example/path", "https://api.example/"])
    assert.throws(() => deploymentConfiguration(parsed.config, origin));
});
test("deployment injects the Classifieds origin into the effective production configuration", () => {
  const actual = deploymentConfiguration(parsed.config, "https://api.example");
  assert.equal(actual.env.production.vars.CLASSIFIEDS_ORIGIN, "https://api.example");
  assert.deepEqual(actual.env.production.routes, parsed.config.env.production.routes);
  assert.deepEqual(actual.env.production.services, parsed.config.env.production.services);
});

test("dry-run build alone uses an inert origin when no deployment URL is supplied", () => {
  assert.equal(deploymentConfiguration(parsed.config, undefined, true).env.production.vars.CLASSIFIEDS_ORIGIN, "https://classifieds.invalid");
  assert.throws(() => deploymentConfiguration(parsed.config, undefined, false));
});
