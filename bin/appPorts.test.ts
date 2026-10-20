// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, expect, afterAll, beforeAll } from "vitest";
import {
  BLOCK_STRIDE,
  FIRST_BLOCK_PORT,
  LAST_BLOCK_PORT,
  PRIMARY_APP_PORT,
  appPortFor,
  appUrlFor,
  linkedWorktreePath,
} from "./appPorts.ts";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const A = "/Users/dev/code/app/.claude/worktrees/issue-1-aaaaaa";
const B = "/Users/dev/code/app/.claude/worktrees/issue-2-bbbbbb";

describe("appPortFor", () => {
  test("the primary checkout keeps its fixed port", () => {
    expect(appPortFor(null)).toBe(PRIMARY_APP_PORT);
  });

  test("a linked worktree's port stays inside the reserved range, clear of the ephemeral range", () => {
    for (const path of [A, B, "", "/", "z".repeat(400)]) {
      const port = appPortFor(path);
      expect(port).toBeGreaterThanOrEqual(FIRST_BLOCK_PORT);
      expect(port).toBeLessThanOrEqual(LAST_BLOCK_PORT);
      expect(port).not.toBe(PRIMARY_APP_PORT);
    }
  });

  test("the same worktree always derives the same port", () => {
    expect(appPortFor(A)).toBe(appPortFor(A));
  });

  test("two worktrees under the same parent get different ports", () => {
    expect(appPortFor(A)).not.toBe(appPortFor(B));
  });

  test("every port lands on a block boundary, where older revisions put their app", () => {
    for (const path of [A, B, "/tmp/x", "/tmp/y"]) {
      expect((appPortFor(path) - FIRST_BLOCK_PORT) % BLOCK_STRIDE).toBe(0);
    }
  });
});

describe("appUrlFor", () => {
  test("names the app port on localhost, which is what Playwright and the reader both need", () => {
    expect(appUrlFor(appPortFor(null))).toBe(`http://localhost:${PRIMARY_APP_PORT}`);
  });
});

/**
 * A real repository with a linked worktree, because the derivation under test
 * is what git answers — a mocked `rev-parse` would only pin the mock.
 */
function repositoryWithLinkedWorktree() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-ports-")));
  const primary = join(root, "primary");
  const worktree = join(root, "linked");
  const git = (cwd: string, ...args: string[]) => {
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  };

  mkdirSync(primary);
  git(primary, "init", "--initial-branch=main");
  git(primary, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "root");
  git(primary, "worktree", "add", "-b", "linked", worktree);

  return { root, primary, worktree };
}

describe.skipIf(inWorkers)("linkedWorktreePath", () => {
  let repository: ReturnType<typeof repositoryWithLinkedWorktree>;

  beforeAll(() => {
    repository = repositoryWithLinkedWorktree();
  });

  afterAll(() => {
    rmSync(repository.root, { recursive: true, force: true });
  });

  test("a linked worktree answers with its own path", () => {
    expect(linkedWorktreePath(repository.worktree)).toBe(repository.worktree);
  });

  test("a copy of the tree one level deeper still answers with the worktree that owns it, so a Stryker sandbox gets the worktree's port", () => {
    const sandbox = join(repository.worktree, ".stryker-tmp", "sandbox-1234");
    mkdirSync(sandbox, { recursive: true });

    expect(linkedWorktreePath(sandbox)).toBe(repository.worktree);
    expect(appPortFor(linkedWorktreePath(sandbox))).toBe(
      appPortFor(linkedWorktreePath(repository.worktree)),
    );
  });

  test("the primary checkout, and any directory under it, keeps the primary port", () => {
    const nested = join(repository.primary, ".stryker-tmp", "sandbox-1234");
    mkdirSync(nested, { recursive: true });

    expect(linkedWorktreePath(repository.primary)).toBeNull();
    expect(linkedWorktreePath(nested)).toBeNull();
    expect(appPortFor(linkedWorktreePath(nested))).toBe(PRIMARY_APP_PORT);
  });

  test("a tree git cannot answer for falls back to the primary checkout rather than throwing", () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "app-ports-bare-")));

    try {
      expect(linkedWorktreePath(outside)).toBeNull();
    }
    finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("a worktree entry with no gitdir file falls back to the primary checkout", () => {
    const scratch = repositoryWithLinkedWorktree();

    try {
      rmSync(join(scratch.primary, ".git", "worktrees", "linked", "gitdir"));

      expect(linkedWorktreePath(scratch.worktree)).toBeNull();
    }
    finally {
      rmSync(scratch.root, { recursive: true, force: true });
    }
  });
});
