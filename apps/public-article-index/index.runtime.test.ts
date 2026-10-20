import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createPublicArticleIndexWorker } from "./index";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const { privateKey, publicKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "google-test", alg: "RS256" }] });
const env = { DB: {} as D1Database, OIDC_AUDIENCE: "https://index.test", OIDC_SERVICE_ACCOUNT: "runtime@example.iam.gserviceaccount.com" };
async function token(overrides: Record<string, unknown> = {}, key = privateKey) {
  return new SignJWT({ email: env.OIDC_SERVICE_ACCOUNT, email_verified: true, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "google-test" }).setIssuer("https://accounts.google.com")
    .setAudience(env.OIDC_AUDIENCE).setSubject("123456").setIssuedAt().setExpirationTime("1h")
    .sign(key);
}
async function response(bearer?: string) {
  return createPublicArticleIndexWorker({ keys }).fetch(new Request("https://index.test/not-found", {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  }), env);
}

test("accepts a Google-signed service identity only for its configured audience", async () => {
  expect((await response(await token())).status).toBe(404);
});

test("denies missing, malformed, wrong-account and unverified identities", async () => {
  for (const value of [undefined, "static-secret", await token({ email: "other@example.iam.gserviceaccount.com" }), await token({ email_verified: false })]) {
    expect((await response(value)).status).toBe(401);
  }
});

test("denies wrong audience, issuer, expired tokens and forged signatures", async () => {
  const forged = await generateKeyPair("RS256");
  for (const value of [
    await new SignJWT({ email: env.OIDC_SERVICE_ACCOUNT, email_verified: true }).setProtectedHeader({ alg: "RS256", kid: "google-test" }).setIssuer("https://accounts.google.com").setAudience("other").setSubject("123").setIssuedAt().setExpirationTime("1h").sign(privateKey),
    await new SignJWT({ email: env.OIDC_SERVICE_ACCOUNT, email_verified: true }).setProtectedHeader({ alg: "RS256", kid: "google-test" }).setIssuer("https://attacker.test").setAudience(env.OIDC_AUDIENCE).setSubject("123").setIssuedAt().setExpirationTime("1h").sign(privateKey),
    await new SignJWT({ email: env.OIDC_SERVICE_ACCOUNT, email_verified: true }).setProtectedHeader({ alg: "RS256", kid: "google-test" }).setIssuer("https://accounts.google.com").setAudience(env.OIDC_AUDIENCE).setSubject("123").setIssuedAt().setExpirationTime(1).sign(privateKey),
    await token({}, forged.privateKey),
  ]) expect((await response(value)).status).toBe(401);
});

test("reports authorization and D1 failures with sanitized scope and cause", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const worker = createPublicArticleIndexWorker({ keys });
  const unauthorized = await worker.fetch(new Request("https://index.test/articles/private-id?private-token=secret"), env);
  expect(unauthorized.status).toBe(401);
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ route: "/articles/:id", statusClass: "4xx", failure: "authorization" });
  await worker.fetch(new Request("https://index.test/articles/another-private-id"), env);
  expect(log).toHaveBeenCalledTimes(1);
  const failed = await worker.fetch(new Request("https://index.test/summaries?at=100", { headers: { "authorization": `Bearer ${await token()}`, "x-request-id": "operation-1" } }), env);
  expect(failed.status).toBe(503);
  expect(JSON.parse(log.mock.calls[1][0])).toMatchObject({ route: "/summaries", statusClass: "5xx", failure: "storage", correlationId: "operation-1" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  log.mockRestore();
});
