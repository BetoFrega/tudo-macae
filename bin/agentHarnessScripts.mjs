import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expectedScriptNames, REMOVED_SCRIPTS } from "./scripts-help.mjs";

const run = promisify(execFile);

/** `bin/scripts-help.mjs` and `package.json.scripts` must name the same set. */
export async function checkScriptMenu({ failures, readFile, repositoryRoot }) {
  const declared = Object.keys(
    JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).scripts ?? {},
  );
  const listed = expectedScriptNames();

  for (const name of listed) {
    if (!declared.includes(name)) {
      failures.push(`bin/scripts-help.mjs lists ${name}, which package.json does not declare`);
    }
  }
  for (const name of declared) {
    if (!listed.includes(name)) {
      failures.push(`package.json declares ${name}, which bin/scripts-help.mjs does not list`);
    }
  }
}

/**
 * A removed name surviving in a document reads as current advice and fails when
 * run. `bin/scripts-help.mjs` is skipped: it is where the list lives.
 */
const REMOVED_SCRIPTS_DECLARED_IN = "bin/scripts-help.mjs";

export async function checkRemovedScriptNames({ failures, repositoryRoot }) {
  let stdout;
  try {
    ({ stdout } = await run(
      "git",
      ["grep", "-nI", "--fixed-strings", ...REMOVED_SCRIPTS.flatMap(name => ["-e", name])],
      { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 },
    ));
  }
  catch (error) {
  // `git grep` exits 1 with no output when nothing matches, which is the
  // outcome this check wants.
    if (error.code === 1 && !error.stdout) return;
    failures.push(`could not scan for removed script names: ${error.message}`);
    return;
  }

  for (const line of stdout.split("\n").filter(Boolean)) {
    if (line.startsWith(`${REMOVED_SCRIPTS_DECLARED_IN}:`)) continue;
    failures.push(`cites a script that no longer exists — ${line.trim()}`);
  }
}
