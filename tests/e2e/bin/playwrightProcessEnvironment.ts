export function reusePlaywrightServer(env: Record<string, string | undefined> = process.env) {
  return !env.CI && env.E2E_REQUIRE_FRESH_SERVER !== "1";
}

export function playwrightProcessEnvironment(
  source: Record<string, string | undefined> = process.env,
) {
  const env = { ...source };
  delete env.NO_COLOR;
  return env;
}
