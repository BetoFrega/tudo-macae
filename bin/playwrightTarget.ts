import { appUrl } from "./appPorts";
import { CANONICAL_APP_ORIGIN } from "./appOrigin";

export function playwrightTarget(env: NodeJS.ProcessEnv = process.env) {
  if (env.E2E_TARGET && env.E2E_TARGET !== "local") {
    throw new Error("E2E exige o ambiente descartável local.");
  }
  return { kind: "local", origin: appUrl(), canonicalOrigin: CANONICAL_APP_ORIGIN } as const;
}
