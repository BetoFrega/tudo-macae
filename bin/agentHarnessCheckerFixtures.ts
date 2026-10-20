import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkAgentHarness } from "./agentHarnessChecker.mjs";
import { expectedScriptNames } from "./scripts-help.mjs";

const localRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const repositoryRoot = process.env.AGENT_HARNESS_SOURCE_ROOT
  ?? localRepositoryRoot;
const fixtureRoots: string[] = [];
export const expectedHash = "67d644e841e5b9701a00f4e1aa03d6d2d6e07ebf8ba042ef70205647042fb082";
export const alteredHash = "5d0c60881dbe41f185d3e260a3622b4133b4784a714bb49d7c49ca9c0c6e8d54";
export const run = promisify(execFile);

export function interceptReadFile(
  beforeRead: (filePath: unknown) => Promise<void> | void,
) {
  return new Proxy(readFile, {
    async apply(target, thisArgument, argumentsList) {
      await beforeRead(argumentsList[0]);
      return Reflect.apply(target, thisArgument, argumentsList);
    },
  });
}

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

export async function createRepositoryFixture() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "agent-harness-"));
  fixtureRoots.push(fixtureRoot);

  await Promise.all([
    mkdir(path.join(fixtureRoot, "tests/e2e/bin"), { recursive: true }),
    mkdir(path.join(fixtureRoot, ".agents", "hooks"), { recursive: true }),
    mkdir(path.join(fixtureRoot, ".agents", "skills"), { recursive: true }),
    mkdir(path.join(fixtureRoot, ".claude", "skills"), { recursive: true }),
    mkdir(path.join(fixtureRoot, ".codex"), { recursive: true }),
    mkdir(path.join(fixtureRoot, "bin"), { recursive: true }),
  ]);

  const hookConfiguration = JSON.stringify({
    hooks: [{ command: `${fixtureRoot}/.agents/hooks/check.sh` }],
  });
  const scripts = Object.fromEntries(
    expectedScriptNames().map(name => [name, "true"]),
  );
  await Promise.all([
    writeFile(path.join(fixtureRoot, "AGENTS.md"), "# Rules\n"),
    writeFile(
      path.join(fixtureRoot, ".agents", "context-retirements.json"),
      JSON.stringify({ retiredReferences: [] }),
    ),
    writeFile(path.join(fixtureRoot, ".agents", "hooks.json"), hookConfiguration),
    writeFile(path.join(fixtureRoot, ".claude", "settings.json"), hookConfiguration),
    writeFile(path.join(fixtureRoot, ".codex", "hooks.json"), hookConfiguration),
    writeFile(
      path.join(fixtureRoot, "package.json"),
      JSON.stringify({ scripts }),
    ),
    writeFile(
      path.join(fixtureRoot, "tests/e2e/playwright.config.ts"),
      "webServer: {\n  command: \"node tests/e2e/bin/e2e-stack.mjs\",\n    stdout: \"pipe\",\n  },\n",
    ),
    writeFile(
      path.join(fixtureRoot, "skills-lock.json"),
      JSON.stringify({ skills: {} }),
    ),
  ]);
  await Promise.all([
    symlink("AGENTS.md", path.join(fixtureRoot, "CLAUDE.md")),
    symlink(
      path.join("..", ".agents", "hooks"),
      path.join(fixtureRoot, ".claude", "hooks"),
    ),
  ]);
  await run("git", ["init", "--quiet"], { cwd: fixtureRoot });
  await run("git", ["add", "."], { cwd: fixtureRoot });

  return fixtureRoot;
}

export function runChecker(lockedSkillsRoot: string, contextRoot?: string) {
  return checkAgentHarness({
    contextRoot: contextRoot ?? repositoryRoot,
    lockedSkillsRoot,
    repositoryRoot,
  });
}

export async function removeFixtureRoots() {
  await Promise.all(
    fixtureRoots.splice(0).map(fixtureRoot => rm(fixtureRoot, {
      force: true,
      recursive: true,
    })),
  );
}
