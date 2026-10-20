import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, expect, test } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "site-search-runtime-"));
const account = "runtime@example.iam.gserviceaccount.com";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "runtime-test", alg: "RS256" };
let runtime: Miniflare;
let keyRequests = 0;

beforeAll(() => {
  execFileSync(join(process.cwd(), "node_modules/.bin/wrangler"), [
    "deploy", "--dry-run", "--env", "production", "--outdir", directory,
    "--config", "apps/site-search/wrangler.jsonc",
  ], { timeout: 60_000, stdio: "pipe", env: { ...process.env, WRANGLER_LOG_PATH: join(directory, "wrangler.log") } });
  const bundle = readdirSync(directory).find(name => name.endsWith(".js"));
  if (!bundle) throw new Error("Search Worker bundle missing");
  runtime = new Miniflare({ workers: [{
    config: {
      name: "site-search-runtime-test", type: "worker", compatibilityDate: "2026-09-22",
      env: {
        OIDC_AUDIENCE: { type: "json", value: "https://search.test" },
        OIDC_SERVICE_ACCOUNT: { type: "json", value: account },
      },
      manifest: { mainModule: bundle, modulesRoot: directory, modules: {
        [bundle]: { type: "esm", contents: readFileSync(join(directory, bundle), "utf8") },
      } },
    },
    dev: { outboundService: { type: "fetcher", handler: async (request) => {
      if (request.url !== "https://www.googleapis.com/oauth2/v3/certs") throw new Error("Unexpected Worker dependency");
      keyRequests++;
      return Response.json({ keys: [jwk] });
    } } },
  }] });
}, 60_000);
afterAll(async () => {
  await runtime?.dispose();
  rmSync(directory, { recursive: true, force: true });
});

async function signedToken(email = account, audience = "https://search.test") {
  return new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: "runtime-test" })
    .setIssuer("https://accounts.google.com").setAudience(audience)
    .setSubject("123456").setIssuedAt().setExpirationTime("1h").sign(privateKey);
}
async function request(body: unknown, bearer?: string) {
  return runtime.dispatchFetch("https://search.test/search", {
    method: "POST", body: JSON.stringify(body),
    ...(bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {}),
  });
}

test("bundled Worker rejects anonymous HTTP without loading identity keys", async () => {
  const response = await request({ query: "padaria" });
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(keyRequests).toBe(0);
});

test("bundled Worker checks signed runtime authority and audience", async () => {
  expect((await request({ query: "padaria" }, await signedToken("other@example.test"))).status).toBe(401);
  expect((await request({ query: "padaria" }, await signedToken(account, "https://wrong.test"))).status).toBe(401);
  const response = await request({ query: "" }, await signedToken());
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "invalid_query" });
  expect(keyRequests).toBeGreaterThan(0);
});
