// `npm run dev`: the API Worker fixture plus `next dev` on this worktree's app
// port, with hot reload.
//
// `npx next` directly, never `npm run dev`, which would recurse into this script.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_APP_ORIGIN } from "./appOrigin.ts";
import { appPort, appUrl, linkedWorktreePath, repositoryRoot } from "./appPorts.ts";
import { devAppEnvironment } from "./devEnvironment.ts";
import { disableMetadataServerDetection } from "./metadataServerDetection.ts";
import { conflictReport, findPortConflicts, inspectPort } from "./portGuard.ts";
import {
  forwardProcessGroupSignals,
  processGroupExitCode,
  spawnProcessGroup,
} from "./processGroup.ts";

disableMetadataServerDetection(process.env);

const port = appPort();
const conflicts = await findPortConflicts([port], inspectPort);
if (conflicts.length > 0) {
  console.error(conflictReport(conflicts, repositoryRoot));
  process.exit(1);
}

// Before Next.js prints anything: a linked worktree is unusable if nobody can
// find its app without recomputing the hash by hand.
console.log(
  `Tudo Macaé em ${repositoryRoot}\n`
  + `  ${linkedWorktreePath() === null ? "checkout primário" : "worktree vinculado"}\n`
  + `  app  ${appUrl()}  (hot reload ligado)\n`,
);

const temporaryDirectory = await mkdtemp(join(tmpdir(), "tudomacae-dev-"));

// The app authenticates, reads Classifieds and serves Blog and Media through
// the API Worker, as in production. A fixture that cannot start stops the
// stack. Its databases live in memory, so every boot starts empty and the demo
// seed refills it; `AUTHENTICATION_FIXTURE_CONFIGURATION` is what lets the seed
// run (`src/packages/demo-seed/lib/environment.ts`).
const configurationFile = join(temporaryDirectory, "authentication-runtime.json");
const STOP_SIGNALS = ["SIGINT", "SIGTERM"];
const ownStopListeners = new Map(STOP_SIGNALS.map(signal => [signal, process.listeners(signal)]));
let workerFixture;
try {
  const { startAuthenticationFixture } = await import("../apps/api-worker/testing.mjs");
  workerFixture = await startAuthenticationFixture({
    publicOrigin: CANONICAL_APP_ORIGIN,
    classifiedsQualification: true,
    mediaUploadOrigin: appUrl(),
    configurationFile,
  });
}
catch (error) {
  console.error("O fixture do API Worker não iniciou; o app não sobe sem ele.", error);
  await rm(temporaryDirectory, { recursive: true, force: true });
  process.exit(1);
}

// Miniflare answers SIGINT and SIGTERM with `process.exit` before any later
// listener runs, which would leave `next dev`'s detached process group running
// on the app port. This supervisor owns those signals and closes the fixture
// itself; Miniflare's `exit` hook still disposes its runtime.
for (const signal of STOP_SIGNALS) {
  for (const listener of process.listeners(signal)) {
    if (!ownStopListeners.get(signal).includes(listener)) process.removeListener(signal, listener);
  }
}

const group = spawnProcessGroup("npx", ["next", "dev", "-p", String(port)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...devAppEnvironment(),
    ...workerFixture.env,
    AUTHENTICATION_FIXTURE_CONFIGURATION: configurationFile,
    NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID ?? "development",
  },
});
const { child } = group;
let stopping = false;
const forwarding = forwardProcessGroupSignals(group, () => stopping = true);
let spawnFailed = false;
child.on("error", (error) => {
  spawnFailed = true;
  console.error(error);
});
child.on("close", async (code) => {
  let cleanupFailed = false;
  try {
    // npx may exit before its descendants. Only our process group may be
    // signalled, and its last writer must exit before the fixture closes.
    if (stopping) await forwarding.wait();
    else await group.terminateAndWait();
    await workerFixture.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  catch (error) {
    console.error(error);
    cleanupFailed = true;
  }
  forwarding.dispose();
  // `next dev` exits non-zero on the SIGINT/SIGTERM it was forwarded; a
  // requested stop is a clean exit unless cleanup failed.
  process.exitCode = processGroupExitCode(stopping ? 0 : code, spawnFailed, cleanupFailed);
});
