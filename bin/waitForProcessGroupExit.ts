import { setTimeout } from "node:timers/promises";

function isDarwinPermissionDenial(error: unknown, platform: string) {
  return platform === "darwin" && error instanceof Error && "code" in error && error.code === "EPERM";
}

export async function waitForProcessGroupExit(
  probe: () => boolean,
  platform: string = process.platform,
  pause: () => Promise<void> = () => setTimeout(50),
) {
  let permissionFailures = 0;
  while (true) {
    try {
      if (!probe()) return;
      permissionFailures = 0;
    }
    catch (error) {
      // Darwin can report EPERM while the last group member exits. Require a
      // later successful probe or ESRCH; persistent permission denial must fail.
      if (!isDarwinPermissionDenial(error, platform) || ++permissionFailures > 20) throw error;
    }
    await pause();
  }
}
