import { lstat, readlink } from "node:fs/promises";
import path from "node:path";

export async function exists(filePath) {
  try {
    await lstat(filePath);
    return true;
  }
  catch {
    return false;
  }
}

export async function expectSymlink(
  { failures, repositoryRoot },
  relativePath,
  expectedTarget,
) {
  const filePath = path.join(repositoryRoot, relativePath);
  try {
    const statistics = await lstat(filePath);
    if (!statistics.isSymbolicLink()) {
      failures.push(`${relativePath} must be a symbolic link`);
      return;
    }

    const target = await readlink(filePath);
    if (target !== expectedTarget) {
      failures.push(
        `${relativePath} points to ${target}; expected ${expectedTarget}`,
      );
    }
  }
  catch {
    failures.push(`${relativePath} is missing`);
  }
}
