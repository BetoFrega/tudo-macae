import { afterAll, afterEach, beforeAll, vi } from "vitest";
import z from "zod";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Miniflare, Response as RuntimeResponse } from "miniflare";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let runtime: Miniflare | undefined;
let runtimeOptions: ConstructorParameters<typeof Miniflare>[0];
let directory: string | undefined;
export let serviceToken: (overrides?: {
  email?: string;
  audience?: string;
  expiration?: string;
}) => Promise<string>;
export function authenticationDatabase() {
  return runtime!.getD1Database("AUTHENTICATION_DB");
}
export function classifiedsDatabase() {
  return runtime!.getD1Database("CLASSIFIEDS_DB");
}
export function editorialDatabase() {
  return runtime!.getD1Database("EDITORIAL_DB");
}
export const emails: { to: string; text: string }[] = [];
// A delayed delivery outlives its test; only mail from the current start() reaches `emails`.
let mailbox = 0;

export function registerAuthenticationRuntime() {
  afterEach(async () => {
    vi.restoreAllMocks();
    await runtime?.dispose();
  });
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "authentication-worker-"));
    execFileSync(
      "npm",
      [
        "run",
        "build",
        "--workspace=@tudomacae/api-worker",
        "--",
        "--outdir",
        directory,
        "--entry",
        "tests/fixtureWorker.ts",
      ],
      { stdio: "pipe" },
    );
  });
}

// Reboots the Worker over the persisted state of the last start(), simulating recovery after a cut.
export function restartRuntime() {
  runtime = new Miniflare(runtimeOptions);
  return runtime;
}

export async function disposeRuntime() {
  await runtime?.dispose();
  runtime = undefined;
}

export const siteverifyRequests: URLSearchParams[] = [];
/** Every outbound request other than siteverify; the fixture answers each with 503. */
export const unexpectedOutboundRequests: string[] = [];
const challengeEnforcement = (enforced: boolean) => (enforced ? "on" : "off");

// D1 exec requires each complete statement/trigger on one line.
async function applyMigrations(target: Miniflare, folder: string) {
  for (const [binding, migrations] of [["AUTHENTICATION_DB", "migrations"], ["CLASSIFIEDS_DB", "migrations-classifieds"], ["EDITORIAL_DB", "migrations-editorial"]] as const) {
    const database = await target.getD1Database(binding);
    for (const file of (await readdir(join(folder, migrations))).filter(file => file.endsWith(".sql")).sort())
      await database.exec(await readFile(join(folder, migrations, file), "utf8"));
  }
}

function serviceTokenSigner(privateKey: CryptoKey): typeof serviceToken {
  return (overrides = {}) =>
    new SignJWT({
      email: overrides.email ?? "runtime@test.iam.gserviceaccount.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "RS256", kid: "service-test" })
      .setIssuer("https://accounts.google.com")
      .setAudience(overrides.audience ?? "http://authentication.test")
      .setSubject("runtime-test")
      .setIssuedAt()
      .setExpirationTime(overrides.expiration ?? "5m")
      .sign(privateKey);
}

export async function start(activate = true, classifiedsQualification = false, humanChallenge = false) {
  siteverifyRequests.length = 0;
  unexpectedOutboundRequests.length = 0;
  emails.length = 0;
  const generation = ++mailbox;
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const keys = {
    keys: [
      { ...(await exportJWK(publicKey)), kid: "service-test", alg: "RS256" },
    ],
  };
  serviceToken = serviceTokenSigner(privateKey);
  if (!directory) throw new Error("Worker fixture missing");
  const bundle = (await readdir(directory)).find(name =>
    name.endsWith(".js"),
  );
  if (!bundle) throw new Error("Worker bundle missing");
  runtimeOptions = {
    resourcePersistencePath: join(directory, crypto.randomUUID()),
    workers: [
      {
        config: {
          name: "authentication-test",
          compatibilityDate: "2026-09-25",
          compatibilityFlags: ["nodejs_compat"],
          env: {
            CLASSIFIEDS_QUALIFICATION: { type: "json", value: classifiedsQualification ? "d1" : "off" },
            WORKERS_ENVIRONMENT: { type: "json", value: "production" },
            TEST_SERVICE_KEYS: { type: "json", value: keys },
            OIDC_AUDIENCE: {
              type: "json",
              value: "http://authentication.test",
            },
            OIDC_SERVICE_ACCOUNT: {
              type: "json",
              value: "runtime@test.iam.gserviceaccount.com",
            },
            MAILBOX: {
              type: "fetcher",
              handler: async (request) => {
                const mail = z
                  .object({ to: z.string(), text: z.string() })
                  .parse(await request.json());
                if (mail.to === "delivery-failed@example.com")
                  return new RuntimeResponse(null, { status: 500 });
                if (mail.to === "delivery-slow@example.com")
                  await new Promise(resolve => setTimeout(resolve, 6000));
                if (generation === mailbox) emails.push(mail);
                return new RuntimeResponse(null, { status: 200 });
              },
            },
            AUTHENTICATION_DB: { type: "d1", id: "authentication-test" },
            CLASSIFIEDS_DB: { type: "d1", id: "authentication-classifieds-test" },
            PHOTOS: { type: "r2", name: "classifieds-photos" },
            EDITORIAL_DB: { type: "d1", id: "authentication-editorial-test" },
            MEDIA_HOSTED: { type: "r2", name: "media-hosted" },
            IMAGES: { type: "images" },
            PUBLIC_APP_ORIGIN: {
              type: "json",
              value: "http://authentication.test",
            },
            BETTER_AUTH_SECRET: {
              type: "json",
              value: "disposable-test-secret-longer-than-thirty-two-characters",
            },
            EMAIL_FROM: { type: "json", value: "conta@tudomacae.com.br" },
            TURNSTILE_ENFORCEMENT: { type: "json", value: challengeEnforcement(humanChallenge) },
            TURNSTILE_SECRET: { type: "json", value: "disposable-turnstile-secret" },
          },
          manifest: {
            mainModule: bundle,
            modules: {
              [bundle]: {
                contents: await readFile(join(directory, bundle), "utf8"),
                type: "esm",
              },
            },
            modulesRoot: directory,
          },
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: async (request) => {
              if (new URL(request.url).hostname === "challenges.cloudflare.com")
                return siteverify(new URLSearchParams(await request.text()));
              unexpectedOutboundRequests.push(request.url);
              return new RuntimeResponse(null, { status: 503 });
            },
          },
        },
      },
    ],
  };
  runtime = new Miniflare(runtimeOptions);
  await applyMigrations(runtime, directory);
  const database = await runtime.getD1Database("AUTHENTICATION_DB");
  if (activate)
    await database
      .prepare(
        "UPDATE authentication_authority SET phase='active' WHERE singleton=1",
      )
      .run();
  return runtime;
}

// Fixture tokens read as "<action>@<hostname>"; "unreachable", "internal-error" and "bad-request" simulate siteverify outages.
function siteverify(form: URLSearchParams) {
  siteverifyRequests.push(form);
  const token = form.get("response") ?? "";
  if (token === "unreachable") return new RuntimeResponse(null, { status: 503 });
  if (token === "internal-error" || token === "bad-request")
    return new RuntimeResponse(JSON.stringify({ "success": false, "error-codes": [token] }), { headers: { "content-type": "application/json" } });
  const [action, hostname] = token.split("@");
  const success = form.get("secret") === "disposable-turnstile-secret" && hostname !== undefined;
  return new RuntimeResponse(JSON.stringify({ success, action, hostname }), { headers: { "content-type": "application/json" } });
}
