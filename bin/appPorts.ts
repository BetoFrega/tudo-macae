import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The only module in the repository that contains the local app port.
 *
 * Each git worktree derives its own port from its own path, so two sessions
 * never share a port and neither can end up testing the other's build. The dev
 * supervisor, Playwright, the E2E stack and the metadata fallback in
 * `src/app/layout.tsx` all read the port from here.
 *
 * See docs/agents/test-harness-operation.md.
 */

/** The primary checkout's app port. */
export const PRIMARY_APP_PORT = 5002;

/**
 * Distance between linked-worktree ports. Each worktree owns an 8-port block
 * whose first port is its app; a different stride would land this worktree's
 * app inside another worktree's block.
 */
export const BLOCK_STRIDE = 8;

/**
 * Ports live above the well-known services and below every default ephemeral
 * range (Linux starts at 32768, macOS at 49152), so an outgoing connection can
 * never be handed this worktree's port while the app is down.
 */
export const FIRST_BLOCK_PORT = 20_000;
export const BLOCK_COUNT = 1_000;
export const LAST_BLOCK_PORT = FIRST_BLOCK_PORT + BLOCK_COUNT * BLOCK_STRIDE - 1;

/** Repository root — the directory holding `bin/`. */
export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * `null` means the primary checkout, which keeps `PRIMARY_APP_PORT`; any other
 * value is a linked worktree's path and derives a port of its own.
 */
export function appPortFor(worktreePath: string | null): number {
  if (worktreePath === null) return PRIMARY_APP_PORT;

  return FIRST_BLOCK_PORT + blockIndexFor(worktreePath) * BLOCK_STRIDE;
}

function blockIndexFor(worktreePath: string) {
  return createHash("sha256").update(worktreePath).digest().readUInt32BE(0)
    % BLOCK_COUNT;
}

export function appUrlFor(port: number) {
  return `http://localhost:${port}`;
}

/**
 * The loopback address rather than `localhost`: on a machine that resolves
 * `localhost` to `::1` first, a server listening only on IPv4 is missed.
 */
export const LOOPBACK = "127.0.0.1";

/**
 * The path of the git worktree that owns the code, which is **not** the
 * directory the code is running from: a tool that copies the tree elsewhere and
 * runs it there — Stryker's sandbox is the one that does — must still land on
 * the worktree's own port.
 *
 * A linked worktree is one whose git directory is not the common one. `--git-dir`
 * then names the worktree's entry under `<common>/worktrees/`, whose `gitdir`
 * file records `<worktree>/.git`; the worktree is that path's parent. Asking the
 * entry rather than the filesystem is what makes a copy answer correctly — a copy
 * that carries its own `.git` file reads as its own working tree, so
 * `--show-toplevel` would name the copy.
 *
 * Anything git cannot answer — a tarball, a production build container, a
 * missing worktree entry — is treated as the primary checkout.
 */
export function linkedWorktreePath(
  fromDirectory: string = repositoryRoot,
): string | null {
  try {
    const gitDir = gitDirectory("--git-dir", fromDirectory);
    if (gitDir === gitDirectory("--git-common-dir", fromDirectory)) {
      return null;
    }
    const worktreeGitFile = readFileSync(join(gitDir, "gitdir"), "utf8").trim();
    return realpathSync(dirname(worktreeGitFile));
  }
  catch {
    return null;
  }
}

function gitDirectory(flag: string, cwd: string) {
  const output = execFileSync("git", ["rev-parse", flag], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return realpathSync(resolve(cwd, output));
}

let cached: number | undefined;

/** This worktree's app port. Memoised — the git lookup is a process spawn. */
export function appPort(): number {
  cached ??= appPortFor(linkedWorktreePath());
  return cached;
}

/** This worktree's app URL. */
export function appUrl(): string {
  return appUrlFor(appPort());
}
