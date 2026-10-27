import { readFileSync } from "node:fs";
import { E2E_RENDERER_PATH, e2eRenderer, reusedRendererMismatch } from "../../../bin/e2eStack";
import { prepareTestLfsAssets } from "../../../bin/testLfsAssets";
import { appUrl as localAppUrl } from "../../../bin/appPorts";
import { setTestEnvVars } from "../../../bin/setTestEnvVars";
import { extractStaticAssetUrls, firstBrokenAsset } from "../../../bin/staticAssetsCheck";

/**
 * Preflight checks that run once, after `webServer` is up and before any test.
 *
 * Both guard against an environment problem that would otherwise surface
 * as a pile of confusing test failures pointing at application code that is
 * fine.
 */
export default async function globalSetup() {
  setTestEnvVars();
  await prepareTestLfsAssets();
  assertServedRenderer();
  await assertServedBuildIsOnDisk();
}

/** A reused server built by the other renderer would pass every assertion that branches on `E2E_RENDERER`. */
function assertServedRenderer() {
  let recorded: string | undefined;
  try {
    recorded = readFileSync(E2E_RENDERER_PATH, "utf8");
  }
  catch {
    recorded = undefined;
  }
  const mismatch = reusedRendererMismatch(e2eRenderer(), recorded);
  if (mismatch) throw new Error(mismatch);
}

/* -------------------------------------------------------------------------- */
/* Stale `.next/` build                                                       */
/* -------------------------------------------------------------------------- */

const ASSET_FETCH_TIMEOUT_MS = 5_000;

/**
 * `pnpm run build:check` writes into the same `.next/` the running e2e server
 * booted from, deleting the static assets for the build id it holds in
 * memory. The server keeps answering 200 on `/`, so nothing before this point
 * notices — the suite instead fails deep inside a feature test, on a
 * `locator.fill` timeout that names a form field, not a missing chunk.
 *
 * Fetch the home page, collect the `/_next/static/...` URLs it references,
 * and confirm each one is still on disk. A rebuilt-out-from-under-it server
 * now fails once, here, naming the asset and the fix.
 */
async function assertServedBuildIsOnDisk() {
  const appUrl = localAppUrl();
  const html = await (await fetch(appUrl)).text();
  const assetUrls = extractStaticAssetUrls(html);

  const entries = await Promise.all(
    assetUrls.map(async (path) => {
      const response = await fetch(`${appUrl}${path}`, {
        signal: AbortSignal.timeout(ASSET_FETCH_TIMEOUT_MS),
      });
      await response.body?.cancel();
      return [path, response.status] as const;
    }),
  );

  const broken = firstBrokenAsset(new Map(entries));
  if (broken === undefined) return;

  throw new Error(
    `${appUrl}${broken} does not respond 200.\n\n`
    + "The running e2e server's .next/ build was overwritten — typically by "
    + "running `pnpm run build:check` while the e2e server is up — so "
    + "the server is still serving HTML for a build id whose static assets "
    + "are gone.\n\n"
    + "Restart the e2e server:\n\n"
    + "  pnpm run test:e2e",
  );
}
