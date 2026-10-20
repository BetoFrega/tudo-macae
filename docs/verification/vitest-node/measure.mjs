import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [phase, sample, directory] = process.argv.slice(2);
if (!["before", "after"].includes(phase) || !/^[1-5]$/.test(sample ?? "") || !directory) {
  throw new Error("Usage: node measure.mjs before|after 1..5 output-directory");
}
{
  const run = Number(sample);
  const results = [];
  for (const tier of ["unit", "integration"]) {
    const prefix = `${directory}/${phase}-${run}-${tier}`;
    const start = performance.now();
    const result = spawnSync("npm", ["run", `test:${tier}`, "--", "--reporter=default", "--reporter=json", `--outputFile.json=${prefix}.json`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(`${prefix}.log`, result.stdout + result.stderr);
    results.push({ tier, durationMs: performance.now() - start, status: result.status });
    console.log(phase, run, results.at(-1));
    if (result.status !== 0) {
      writeFileSync(`${directory}/${phase}-${run}.json`, JSON.stringify(results));
      process.exit(1);
    }
  }
  writeFileSync(`${directory}/${phase}-${run}.json`, JSON.stringify(results));
}
