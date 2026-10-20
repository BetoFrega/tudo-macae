import { expect, test, vi } from "vitest";
import { createPostHogFlagReader } from "../posthog";

test("a configured decision window bounds repeated calls and refreshes expired state", async () => {
  let now = 0;
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ flags: { gate: { enabled: true } } }))
    .mockResolvedValueOnce(Response.json({ flags: { gate: { enabled: false } } }));
  const reader = createPostHogFlagReader({ host: "https://flags.test", projectToken: "fixture-token", fetch, now: () => now, decisionTtlMs: 30_000 });
  expect(await reader("gate")).toBe(true);
  now = 29_999;
  expect(await reader("gate")).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  now = 30_000;
  expect(await reader("gate")).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(["test", "production"])("HTTP loopback is confined to the test environment (%s)", async (environment) => {
  const fetch = vi.fn(async () => Response.json({ flags: { gate: { enabled: true } } }));
  const reader = createPostHogFlagReader({ host: "http://127.0.0.1:1234", projectToken: "fixture-token", environment, fetch });
  if (environment === "test") expect(await reader("gate")).toBe(true);
  else {
    await expect(reader("gate")).rejects.toMatchObject({ category: "configuration" });
    expect(fetch).not.toHaveBeenCalled();
  }
});

test("qualification can be enabled while production stays closed in the same project", async () => {
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(new URL(_url.toString()).pathname).toBe("/flags");
    const payload = JSON.parse(String(init?.body));
    expect(payload.distinct_id).toBe(`tudo-macae:release-control:${payload.person_properties.environment}`);
    return Response.json({ flags: {
      "authentication-api": { enabled: payload.person_properties?.environment === "qualification" },
    } });
  });
  const configuration = { host: "https://eu.i.posthog.com", projectToken: "token", fetch };
  const qualification = createPostHogFlagReader({ ...configuration, environment: "qualification" });
  const production = createPostHogFlagReader({ ...configuration, environment: "production" });
  expect(await qualification("authentication-api")).toBe(true);
  expect(await production("authentication-api")).toBe(false);
  expect(await qualification("authentication-api")).toBe(true);
});

test("global release controls also provide a non-empty stable evaluation identity", async () => {
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(new URL(_url.toString()).pathname).toBe("/flags");
    const payload = JSON.parse(String(init?.body));
    expect(payload.distinct_id).toBe("tudo-macae:release-control:global");
    expect(payload.person_properties).toBeUndefined();
    return Response.json({ flags: { migration: { enabled: false } } });
  });
  const reader = createPostHogFlagReader({ host: "https://eu.i.posthog.com", projectToken: "token", fetch });
  expect(await reader("migration")).toBe(false);
});

// Responses are built inside the test: the Workers runtime forbids constructing one while the module loads.
test.each([
  ["http_status", () => new Response(null, { status: 503 }), 503],
  ["invalid_response", () => new Response("not-json"), undefined],
  ["evaluation", () => Response.json({ flags: { gate: { failed: true } } }), undefined],
] as const)("unavailable flag decisions retain a safe category (%s)", async (category, response, status) => {
  const reader = createPostHogFlagReader({ host: "https://flags.test", projectToken: "fixture-token", fetch: async () => response() });
  await expect(reader("gate")).rejects.toMatchObject({ category, status });
});

test("transport timeout classification survives the unavailable backoff without another provider call", async () => {
  const fetch = vi.fn(async () => {
    throw new DOMException("private-timeout-sentinel", "TimeoutError");
  });
  const reader = createPostHogFlagReader({ host: "https://flags.test", projectToken: "fixture-token", fetch, now: () => 0 });
  await expect(reader("gate")).rejects.toMatchObject({ category: "timeout" });
  await expect(reader("gate")).rejects.toMatchObject({ category: "timeout" });
  expect(fetch).toHaveBeenCalledOnce();
});

test("provider retries respect the configured outage interval", async () => {
  let now = 0;
  const fetch = vi.fn(async () => {
    throw new DOMException("fixture-timeout", "TimeoutError");
  });
  const reader = createPostHogFlagReader({ host: "https://flags.test", projectToken: "fixture-token", fetch, now: () => now, decisionTtlMs: 30_000 });
  await expect(reader("gate")).rejects.toMatchObject({ category: "timeout" });
  now = 29_999;
  await expect(reader("gate")).rejects.toMatchObject({ category: "timeout" });
  expect(fetch).toHaveBeenCalledOnce();
  now = 30_000;
  await expect(reader("gate")).rejects.toMatchObject({ category: "timeout" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
