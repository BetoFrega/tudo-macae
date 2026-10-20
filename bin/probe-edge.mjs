// Re-measures the production contracts under `docs/agents/`. Every measurable
// claim they make about the edge is produced by one check here, so the contracts
// can be verified in seconds instead of trusted.
//
// Reads production over the public internet. It changes nothing.
//
// A check reports `value` — asserted against what the document records — and an
// optional `detail`, printed but never asserted. Anything that rotates on its own
// schedule (certificate authority, anycast addresses, cache age) belongs in
// `detail`; otherwise the probe goes red on a renewal instead of on a change.

import { checks } from "./edgeProbeChecks.mjs";
import { DELIVERY_CONTRACT } from "./edgeProbeRequests.mjs";

// A response the edge refused to serve says nothing about the topology. The doc
// records the 403 challenge as a real hazard for automated clients, so it is
// reported as a failed measurement, never as a change in production.
function unmeasurable(error) {
  if (error.name === "TimeoutError") return "timed out";
  if (error.message.includes("fetch failed")) return "no route to production";
  return error.message;
}

const results = [];
for (const check of checks) {
  try {
    results.push({ check, ...await check.measure() });
  }
  catch (error) {
    results.push({ check, error: unmeasurable(error) });
  }
}

const width = Math.max(...checks.map(check => check.id.length));
const pad = " ".repeat(width + 6);
const drifted = [];
const unmeasured = [];

console.log(`Production edge probe · ${new Date().toISOString()}\n`);
for (const { check, value, detail, error } of results) {
  if (error) {
    unmeasured.push(check);
    console.log(`${"ERR".padEnd(5)} ${check.id.padEnd(width)}  could not measure: ${error}`);
    continue;
  }
  const matches = value === check.expected;
  if (!matches) drifted.push(check);
  console.log(
    `${(matches ? "ok" : "DRIFT").padEnd(5)} ${check.id.padEnd(width)}  ${value}${detail ? `  (${detail})` : ""}`,
  );
  if (!matches) {
    console.log(`${pad}  recorded: ${check.expected}`);
    console.log(`${pad}  claim:    ${check.claim}`);
    console.log(`${pad}  contract: ${check.contract ?? DELIVERY_CONTRACT}`);
  }
}

if (unmeasured.length > 0) {
  console.error(
    `\n${unmeasured.length} check(s) could not be measured. This says nothing about production —`,
  );
  console.error(
    "the usual causes are no network and Cloudflare challenging an automated client with a 403.",
  );
}
if (drifted.length > 0) {
  console.error(
    `\n${drifted.length} measurement(s) no longer match the recorded production contracts.`,
  );
  console.error("Production changed, or a contract is stale. Update the responsible contract.");
}
// Two kinds of failure, two exit codes, because automation has to treat them
// differently: drift is a finding that needs a person, while an unmeasurable run
// is the instrument failing and must never raise one. Drift wins when both
// happen — a real change is the more important of the two.
if (drifted.length > 0) {
  process.exitCode = 1;
}
else if (unmeasured.length > 0) {
  process.exitCode = 2;
}
else {
  console.log("\nProduction matches the recorded delivery contracts.");
}
