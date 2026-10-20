import path from "node:path";
import { checkAgentHarness } from "./agentHarnessChecker.mjs";
import { checkImpeccableArtifacts } from "./impeccableArtifacts.mjs";

/**
 * @param {{
 *   commandArguments: string[],
 *   repositoryRoot: string,
 *   checkHarness?: typeof checkAgentHarness,
 *   checkArtifacts?: typeof checkImpeccableArtifacts,
 *   writeStdout?: (value: string) => void,
 *   writeStderr?: (value: string) => void,
 * }} input
 */
export async function runAgentHarnessCli({
  commandArguments,
  repositoryRoot,
  checkHarness = checkAgentHarness,
  checkArtifacts = checkImpeccableArtifacts,
  writeStdout = value => process.stdout.write(value),
  writeStderr = value => process.stderr.write(value),
}) {
  const argumentFailures = [];

  function optionValue(name) {
    const optionIndex = commandArguments.indexOf(name);
    if (optionIndex === -1) return undefined;

    const value = commandArguments[optionIndex + 1];
    if (!value || value.startsWith("--")) {
      argumentFailures.push(`${name} requires a path`);
      return undefined;
    }

    return value;
  }

  const lockedSkillsRoot = optionValue("--locked-skills-root");
  const contextRoot = optionValue("--context-root");
  const artifactsRoot = optionValue("--artifacts-root");
  const checkerResult = await checkHarness({
    contextRoot,
    lockedSkillsRoot,
    repositoryRoot,
  });
  const artifactFailures = await checkArtifacts({
    repositoryRoot: path.resolve(artifactsRoot ?? repositoryRoot),
    staged: commandArguments.includes("--staged"),
  });
  const failures = [
    ...argumentFailures,
    ...checkerResult.failures,
    ...artifactFailures,
  ];

  if (argumentFailures.length === 0
    && checkerResult.ok && artifactFailures.length === 0) {
    writeStdout("Agent harness is consistent.\n");
    return 0;
  }

  writeStderr("Agent harness check failed:\n\n");
  for (const failure of failures) writeStderr(`- ${failure}\n`);
  return 1;
}
