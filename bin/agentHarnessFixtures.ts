import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAgentHarness } from "./agentHarnessChecker.mjs";
import { runAgentHarnessCli } from "./checkAgentHarnessCli.mjs";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function runHarness(lockedSkillsRoot: string, contextRoot?: string) {
  const contextArguments = contextRoot === undefined
    ? []
    : ["--context-root", contextRoot];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = await runAgentHarnessCli({
    commandArguments: [
      "--locked-skills-root",
      lockedSkillsRoot,
      ...contextArguments,
    ],
    checkArtifacts: async () => [],
    checkHarness: checkAgentHarness,
    repositoryRoot,
    writeStderr: value => stderr.push(value),
    writeStdout: value => stdout.push(value),
  });
  return { status, stderr: stderr.join(""), stdout: stdout.join("") };
}
