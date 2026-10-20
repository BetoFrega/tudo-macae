import { expect, test, vi } from "vitest";
import { waitForProcessGroupExit } from "./waitForProcessGroupExit";

const permissionError = () => Object.assign(new Error("kill EPERM"), { code: "EPERM" });

test("waits through Darwin exit races until absence is confirmed", async () => {
  const probe = vi.fn<() => boolean>()
    .mockReturnValueOnce(true)
    .mockImplementationOnce(() => { throw permissionError(); })
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  const pause = vi.fn(async () => {});
  await waitForProcessGroupExit(probe, "darwin", pause);
  expect(probe).toHaveBeenCalledTimes(4);
  expect(pause).toHaveBeenCalledTimes(3);
});

test("persistent permission denial never authorizes cleanup", async () => {
  const error = permissionError();
  const probe = vi.fn(() => {
    throw error;
  });
  await expect(waitForProcessGroupExit(probe, "darwin", async () => {})).rejects.toBe(error);
  expect(probe).toHaveBeenCalledTimes(21);
});

test("other platforms and unexpected errors fail immediately", async () => {
  for (const { platform, error } of [{ platform: "linux", error: permissionError() }, { platform: "darwin", error: new Error("unexpected") }]) {
    const probe = vi.fn(() => {
      throw error;
    });
    await expect(waitForProcessGroupExit(probe, platform, async () => {})).rejects.toBe(error);
    expect(probe).toHaveBeenCalledTimes(1);
  }
});
