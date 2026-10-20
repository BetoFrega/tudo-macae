import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentHarnessCli } from "./checkAgentHarnessCli.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
process.exitCode = await runAgentHarnessCli({
  commandArguments: process.argv.slice(2),
  repositoryRoot,
});
