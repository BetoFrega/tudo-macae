import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { LOOPBACK } from "./appPorts.ts";

/**
 * Refuses to start the dev server when something already holds this worktree's
 * app port, and names the process that holds it.
 *
 * Without this the port is either free — the normal case, since it is derived
 * from a path nothing else knows — or occupied by something unrelated, and the
 * supervisor's own message ("port taken") sends the reader looking for a bug in
 * their own change.
 */

export type PortOwner = { pid: number | null; cwd: string | null };
export type PortConflict = { port: number; owner: PortOwner };

const PROBE_TIMEOUT_MS = 500;

/**
 * A plain TCP connect, because it works everywhere. It is what decides whether
 * a port is taken; `lsof` below only ever answers *who* holds a port, and is
 * allowed to be missing — a CI image without it still gets the refusal, just
 * without a name.
 */
export function isListening(port: number, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: LOOPBACK, port });
    const settle = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => settle(true));
    socket.on("timeout", () => settle(false));
    socket.on("error", () => settle(false));
  });
}

export async function findPortConflicts(
  ports: number[],
  inspect: (port: number) => Promise<PortOwner | null>,
): Promise<PortConflict[]> {
  const owners = await Promise.all(ports.map(inspect));

  return ports
    .map((port, index) => ({ port, owner: owners[index] }))
    .filter((entry): entry is PortConflict => entry.owner !== null);
}

export function conflictReport(conflicts: PortConflict[], worktree: string) {
  const lines = conflicts.map(({ port, owner }) =>
    owner.cwd === null
      ? `  ${port} — held by ${owner.pid === null ? "a process" : `pid ${owner.pid}`}, `
      + "could not read its working directory"
      : `  ${port} — held by pid ${owner.pid}, running in ${owner.cwd}`);

  return (
    `${conflicts.length} port(s) this worktree's app needs are already in use.\n\n`
    + `Worktree: ${worktree}\n\n`
    + `${lines.join("\n")}\n\n`
    + "Each worktree derives its own port from its own path, so this is not the\n"
    + "other session's app — stop whatever is listed above, or move this\n"
    + "worktree to another path. See docs/agents/test-harness-operation.md."
  );
}

/** `null` means the port is free. */
export async function inspectPort(port: number): Promise<PortOwner | null> {
  if (!(await isListening(port))) return null;

  const pid = parseListenerPid(lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]));
  if (pid === null) return { pid: null, cwd: null };

  return {
    pid,
    cwd: parseWorkingDirectory(lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fn"])),
  };
}

function lsof(args: string[]) {
  try {
    return execFileSync("lsof", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  }
  catch {
    // `lsof` exits non-zero when it finds nothing, and is absent altogether on
    // some images. Neither is worth a crash on the diagnostic path.
    return "";
  }
}

export function parseListenerPid(output: string) {
  const first = output.split("\n").find(line => line.trim() !== "");
  return first === undefined ? null : Number(first.trim());
}

export function parseWorkingDirectory(output: string) {
  const name = output.split("\n").find(line => line.startsWith("n"));
  return name === undefined ? null : name.slice(1);
}
