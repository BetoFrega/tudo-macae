import { afterEach, expect, test, vi } from "vitest";
import { workerBlog } from "../index";

vi.mock("next/headers.js", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("a missing Worker origin fails instead of answering", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://tudomacae.test");
  await expect(workerBlog()).rejects.toThrow("Blog configuration missing");
});

test("the Worker acts as the session", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "https://api.tudomacae.test/");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://tudomacae.test");
  const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ result: { data: { items: [] } } }));
  vi.stubGlobal("fetch", send);
  const blog = await workerBlog();
  await expect(blog.list()).resolves.toEqual({ items: [] });
  const [url, init] = send.mock.calls[0]!;
  expect(String(url)).toMatch(/^https:\/\/api\.tudomacae\.test\/api\/trpc\/blogRead\?/u);
  expect(new Headers(init?.headers).get("cookie")).toBe("session=session-token");
});
