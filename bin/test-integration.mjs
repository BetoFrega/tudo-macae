import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_APP_ORIGIN } from "./appOrigin.ts";
import { repositoryRoot } from "./appPorts.ts";
import { setTestEnvVars } from "./setTestEnvVars.ts";

setTestEnvVars();

// Production reads Classifieds and authenticates through the API Worker, so this
// tier always starts its fixture. A fixture that cannot start fails the run.
const environment = { ...process.env };
let fixture;
const publicOrigin = process.env.PUBLIC_APP_ORIGIN ?? CANONICAL_APP_ORIGIN;
const configurationFile = join(repositoryRoot, "test-results/authentication-runtime.json");
mkdirSync(join(repositoryRoot, "test-results"), { recursive: true });
try {
  const { startAuthenticationFixture } = await import("../apps/api-worker/testing.mjs");
  fixture = await startAuthenticationFixture({
    publicOrigin,
    classifiedsQualification: true,
    configurationFile,
  });
}
catch (error) {
  console.error("Falha ambiental: o fixture do API Worker não iniciou.", error);
  process.exit(1);
}
Object.assign(environment, fixture.env, {
  AUTHENTICATION_FIXTURE_CONFIGURATION: configurationFile,
  PUBLIC_APP_ORIGIN: publicOrigin,
  // A loopback authority is accepted only in the test app environment.
  NEXT_PUBLIC_APP_ENV: "test",
});

// `--mutation` runs the integration Stryker tier under the same fixture; Stryker's
// Vitest runners inherit this environment.
const [mode, ...forwarded] = process.argv.slice(2);
const command = mode === "--mutation"
  ? ["node_modules/@stryker-mutator/core/bin/stryker.js", "run", "stryker.integration.config.mjs", ...forwarded]
  : ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.mts", ...process.argv.slice(2)];
const child = spawn(process.execPath, command, { stdio: "inherit", env: environment });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
async function exit(code) {
  await fixture?.close();
  process.exit(code);
}
child.on("error", (error) => {
  console.error(error);
  void exit(1);
});
child.on("exit", code => void exit(code ?? 1));
