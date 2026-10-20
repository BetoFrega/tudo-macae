import { createServer } from "node:https";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { forwardFirstProcessInterrupt, processGroupExitCode, spawnProcessGroup } from "../../../bin/processGroup.ts";

process.chdir(fileURLToPath(new URL("../../..", import.meta.url)));

const [script, ...playwrightArguments] = process.argv.slice(2);
if (script !== "test:e2e") throw new Error("Use test:e2e -- <Playwright arguments>.");
if (playwrightArguments[0] === "--") playwrightArguments.shift();

// A real HTTPS provider exercises production composition without test switches.
const directory = mkdtempSync(join(tmpdir(), "offering-flags-"));
const key = join(directory, "key.pem");
const certificate = join(directory, "cert.pem");
copyFileSync(new URL("../fixtures/offering-catalog-provider/key.pem", import.meta.url), key);
copyFileSync(new URL("../fixtures/offering-catalog-provider/cert.pem", import.meta.url), certificate);
const decisions = new Map();
const pending = new Set();
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

function answerControl(input, response) {
  if (input.decision) decisions.set(input.businessId, input.decision);
  response.end(JSON.stringify({ pending: pending.has(input.businessId) }));
}

async function answerFlags(input, response) {
  const businessId = input.person_properties?.business_id;
  const decision = decisions.get(businessId) ?? "disabled";
  if (decision === "slow") {
    pending.add(businessId);
    response.once("close", () => pending.delete(businessId));
    await new Promise(resolve => setTimeout(resolve, 2500));
    if (response.destroyed) return;
  }
  if (decision === "unavailable") {
    response.statusCode = 503;
    response.end("{}");
    return;
  }
  response.end(JSON.stringify({ flags: {
    "business-offering-catalog": { enabled: decision === "enabled", reason: { code: decision === "outside_audience" ? "no_condition_match" : "condition_match" } },
    "authentication-render-session-sharing": { enabled: true },
    "business-registration-visibility": { enabled: true },
  } }));
}

const server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, async (request, response) => {
  if (request.url !== "/control" && !request.url?.startsWith("/flags")) {
    response.setHeader("content-type", "application/json");
    response.end("{}");
    return;
  }
  const input = await readJsonBody(request);
  response.setHeader("content-type", "application/json");
  if (request.url === "/control") return answerControl(input, response);
  await answerFlags(input, response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const group = spawnProcessGroup(process.execPath, ["tests/e2e/bin/playwright.mjs", ...playwrightArguments], { stdio: "inherit", env: { ...process.env, E2E_REQUIRE_FRESH_SERVER: "1", NEXT_PUBLIC_POSTHOG_HOST: `https://localhost:${port}`, NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "catalog-provider-fixture", NODE_EXTRA_CA_CERTS: certificate } });
const forwarding = forwardFirstProcessInterrupt(group);
let spawnFailed = false;
group.child.once("error", (error) => {
  spawnFailed = true;
  console.error(error);
});
const code = await new Promise(resolve => group.child.once("close", resolve));
let cleanupFailed = false;
try {
  await group.terminateAndWait();
  await forwarding.wait();
}
catch (error) {
  cleanupFailed = true;
  console.error(error);
}
forwarding.dispose();
await new Promise(resolve => server.close(resolve));
rmSync(directory, { recursive: true });
process.exitCode = forwarding.interrupted && !spawnFailed && !cleanupFailed
  ? 130
  : processGroupExitCode(code, spawnFailed, cleanupFailed);
