import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { expectSymlink } from "./agentHarnessFiles.mjs";

function collectCommands(value, commands = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectCommands(item, commands);
  }
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "command" && typeof item === "string") commands.push(item);
      else collectCommands(item, commands);
    }
  }
  return commands;
}

async function checkHookConfiguration({ failures, readFile, repositoryRoot }, relativePath) {
  try {
    const configuration = JSON.parse(
      await readFile(path.join(repositoryRoot, relativePath), "utf8"),
    );
    const commands = collectCommands(configuration);
    if (commands.length === 0) {
      failures.push(`${relativePath} declares no hook commands`);
    }
    for (const command of commands) {
      if (!command.includes("/.agents/hooks/")) {
        failures.push(`${relativePath} bypasses the shared hooks: ${command}`);
      }
    }
  }
  catch (error) {
    failures.push(`${relativePath} is missing or invalid JSON: ${error.message}`);
  }
}

export async function checkHooks(context) {
  const { failures, repositoryRoot } = context;
  await expectSymlink(context, ".claude/hooks", path.join("..", ".agents", "hooks"));
  await Promise.all([
    checkHookConfiguration(context, ".claude/settings.json"),
    checkHookConfiguration(context, ".agents/hooks.json"),
    checkHookConfiguration(context, ".codex/hooks.json"),
  ]);

  const hookFiles = await readdir(path.join(repositoryRoot, ".agents", "hooks"));
  for (const hookFile of hookFiles.filter(file => file.endsWith(".sh"))) {
    try {
      await access(
        path.join(repositoryRoot, ".agents", "hooks", hookFile),
        constants.X_OK,
      );
    }
    catch {
      failures.push(`.agents/hooks/${hookFile} must be executable`);
    }
  }
}
