import { Miniflare, Response as RuntimeResponse } from "miniflare";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { execFileSync } from "node:child_process";
import { createFixtureController } from "./testingController.mjs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
/** Each context's D1 database applies its own migration sequence (docs/adr/0045-separate-api-worker-databases.md). */
async function migrateDatabases(runtime, directory) {
  for (const [binding, migrations] of [["AUTHENTICATION_DB", "migrations"], ["CLASSIFIEDS_DB", "migrations-classifieds"], ["EDITORIAL_DB", "migrations-editorial"]]) {
    const migrated = await runtime.getD1Database(binding);
    for (const file of (await readdir(join(directory, migrations))).filter(file => file.endsWith(".sql")).sort())
      await migrated.exec(await readFile(join(directory, migrations, file), "utf8"));
  }
}
/** Blog and Media over the editorial D1, with Hosted Images faked on R2 as in the runtime tests. */
function editorialBindings(mediaUploadOrigin, publicOrigin) {
  return {
    EDITORIAL_DB: { type: "d1", id: "editorial-e2e" },
    MEDIA_HOSTED: { type: "r2", name: "editorial-media" },
    // The browser uploads to the app it is on, which is not the canonical origin outside production.
    MEDIA_UPLOAD_ORIGIN: { type: "json", value: mediaUploadOrigin ?? publicOrigin },
  };
}
export async function startAuthenticationFixture({
  publicOrigin,
  configurationFile,
  classifiedsQualification = false,
  offeringFlagHost,
  mediaUploadOrigin,
}) {
  const directory = await mkdtemp(join(tmpdir(), "authentication-e2e-"));
  let runtime;
  let controller;
  const messages = [];
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  try {
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
    const bundle = (await readdir(directory)).find(name =>
      name.endsWith(".js"),
    );
    if (!bundle) throw new Error("Authentication fixture bundle missing");
    const options = {
      workers: [
        {
          config: {
            name: "authentication-e2e",
            compatibilityDate: "2026-09-25",
            compatibilityFlags: ["nodejs_compat"],
            env: {
              CLASSIFIEDS_QUALIFICATION: { type: "json", value: classifiedsQualification ? "d1" : "off" },
              TEST_SERVICE_KEYS: {
                type: "json",
                value: {
                  keys: [
                    {
                      ...(await exportJWK(publicKey)),
                      kid: "fixture",
                      alg: "RS256",
                    },
                  ],
                },
              },
              OIDC_AUDIENCE: { type: "json", value: "pending" },
              OIDC_SERVICE_ACCOUNT: {
                type: "json",
                value: "fixture@test.iam.gserviceaccount.com",
              },
              OFFERING_FLAGS: {
                type: "fetcher",
                handler: async (request) => {
                  if (!offeringFlagHost) return new RuntimeResponse(null, { status: 503 });
                  const response = await fetch(new URL(new URL(request.url).pathname + new URL(request.url).search, offeringFlagHost), { method: request.method, headers: request.headers, body: await request.text(), signal: AbortSignal.timeout(1500) });
                  return new RuntimeResponse(await response.text(), { status: response.status, headers: response.headers });
                },
              },
              MAILBOX: {
                type: "fetcher",
                handler: async (request) => {
                  messages.push(await request.json());
                  return new RuntimeResponse(null, { status: 200 });
                },
              },
              AUTHENTICATION_DB: { type: "d1", id: "authentication-e2e" },
              CLASSIFIEDS_DB: { type: "d1", id: "classifieds-e2e" },
              ...editorialBindings(mediaUploadOrigin, publicOrigin),
              IMAGES: { type: "images" },
              ...(classifiedsQualification ? { PHOTOS: { type: "r2", name: "classifieds-photos" } } : {}),
              PUBLIC_APP_ORIGIN: { type: "json", value: publicOrigin },
              BETTER_AUTH_SECRET: {
                type: "json",
                value: "disposable-authentication-e2e-secret-only",
              },
              EMAIL_FROM: { type: "json", value: "conta@tudomacae.com.br" },
              // Fixture sign-ups carry no Turnstile token; any other value enforces it.
              TURNSTILE_ENFORCEMENT: { type: "json", value: "off" },
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
        },
      ],
    };
    runtime = new Miniflare(options);
    const origin = (await runtime.ready).origin;
    options.port = Number(new URL(origin).port);
    options.workers[0].config.env.OIDC_AUDIENCE.value = origin;
    await runtime.setOptions(options);
    await migrateDatabases(runtime, directory);
    const database = await runtime.getD1Database("AUTHENTICATION_DB");
    await database
      .prepare(
        "UPDATE authentication_authority SET phase='active' WHERE singleton=1",
      )
      .run();
    const serviceToken = await new SignJWT({
      email: "fixture@test.iam.gserviceaccount.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer("https://accounts.google.com")
      .setAudience(origin)
      .setSubject("fixture")
      .setIssuedAt()
      // The signing key exists only in this process, so the token cannot
      // outlive the fixture; a shorter expiry would break a long `npm run dev`.
      .setExpirationTime("30d")
      .sign(privateKey);
    controller = createFixtureController({
      runtime,
      database,
      classifiedsDatabase: await runtime.getD1Database("CLASSIFIEDS_DB"),
      editorialDatabase: await runtime.getD1Database("EDITORIAL_DB"),
      origin,
      publicOrigin,
      classifiedsQualification,
      messages,
    });
    await new Promise((resolve, reject) => {
      controller.once("error", reject);
      controller.listen(0, "127.0.0.1", resolve);
    });
    const controllerOrigin = `http://127.0.0.1:${controller.address().port}`;
    const environment = {
      AUTHENTICATION_API_URL: origin,
      AUTHENTICATION_TEST_SERVICE_TOKEN: serviceToken,
    };
    await writeFile(
      configurationFile,
      JSON.stringify({ controllerOrigin, ...environment }),
      { mode: 0o600 },
    );
    return {
      env: environment,
      async close() {
        await new Promise(resolve => controller.close(resolve));
        await runtime.dispose();
        await rm(directory, { recursive: true, force: true });
        await rm(configurationFile, { force: true });
      },
    };
  }
  catch (error) {
    if (controller) await new Promise(resolve => controller.close(resolve));
    await runtime?.dispose();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
