import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAgentHarness } from "./agentHarnessChecker.mjs";
import { runAgentHarnessCli } from "./checkAgentHarnessCli.mjs";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoots: string[] = [];
export const expectedHash = "67d644e841e5b9701a00f4e1aa03d6d2d6e07ebf8ba042ef70205647042fb082";
export const alteredHash = "5d0c60881dbe41f185d3e260a3622b4133b4784a714bb49d7c49ca9c0c6e8d54";

export async function createLockedSkillFixture(contents?: string) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "locked-skill-"));
  fixtureRoots.push(fixtureRoot);

  await writeFile(
    path.join(fixtureRoot, "skills-lock.json"),
    JSON.stringify({
      version: 1,
      skills: {
        "locked-skill": {
          source: "example/skills",
          sourceType: "github",
          skillPath: "skills/locked-skill/SKILL.md",
          computedHash: expectedHash,
        },
      },
    }),
  );

  if (contents !== undefined) {
    const skillDirectory = path.join(
      fixtureRoot,
      ".agents",
      "skills",
      "locked-skill",
    );
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(path.join(skillDirectory, "SKILL.md"), contents);
  }

  return fixtureRoot;
}

export async function createContextFixture(
  files: Record<string, string>,
  retiredReferences: string[] = [],
) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "context-paths-"));
  fixtureRoots.push(fixtureRoot);

  const allFiles = {
    ".agents/context-retirements.json": JSON.stringify({ retiredReferences }),
    ...files,
  };
  await Promise.all(Object.entries(allFiles).map(async ([relativePath, contents]) => {
    const filePath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }));

  return fixtureRoot;
}

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

export async function removeFixtureRoots() {
  await Promise.all(
    fixtureRoots.splice(0).map(fixtureRoot => rm(fixtureRoot, {
      force: true,
      recursive: true,
    })),
  );
}
