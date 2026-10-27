// The `webServer` command in `playwright.config.ts`: the API Worker fixture,
// then the production build, then the server — one process that dies as a
// unit, and the only deadline over it is Playwright's own `webServer.timeout`.
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_APP_ORIGIN } from "../../../bin/appOrigin.ts";
import {
  E2E_BUILD_LOG_PATH,
  E2E_RENDERER_PATH,
  E2E_SERVER_LOG_PATH,
  TEST_APP_ENV,
  e2eRenderer,
} from "../../../bin/e2eStack.ts";
import { createTestLogSink } from "../../../bin/testLogBudget.ts";
import { appPort, appUrl } from "../../../bin/appPorts.ts";
import { spawnProcessGroup } from "../../../bin/processGroup.ts";
import { setTestEnvVars } from "../../../bin/setTestEnvVars.ts";
import { startSiteSearchFake } from "./siteSearchFake.ts";
import { prepareTestLfsAssets } from "../../../bin/testLfsAssets.ts";

await prepareTestLfsAssets();

const verboseLogs = process.env.E2E_VERBOSE === "1";
mkdirSync(new URL("../test-results/e2e-logs", import.meta.url), {
  recursive: true,
});
// A vinext build writes only `dist/`, so the server log's `.next/` may not exist yet.
mkdirSync(dirname(E2E_SERVER_LOG_PATH), { recursive: true });

let stopping = false;
let failureCode;
const groups = new Set();
const requestedTerminations = [];

function recordCleanupFailure(error) {
  console.error(error);
  if (failureCode === undefined || failureCode === 0) failureCode = 1;
}

// `next start` handles SIGTERM itself and exits 143. Without `stopping`, every
// end of run would report that as a failure and print a stack trace.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    signalGroups(signal);
  });
}

function signalGroups(signal) {
  for (const group of groups) {
    requestedTerminations.push(
      group.terminateAndWait(signal).then(
        value => ({ status: "fulfilled", value }),
        reason => ({ status: "rejected", reason }),
      ),
    );
  }
}

function start(command, args, env, logOptions) {
  const logFile
    = logOptions === undefined ? undefined : openSync(logOptions.path, "w");
  const childEnv = { ...process.env, ...env };
  // Node warns once in every descendant when both are present. FORCE_COLOR is
  // the harness choice, so do not also propagate the contradictory opt-out.
  if (childEnv.FORCE_COLOR !== undefined) delete childEnv.NO_COLOR;
  const group = spawnProcessGroup(command, args, {
    stdio: logFile === undefined ? "inherit" : ["inherit", "pipe", "pipe"],
    env: childEnv,
  });
  const { child } = group;

  if (logFile !== undefined) {
    let artifactReported = false;
    function writeSummary(chunk) {
      if (chunk === `Log completo: ${logOptions.path}\n`) {
        if (artifactReported) return;
        artifactReported = true;
      }
      process.stdout.write(chunk);
    }
    const stdout = createTestLogSink({
      source: logOptions.source,
      summary: { logPath: logOptions.path, writeConsole: writeSummary },
      verbose: verboseLogs,
      writeConsole: chunk => process.stdout.write(chunk),
      writeLog: chunk => writeSync(logFile, chunk),
    });
    const stderr = createTestLogSink({
      source: logOptions.source,
      summary: { logPath: logOptions.path, writeConsole: writeSummary },
      verbose: verboseLogs,
      writeConsole: chunk => process.stderr.write(chunk),
      writeLog: chunk => writeSync(logFile, chunk),
    });
    child.stdout.on("data", chunk => stdout.write(chunk));
    child.stderr.on("data", chunk => stderr.write(chunk));
    child.once("close", () => {
      stdout.end();
      stderr.end();
      closeSync(logFile);
    });
  }

  groups.add(group);
  child.once("error", (error) => {
    console.error(error);
    failureCode ??= 1;
    stopping = true;
    signalGroups("SIGTERM");
  });
  return group;
}

/** Resolves on a clean exit, and on any exit once a signal is taking us down. */
async function completion(group, label, logPath) {
  const code = await new Promise(resolve => group.child.on("close", resolve));
  const primaryError
    = code === 0 || stopping
      ? undefined
      : Object.assign(
          new Error(`${label} → exit ${code}. Log completo: ${logPath}`),
          { exitCode: code ?? 1 },
        );
  if (primaryError !== undefined) failureCode ??= primaryError.exitCode;
  try {
    await group.terminateAndWait();
  }
  catch (cleanupError) {
    if (primaryError === undefined) throw cleanupError;
    throw Object.assign(
      new AggregateError(
        [primaryError, cleanupError],
        `${primaryError.message} Cleanup também falhou.`,
      ),
      { exitCode: primaryError.exitCode },
    );
  }
  groups.delete(group);
  if (primaryError !== undefined) throw primaryError;
}

setTestEnvVars();

// The root vinext build leaves a deploy redirect that nested Wrangler projects reject.
rmSync(new URL("../../../.wrangler/deploy", import.meta.url), { recursive: true, force: true });

// One environment for both children, mirroring what Cloud Run gives the
// deployed app.
//
// `NEXT_PUBLIC_APP_ENV` is load-bearing on the build: the Next config inlines
// `dangerouslyAllowLocalIP` from it, and without it localhost images are
// blocked and the image tests fail without pointing back here. `pnpm run build:check`
// deliberately leaves it unset — its build is not this build.
//
// `PUBLIC_APP_ORIGIN` feeds `metadataBase`, which resolves canonical and og:url
// during prerender for static routes and per request for dynamic ones; the
// suite asserts the production origin.
let authenticationFixture;
const appEnv = {
  NEXT_PUBLIC_APP_ENV: TEST_APP_ENV,
  PUBLIC_APP_ORIGIN: CANONICAL_APP_ORIGIN,
};

try {
  const { startAuthenticationFixture }
    = await import("../../../apps/api-worker/testing.mjs");
  authenticationFixture = await startAuthenticationFixture({
    publicOrigin: CANONICAL_APP_ORIGIN,
    classifiedsQualification: true,
    mediaUploadOrigin: appUrl(),
    offeringFlagHost: process.env.NEXT_PUBLIC_POSTHOG_HOST?.startsWith("https://localhost:") ? process.env.NEXT_PUBLIC_POSTHOG_HOST : undefined,
    configurationFile: fileURLToPath(
      new URL("../test-results/authentication-runtime.json", import.meta.url),
    ),
  });
  // Classifieds always reads the Worker; only authentication follows the opt-in.
  Object.assign(appEnv, authenticationFixture.env);
  // The site search and PostHog reach a loopback fake instead of AI Search and
  // PostHog; see `bin/siteSearchFake.ts`.
  Object.assign(appEnv, (await startSiteSearchFake()).env);
  // Catalog evaluation requires an HTTPS origin.
  if (process.env.NEXT_PUBLIC_POSTHOG_HOST?.startsWith("https://localhost:")) {
    appEnv.NEXT_PUBLIC_POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  }
  // `E2E_RENDERER=vinext` builds and serves the same app as the web Worker in workerd.
  const vinext = e2eRenderer() === "vinext";
  if (vinext) {
    writeFileSync(
      new URL("../../../.dev.vars", import.meta.url),
      Object.entries(appEnv).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join("\n"),
    );
    // The sitemap reads the local article index through its `ARTICLE_INDEX` binding;
    // `vite preview` persists that Worker's D1 under the same `.wrangler/state`.
    const migrationLogPath = fileURLToPath(new URL("../test-results/e2e-logs/article-index-migrations.log", import.meta.url));
    await completion(
      start("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", ".wrangler/state",
        "-c", "apps/public-article-index/wrangler.jsonc"], appEnv, { path: migrationLogPath, source: "build" }),
      "article index migrations",
      migrationLogPath,
    );
  }
  await completion(
    start("pnpm", vinext ? ["exec", "vite", "build", "-c", "vite.vinext.config.ts", "--logLevel", "warn"] : ["exec", "next", "build"], appEnv, {
      path: E2E_BUILD_LOG_PATH,
      source: "build",
    }),
    "next build",
    E2E_BUILD_LOG_PATH,
  );
  if (!stopping) {
    writeFileSync(E2E_RENDERER_PATH, vinext ? "vinext" : "next");
    console.log(
      `\napp  ${appUrl()}  (bundle construído)\n`
      + `logs ${E2E_BUILD_LOG_PATH}, ${E2E_SERVER_LOG_PATH}\n`,
    );
    await completion(
      start(
        vinext ? "pnpm" : process.execPath,
        vinext
          ? ["exec", "vite", "preview", "-c", "vite.vinext.config.ts", "--strictPort", "--port", String(appPort())]
          : ["bin/start-app.mjs", "-p", String(appPort())],
        {
          ...appEnv,
          PUBLIC_ARTICLE_INDEX_URL: "https://article-index.test",
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${new URL("articleIndexTestPreload.mjs", import.meta.url).href}`,
        },
        { path: E2E_SERVER_LOG_PATH, source: "server" },
      ),
      "production server",
      E2E_SERVER_LOG_PATH,
    );
  }
}
catch (error) {
  if (!stopping) {
    console.error(error instanceof Error ? error.message : error);
    failureCode
      ??= error instanceof Error
        && "exitCode" in error
        && typeof error.exitCode === "number"
        ? error.exitCode
        : 1;
  }
  stopping = true;
  signalGroups("SIGTERM");
}
finally {
  await authenticationFixture?.close();
  if (!stopping) {
    stopping = true;
    signalGroups("SIGTERM");
  }
  const directResults = await Promise.allSettled(
    [...groups].map(async (group) => {
      await group.terminateAndWait();
      groups.delete(group);
    }),
  );
  const results = [
    ...(await Promise.all(requestedTerminations)),
    ...directResults,
  ];
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    recordCleanupFailure(result.reason);
  }
  process.exitCode = failureCode ?? 0;
}
