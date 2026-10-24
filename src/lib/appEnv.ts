function isDevEnv() {
  return process.env.NODE_ENV === "development";
}

export function isTestEnv() {
  return process.env.NEXT_PUBLIC_APP_ENV === "test";
}

/**
 * Whether this environment may expose dev/test escape hatches — the cache
 * nuke endpoint, a session cookie without `Secure`. Fail-closed: anything that
 * is not explicitly dev or the e2e test build is treated as production.
 */
export function allowsTestAffordances() {
  return isDevEnv() || isTestEnv();
}
