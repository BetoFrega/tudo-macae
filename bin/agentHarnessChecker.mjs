import { readFile as readFileFromFileSystem } from "node:fs/promises";
import path from "node:path";
import { checkArchitectureRecords } from "./architectureRecords.mjs";
import { checkInternalMarkdownPointers } from "./agentHarnessContextPointers.mjs";
import { checkE2eSupervisorOutputIsPiped } from "./agentHarnessE2e.mjs";
import { exists, expectSymlink } from "./agentHarnessFiles.mjs";
import { checkHooks } from "./agentHarnessHooks.mjs";
import { checkRemovedScriptNames, checkScriptMenu } from "./agentHarnessScripts.mjs";
import { checkLockedSkills, checkSkills } from "./agentHarnessSkills.mjs";

/**
 * @param {{
 *   contextRoot?: string,
 *   lockedSkillsRoot?: string,
 *   readFile?: typeof readFileFromFileSystem,
 *   repositoryRoot: string,
 * }} options
 * @returns {Promise<{ failures: string[], ok: boolean }>}
 */
export async function checkAgentHarness({
  contextRoot: requestedContextRoot,
  lockedSkillsRoot: requestedLockedSkillsRoot,
  readFile: requestedReadFile,
  repositoryRoot,
}) {
  const failures = [];
  const readFile = requestedReadFile ?? readFileFromFileSystem;

  const lockedSkillsRoot = path.resolve(
    requestedLockedSkillsRoot ?? repositoryRoot,
  );
  const contextRoot = path.resolve(
    requestedContextRoot ?? repositoryRoot,
  );

  // Every check appends to the same `failures` list, in this order.
  const context = {
    contextRoot,
    failures,
    lockedSkillsRoot,
    readFile,
    repositoryRoot,
  };

  await expectSymlink(context, "CLAUDE.md", "AGENTS.md");
  if (await exists(path.join(repositoryRoot, ".agent"))) {
    failures.push("legacy .agent directory must not exist");
  }
  await checkSkills(context);
  await checkLockedSkills(context);
  await checkHooks(context);
  await checkScriptMenu(context);
  await checkRemovedScriptNames(context);
  await checkE2eSupervisorOutputIsPiped(context);
  await checkInternalMarkdownPointers(context);
  failures.push(...await checkArchitectureRecords({ contextRoot, readFile }));

  return {
    failures,
    ok: failures.length === 0,
  };
}
