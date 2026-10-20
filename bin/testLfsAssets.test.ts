// @vitest-environment node
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { prepareTestLfsAssets } from "./testLfsAssets";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
const execute = promisify(execFile);
const roots: string[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO7sAAAAASUVORK5CYII=", "base64");
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
};

const lfsAvailable = !inWorkers && spawnSync("git", ["lfs", "version"], { env: gitEnvironment, stdio: "ignore" }).status === 0;
const lfsTest = test.runIf(lfsAvailable);

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

lfsTest("restores a missing tracked asset from cache", async () => {
  const context = await fixture();
  await rm(context.asset);
  await rm(context.origin, { recursive: true });

  await prepareTestLfsAssets(context.repository);

  expect(await readFile(context.asset)).toEqual(png);
});

lfsTest("preserves a locally edited hydrated asset without contacting the remote", async () => {
  const context = await fixture();
  const edited = Buffer.concat([png, Buffer.from("local edit")]);
  await writeFile(context.asset, edited);
  await rm(context.origin, { recursive: true });

  await prepareTestLfsAssets(context.repository);

  expect(await readFile(context.asset)).toEqual(edited);
});

lfsTest("reports a locally modified pointer without replacing it", async () => {
  const context = await fixture();
  const editedPointer = context.pointer.replace(/oid sha256:[a-f0-9]+/, `oid sha256:${"0".repeat(64)}`);
  await writeFile(context.asset, editedPointer);

  await expect(prepareTestLfsAssets(context.repository)).rejects.toThrow("Locally modified pointers are preserved");

  expect(await readFile(context.asset, "utf8")).toBe(editedPointer);
});

lfsTest("reports an environment failure when neither cache nor remote is available", async () => {
  const context = await fixture();
  await rm(join(context.repository, ".git", "lfs", "objects"), { recursive: true });
  await rm(context.origin, { recursive: true });

  await expect(prepareTestLfsAssets(context.repository)).rejects.toThrow("E2E environment: Git LFS preparation failed during fetch");

  expect(await readFile(context.asset, "utf8")).toBe(context.pointer);
});

test.runIf(lfsAvailable && process.platform !== "win32")("a hydrated checkout works without Git LFS installed; a pointer fails clearly", async () => {
  const context = await fixture();
  await writeFile(context.asset, png);
  const commands = join(context.repository, "commands");
  await mkdir(commands);
  const gitPath = findGit();
  await symlink(gitPath, join(commands, "git"));
  vi.stubEnv("PATH", commands);
  vi.stubEnv("GIT_EXEC_PATH", commands);

  await prepareTestLfsAssets(context.repository);
  expect(await readFile(context.asset)).toEqual(png);

  await writeFile(context.asset, context.pointer);
  await expect(prepareTestLfsAssets(context.repository)).rejects.toThrow("Install Git LFS");
  expect(await readFile(context.asset, "utf8")).toBe(context.pointer);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "test-lfs-assets-"));
  roots.push(root);
  const repository = join(root, "repository");
  const origin = join(root, "origin.git");
  await mkdir(repository);
  async function git(...args: string[]) {
    return execute("git", args, { cwd: repository, env: gitEnvironment });
  }
  await git("init", "--bare", origin);
  await git("init");
  await git("lfs", "install", "--local", "--skip-smudge");
  await git("config", "user.name", "LFS test");
  await git("config", "user.email", "lfs@example.test");
  await git("config", "commit.gpgsign", "false");
  await git("remote", "add", "origin", origin);
  await writeFile(join(repository, ".gitattributes"), "*.png filter=lfs diff=lfs merge=lfs -text\n");
  await mkdir(join(repository, "tests"));
  const asset = join(repository, "tests", "reference.png");
  await writeFile(asset, png);
  await git("add", ".");
  await git("commit", "-m", "Test snapshot");
  await git("push", "origin", "HEAD:refs/heads/main");
  const pointer = (await git("show", "HEAD:tests/reference.png")).stdout;
  await writeFile(asset, pointer);
  return { repository, origin, asset, pointer, git };
}

lfsTest("hydrates a snapshot from the local cache while the remote is offline", async () => {
  const context = await fixture();
  await rm(context.origin, { recursive: true });

  await prepareTestLfsAssets(context.repository);

  expect(await readFile(context.asset)).toEqual(png);
  expect((await context.git("status", "--porcelain")).stdout).toBe("");
});

lfsTest("uses the shared cache in a linked worktree without changing the original checkout", async () => {
  const context = await fixture();
  const worktree = join(context.repository, "linked-worktree");
  await context.git("worktree", "add", "--detach", worktree, "HEAD");
  await rm(context.origin, { recursive: true });

  await prepareTestLfsAssets(worktree);

  expect(await readFile(join(worktree, "tests", "reference.png"))).toEqual(png);
  expect(await readFile(context.asset, "utf8")).toBe(context.pointer);
});

lfsTest("fetches the local HEAD even when the remote branch has a newer snapshot", async () => {
  const context = await fixture();
  const revision = (await context.git("rev-parse", "HEAD")).stdout.trim();
  await writeFile(context.asset, Buffer.concat([png, Buffer.from("new remote version")]));
  await context.git("add", ".");
  await context.git("commit", "-m", "New remote snapshot");
  await context.git("push", "origin", "HEAD:refs/heads/main");
  await context.git("checkout", "--detach", revision);
  await writeFile(context.asset, context.pointer);
  await rm(join(context.repository, ".git", "lfs", "objects"), { recursive: true });

  await prepareTestLfsAssets(context.repository);

  expect(await readFile(context.asset)).toEqual(png);
});

lfsTest("fetches the checked-out revision for tests without downloading other LFS assets", async () => {
  const context = await fixture();
  await mkdir(join(context.repository, "docs"));
  const outside = join(context.repository, "docs", "reference.png");
  await writeFile(outside, Buffer.concat([png, Buffer.from("outside tests")]));
  await context.git("add", ".");
  await context.git("commit", "-m", "Unrelated LFS asset");
  await context.git("push", "origin", "HEAD:refs/heads/main");
  const outsidePointer = (await context.git("show", "HEAD:docs/reference.png")).stdout;
  await writeFile(outside, outsidePointer);
  await rm(join(context.repository, ".git", "lfs", "objects"), { recursive: true });

  await prepareTestLfsAssets(context.repository);

  expect(await readFile(context.asset)).toEqual(png);
  expect(await readFile(outside, "utf8")).toBe(outsidePointer);
  const outsideOid = outsidePointer.match(/oid sha256:([a-f0-9]+)/)?.[1];
  if (outsideOid === undefined) throw new Error("Fixture has no LFS object identifier");
  await expect(readFile(join(context.repository, ".git", "lfs", "objects", outsideOid.slice(0, 2), outsideOid.slice(2, 4), outsideOid))).rejects.toMatchObject({ code: "ENOENT" });
});

function findGit() {
  const path = (process.env.PATH ?? "").split(delimiter)
    .map(directory => join(directory, "git"))
    .find(candidate => existsSync(candidate));
  if (path === undefined) throw new Error("Git is required to test the harness");
  return path;
}

test.runIf(!inWorkers && process.platform !== "win32")("prepares a hydrated checkout using Git metadata without an installed LFS executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "test-lfs-hydrated-"));
  roots.push(root);
  await execute("git", ["init"], { cwd: root, env: gitEnvironment });
  await mkdir(join(root, "tests"));
  await writeFile(join(root, ".gitattributes"), "*.png filter=lfs diff=lfs merge=lfs -text\n");
  const asset = join(root, "tests", "reference.png");
  await writeFile(asset, `version https://git-lfs.github.com/spec/v1\noid sha256:${"0".repeat(64)}\nsize 1\n`);
  await execute("git", ["-c", "filter.lfs.process=", "-c", "filter.lfs.clean=", "-c", "filter.lfs.required=false", "add", ".gitattributes", "tests"], { cwd: root, env: gitEnvironment });
  await writeFile(asset, png);
  const commands = join(root, "commands");
  await mkdir(commands);
  await symlink(findGit(), join(commands, "git"));
  vi.stubEnv("PATH", commands);
  vi.stubEnv("GIT_EXEC_PATH", commands);

  await prepareTestLfsAssets(root);

  expect(await readFile(asset)).toEqual(png);
});

test.runIf(!inWorkers && process.platform !== "win32").each([
  ["authentication", "batch response: Authentication required: https://user:fake-secret@example.test/private"],
  ["authentication", "git@example.test: Permission denied (publickey). https://user:fake-secret@example.test/private"],
  ["network", "dial tcp: lookup example.test: no such host https://user:fake-secret@example.test/private"],
  ["write-permission", "open objects: permission denied https://user:fake-secret@example.test/private"],
  ["missing-object", "Object does not exist on the server: [404] https://user:fake-secret@example.test/private"],
  ["remote-unavailable", "fatal: 'origin' does not appear to be a git repository https://user:fake-secret@example.test/private"],
])("reports a safe %s failure cause without exposing remote data", async (category, diagnostic) => {
  const root = await mkdtemp(join(tmpdir(), "test-lfs-diagnostic-"));
  roots.push(root);
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "tests", "reference.png"),
    `version https://git-lfs.github.com/spec/v1\noid sha256:${"0".repeat(64)}\nsize 1\n`);
  const commands = join(root, "commands");
  await mkdir(commands);
  const gitPath = join(commands, "git");
  await writeFile(gitPath, `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "ls-files") process.stdout.write("tests/reference.png\\0");
if (args[0] === "check-attr") process.stdout.write("tests/reference.png\\0filter\\0lfs\\0");
if (args[0] === "lfs" && args[1] === "fetch") {
  process.stderr.write(${JSON.stringify(diagnostic)});
  process.exitCode = 1;
}
`);
  await chmod(gitPath, 0o755);
  vi.stubEnv("PATH", commands);

  const preparation = prepareTestLfsAssets(root);
  await expect(preparation).rejects.toThrow(`reason=${category}`);
  await expect(preparation).rejects.not.toThrow(/fake-secret|example\.test|https:\/\//);
});
