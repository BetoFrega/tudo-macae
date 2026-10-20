import { createRequire } from "node:module";
import { repositoryRoot } from "../../../bin/appPorts.ts";

import { playwrightArguments } from "./playwrightArguments.ts";
import { playwrightProcessEnvironment } from "./playwrightProcessEnvironment.ts";
import {
  forwardFirstProcessInterrupt,
  processGroupExitCode,
  spawnProcessGroup,
} from "../../../bin/processGroup.ts";

// The transitional Next app operates from the repository root.
process.chdir(repositoryRoot);

for (const config of ["playwright.harness.config.ts", "playwright.harness-app.config.ts"]) {
  const group = spawnProcessGroup(process.execPath, [
    createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", `--config=tests/e2e/${config}`,
    ...playwrightArguments(process.argv.slice(2)),
  ], { env: playwrightProcessEnvironment(), stdio: "inherit" });
  const { child } = group;
  const forwarding = forwardFirstProcessInterrupt(group);
  let spawnFailed = false;
  const code = await new Promise((resolve) => {
    child.once("error", (error) => {
      spawnFailed = true;
      console.error(error);
    });
    child.once("close", resolve);
  });
  let cleanupFailed = false;
  try {
    await group.terminateAndWait();
    await forwarding.wait();
  }
  catch (error) {
    cleanupFailed = true;
    console.error(error);
  }
  forwarding.dispose();
  const exitCode = processGroupExitCode(code, spawnFailed, cleanupFailed);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}
