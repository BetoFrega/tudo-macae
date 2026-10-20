import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { runtimeDeploymentId } from "./runtimeDeployment.ts";

const routesManifest = JSON.parse(
  await readFile(new URL("../.next/routes-manifest.json", import.meta.url), "utf8"),
);
const deploymentId = runtimeDeploymentId(process.env, routesManifest.deploymentId ?? "");

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_DEPLOYMENT_ID: deploymentId },
  },
);

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", code => process.exit(stopping ? 0 : code ?? 1));
