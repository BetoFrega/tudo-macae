import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const directory = process.argv[2] ?? "/tmp/issue680";
const tiers = ["unit", "integration"];
const addedNames = new Set([
  "runs unannotated tests without browser globals",
  "defaults every ordinary entrypoint to Node",
  "requires explicit DOM opt-in and keeps server integration in Node",
]);
function inventory(phase, run) {
  const files = [];
  const cases = [];
  const additions = [];
  for (const tier of tiers) {
    const report = JSON.parse(readFileSync(`${directory}/${phase}-${run}-${tier}.json`, "utf8"));
    assert.equal(report.success, true);
    assert.equal(report.numFailedTests, 0);
    for (const file of report.testResults) {
      // Both phases run from the same worktree. Drop only that absolute prefix.
      const name = path.relative(process.cwd(), file.name);
      files.push(`${tier}:${name}`);
      for (const test of file.assertionResults) {
        const entry = `${tier}:${name}:${test.fullName}:${test.status}`;
        if (phase === "after" && name === "bin/ordinaryTestCollection.test.ts" && addedNames.has(test.fullName)) {
          assert.equal(test.status, "passed");
          additions.push(test.fullName);
        }
        else cases.push(entry);
      }
    }
  }
  if (phase === "after") assert.deepEqual(additions.sort(), [...addedNames].sort());
  return { files: files.sort(), cases: cases.sort() };
}
const baseline = inventory("before", 1);
const summary = {};
for (const phase of ["before", "after"]) {
  const runs = [];
  for (let run = 1; run <= 5; run++) {
    assert.deepEqual(inventory(phase, run), baseline, `${phase} ${run}: collection or status changed`);
    const timings = JSON.parse(readFileSync(`${directory}/${phase}-${run}.json`, "utf8"));
    assert.deepEqual(timings.map(result => result.tier), tiers);
    assert(timings.every(result => result.status === 0));
    const setup = tiers.map((tier) => {
      const log = readFileSync(`${directory}/${phase}-${run}-${tier}.log`, "utf8");
      const match = log.match(/Duration[^\n]*setup ([\d.]+)(ms|s)[^\n]*environment ([\d.]+)(ms|s)/);
      assert(match, "missing setup and environment durations");
      return { setupMs: Number(match[1]) * (match[2] === "s" ? 1000 : 1), environmentMs: Number(match[3]) * (match[4] === "s" ? 1000 : 1) };
    });
    runs.push({ durationMs: timings.reduce((sum, result) => sum + result.durationMs, 0), setupMs: setup.reduce((sum, result) => sum + result.setupMs, 0), environmentMs: setup.reduce((sum, result) => sum + result.environmentMs, 0) });
  }
  // Nearest-rank percentiles: with five observations P90 is the maximum.
  const percentiles = Object.fromEntries(["durationMs", "setupMs", "environmentMs"].map((key) => {
    const sorted = runs.map(run => run[key]).sort((a, b) => a - b);
    return [key, Object.fromEntries([50, 75, 90].map(percentile => [`p${percentile}`, sorted[Math.ceil(percentile / 100 * sorted.length) - 1]]))];
  }));
  summary[phase] = { runs, percentiles };
}
summary.collection = { files: baseline.files.length, cases: baseline.cases.length, nonPassing: baseline.cases.filter(test => !test.endsWith(":passed")).length, sha256: createHash("sha256").update(JSON.stringify(baseline)).digest("hex"), addedContractTests: [...addedNames] };
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
