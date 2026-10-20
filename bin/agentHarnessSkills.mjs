import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { expectSymlink } from "./agentHarnessFiles.mjs";

function frontmatterValue(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*["']?([^\\n"']+)`, "m"));
  return match?.[1]?.trim();
}

export async function checkSkills(context) {
  const { failures, readFile, repositoryRoot } = context;
  const sharedSkillsDirectory = path.join(repositoryRoot, ".agents", "skills");
  const claudeSkillsDirectory = path.join(repositoryRoot, ".claude", "skills");
  const entries = await readdir(sharedSkillsDirectory, { withFileTypes: true });
  const sharedSkillNames = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  for (const skillName of sharedSkillNames) {
    const skillFile = path.join(sharedSkillsDirectory, skillName, "SKILL.md");
    let contents;
    try {
      contents = await readFile(skillFile, "utf8");
    }
    catch {
      failures.push(`.agents/skills/${skillName}/SKILL.md is missing`);
      continue;
    }

    const frontmatterMatch = contents.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      failures.push(`.agents/skills/${skillName}/SKILL.md has no frontmatter`);
      continue;
    }

    const name = frontmatterValue(frontmatterMatch[1], "name");
    const description = frontmatterValue(frontmatterMatch[1], "description");
    if (name !== skillName) {
      failures.push(
        `.agents/skills/${skillName}/SKILL.md declares name ${name ?? "<missing>"}`,
      );
    }
    if (!description) {
      failures.push(
        `.agents/skills/${skillName}/SKILL.md must declare a description`,
      );
    }

    await expectSymlink(
      context,
      path.join(".claude", "skills", skillName),
      path.join("..", "..", ".agents", "skills", skillName),
    );
  }

  const claudeEntries = await readdir(claudeSkillsDirectory, {
    withFileTypes: true,
  });
  const claudeSkillNames = claudeEntries.map(entry => entry.name).sort();
  const unexpectedClaudeSkills = claudeSkillNames.filter(
    skillName => !sharedSkillNames.includes(skillName),
  );
  if (unexpectedClaudeSkills.length > 0) {
    failures.push(
      `.claude/skills has non-shared skills: ${unexpectedClaudeSkills.join(", ")}`,
    );
  }
}

async function collectSkillFiles(readFile, baseDirectory, currentDirectory, files) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.name === ".git" || entry.name === "node_modules") return;

    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectSkillFiles(readFile, baseDirectory, entryPath, files);
    }
    else if (entry.isFile()) {
      files.push({
        content: await readFile(entryPath),
        relativePath: path.relative(baseDirectory, entryPath).replaceAll("\\", "/"),
      });
    }
  }));
}

async function computeSkillDirectoryHash(readFile, skillDirectory) {
  const files = [];
  await collectSkillFiles(readFile, skillDirectory, skillDirectory, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(file.content);
  }
  return hash.digest("hex");
}

export async function checkLockedSkills({ failures, lockedSkillsRoot, readFile }) {
  let lock;
  try {
    lock = JSON.parse(
      await readFile(path.join(lockedSkillsRoot, "skills-lock.json"), "utf8"),
    );
  }
  catch (error) {
    failures.push(`skills-lock.json is missing or invalid: ${error.message}`);
    return;
  }

  for (const [skillName, entry] of Object.entries(lock.skills ?? {})) {
    const expectedHash = entry.computedHash;
    const skillDirectory = path.join(
      lockedSkillsRoot,
      ".agents",
      "skills",
      skillName,
    );

    let obtainedHash;
    try {
      obtainedHash = await computeSkillDirectoryHash(readFile, skillDirectory);
    }
    catch (error) {
      if (error.code === "ENOENT") obtainedHash = "<missing>";
      else {
        failures.push(
          `.agents/skills/${skillName} could not be hashed: ${error.message}`,
        );
        continue;
      }
    }

    if (obtainedHash !== expectedHash) {
      failures.push(
        `.agents/skills/${skillName} differs from skills-lock.json: `
        + `expected ${expectedHash}; obtained ${obtainedHash}`,
      );
    }
  }
}
