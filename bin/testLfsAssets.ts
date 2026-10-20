import { open } from "node:fs/promises";
import { join } from "node:path";
import { forwardFirstProcessInterrupt, spawnProcessGroup } from "./processGroup.ts";

const POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

/** Prepare tracked test assets without overwriting local edits or changing Git filters. */
export async function prepareTestLfsAssets(repository = process.cwd()): Promise<void> {
  const tracked = await git(repository, ["ls-files", "-z", "--", "tests"], "asset discovery");
  if (tracked.length === 0) return;
  const attributes = await git(repository, ["check-attr", "-z", "--stdin", "filter"], "asset discovery", tracked);
  const fields = attributes.split("\0");
  const assets: string[] = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    if (fields[index + 2] === "lfs") assets.push(fields[index]);
  }
  if ((await pendingAssets(repository, assets)).length === 0) return;

  await git(repository, ["lfs", "checkout", "tests/**"], "local checkout");
  if ((await pendingAssets(repository, assets)).length === 0) return;
  await git(repository, ["lfs", "fetch", "--include=tests/**", "--exclude=", "origin", "HEAD"], "fetch");
  await git(repository, ["lfs", "checkout", "tests/**"], "checkout after fetch");
  const pending = await pendingAssets(repository, assets);
  if (pending.length > 0) {
    throw new Error(`E2E environment: ${pending.length} Git LFS test asset(s) remain unavailable after checkout and fetch. First: ${pending[0]}. Locally modified pointers are preserved; resolve them before retrying the E2E command.`);
  }
}

async function pendingAssets(repository: string, assets: string[]) {
  const pending: string[] = [];
  for (const asset of assets) {
    let handle;
    try {
      handle = await open(join(repository, asset), "r");
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(POINTER_PREFIX.length), 0, POINTER_PREFIX.length, 0);
      if (buffer.subarray(0, bytesRead).toString("utf8") === POINTER_PREFIX) pending.push(asset);
    }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      pending.push(asset);
    }
    finally {
      await handle?.close();
    }
  }
  return pending;
}

async function git(repository: string, args: string[], stage: string, input?: string) {
  const group = spawnProcessGroup("git", args, {
    cwd: repository,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  const forwarding = forwardFirstProcessInterrupt(group);
  let output = "";
  let diagnostic = Buffer.alloc(0);
  let spawnFailed = false;
  let spawnCode: string | undefined;
  group.child.stdout?.on("data", (chunk) => {
    output += chunk.toString();
  });
  group.child.stderr?.on("data", (chunk: Buffer) => {
    diagnostic = Buffer.concat([diagnostic, chunk]).subarray(-8192);
  });
  group.child.once("error", (error) => {
    spawnFailed = true;
    if ("code" in error && typeof error.code === "string") spawnCode = error.code;
  });
  group.child.stdin?.end(input);
  const code = await new Promise<number | null>(resolve => group.child.once("close", resolve));
  try {
    await group.terminateAndWait();
    await forwarding.wait();
  }
  finally {
    forwarding.dispose();
  }
  if (spawnFailed || code !== 0 || forwarding.interrupted) {
    const reason = forwarding.interrupted ? "interrupted" : failureCategory(spawnCode, diagnostic.toString("utf8"));
    throw new Error(`E2E environment: Git LFS preparation failed during ${stage} (exit ${code ?? "unknown"}; reason=${reason}). Install Git LFS and verify repository/cache write permissions and origin access, then retry the E2E command.`);
  }
  return output;
}

/** Raw Git diagnostics may contain credentials; only stable categories leave this boundary. */
function failureCategory(spawnCode: string | undefined, diagnostic: string) {
  if (spawnCode === "ENOENT") return "git-unavailable";
  if (/['"]lfs['"] is not a git command/i.test(diagnostic)) return "git-lfs-unavailable";
  if (/authentication|authorization|credentials|terminal prompts disabled|permission denied \((?:publickey|password|keyboard-interactive)[^)]*\)|\b40[13]\b/i.test(diagnostic)) return "authentication";
  if (/permission denied|operation not permitted|read-only file system|access is denied/i.test(diagnostic)) return "write-permission";
  if (/could not resolve|no such host|dial tcp|network is unreachable|no route to host|connection refused|timed out|i\/o timeout|TLS handshake timeout/i.test(diagnostic)) return "network";
  if (/object (?:does not exist|not found)|missing object|\b404\b/i.test(diagnostic)) return "missing-object";
  if (/does not appear to be a git repository|repository not found|could not read from remote|invalid remote|remote.*not found/i.test(diagnostic)) return "remote-unavailable";
  return "unknown";
}
