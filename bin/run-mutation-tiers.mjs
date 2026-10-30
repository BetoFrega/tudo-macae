import { spawn } from "node:child_process";
import {
  summarizeMutationTierRuns,
  unitMutationTiers,
} from "./mutationTiers.ts";

function runTier(tierName) {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", `test:mutation:${tierName}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      output += `\nFailed to run mutation tier ${tierName}: ${error.message}\n`;
      resolve({ tierName, exitCode: 1, output });
    });

    child.on("close", (code) => {
      resolve({ tierName, exitCode: code ?? 1, output });
    });
  });
}

const runs = await Promise.all(unitMutationTiers.map(tier => runTier(tier.name)));
const summary = summarizeMutationTierRuns(runs);

for (const run of summary.orderedRuns) {
  console.log(`\n=== Mutation tier: ${run.tierName} ===\n`);
  process.stdout.write(run.output);
  if (!run.output.endsWith("\n")) console.log();
}

process.exit(summary.exitCode);
