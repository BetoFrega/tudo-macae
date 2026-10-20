import { afterEach, expect, test, vi } from "vitest";
import { workerMedia } from "../index";

vi.mock("next/headers.js", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("a missing Worker origin fails instead of answering", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://tudomacae.test");
  await expect(workerMedia()).rejects.toThrow("Media configuration missing");
});

test("the Worker's Media is built without reading the authority", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "https://api.tudomacae.test/");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://tudomacae.test");
  const send = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", send);
  expect(await workerMedia()).toMatchObject({ read: expect.any(Function), write: expect.any(Function) });
  expect(send).not.toHaveBeenCalled();
});
