import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { waitForProcessGroupExit } from "./waitForProcessGroupExit.ts";

export type ProcessGroup = {
  child: ChildProcess;
  pid: number | undefined;
  signal(signal: NodeJS.Signals): boolean;
  terminateAndWait(signal?: NodeJS.Signals): Promise<void>;
  waitForExit(): Promise<void>;
};

export function spawnProcessGroup(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
  platform: NodeJS.Platform = process.platform,
): ProcessGroup {
  const child = spawn(command, args, {
    ...options,
    detached: platform !== "win32",
  });
  const pid = child.pid;

  function signal(signal: NodeJS.Signals | 0) {
    if (pid === undefined) return false;
    try {
      if (platform === "win32") return child.kill(signal);
      process.kill(-pid, signal);
      return true;
    }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
      throw error;
    }
  }

  return {
    child,
    pid,
    signal,
    async terminateAndWait(terminationSignal = "SIGTERM") {
      try {
        signal(terminationSignal);
      }
      catch (error) {
        // Darwin can deny a group signal during the final exit race. The
        // awaited probe below must still confirm ESRCH; persistent EPERM fails.
        if (platform !== "darwin" || !(error instanceof Error)
          || !("code" in error) || error.code !== "EPERM") throw error;
      }
      if (pid !== undefined) {
        await waitForProcessGroupExit(() => signal(0), platform);
      }
    },
    waitForExit: () => pid === undefined
      ? Promise.resolve()
      : waitForProcessGroupExit(() => signal(0), platform),
  };
}

export function forwardFirstProcessInterrupt(
  group: ProcessGroup,
  forwardedSignal: NodeJS.Signals = "SIGINT",
) {
  return forwardSignals(group, true, () => forwardedSignal);
}

export function forwardProcessGroupSignals(
  group: ProcessGroup,
  beforeSignal: (signal: NodeJS.Signals) => void = () => {},
) {
  return forwardSignals(group, false, signal => signal, beforeSignal);
}

function forwardSignals(
  group: ProcessGroup,
  firstOnly: boolean,
  mapSignal: (signal: NodeJS.Signals) => NodeJS.Signals,
  beforeSignal: (signal: NodeJS.Signals) => void = () => {},
) {
  let forwarded = false;
  const terminations: Promise<PromiseSettledResult<void>>[] = [];
  const handlers = (["SIGINT", "SIGTERM"] as const).map((signal) => {
    const handler = () => {
      if (firstOnly && forwarded) return;
      forwarded = true;
      beforeSignal(signal);
      terminations.push(group.terminateAndWait(mapSignal(signal)).then(
        value => ({ status: "fulfilled", value }),
        reason => ({ status: "rejected", reason }),
      ));
    };
    process.on(signal, handler);
    return { handler, signal };
  });
  return {
    get interrupted() { return forwarded; },
    dispose() {
      for (const { handler, signal } of handlers) process.removeListener(signal, handler);
    },
    async wait() {
      const results = await Promise.all(terminations);
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
  };
}

export function processGroupExitCode(
  code: number | null,
  spawnFailed: boolean,
  cleanupFailed: boolean,
) {
  const childCode = spawnFailed ? 1 : code ?? 1;
  return childCode === 0 && cleanupFailed ? 1 : childCode;
}
