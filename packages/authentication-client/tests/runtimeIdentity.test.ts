import { afterEach, expect, test, vi } from "vitest";
import { createRuntimeIdentityReader } from "../runtime-identity";
afterEach(() => vi.useRealTimers());

test.each(["headers", "body"])("metadata timeout releases a shared lookup for retry (%s)", async (stage) => {
  vi.useFakeTimers();
  const now = 1_800_000_000_000;
  const request = vi.fn(async (_url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    if (stage === "headers") return await new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason));
    });
    return new Response(new ReadableStream({ start(controller) {
      options?.signal?.addEventListener("abort", () => controller.error(options.signal?.reason));
    } }));
  });
  const { read } = createRuntimeIdentityReader({ fetch: request, now: () => now });
  const failed = expect(read("https://auth.example")).rejects.toThrow("Runtime identity unavailable");
  await vi.advanceTimersByTimeAsync(2000);
  await failed;
  request.mockImplementationOnce(async () => new Response(jwt(now / 1000 + 120)));
  await expect(read("https://auth.example")).resolves.toBe(jwt(now / 1000 + 120));
  expect(request).toHaveBeenCalledTimes(2);
});

function jwt(exp: number) {
  const payload = btoa(JSON.stringify({ exp })).replace(/=/gu, "").replace(/\+/gu, "-").replace(/\//gu, "_");
  return `header.${payload}.signature`;
}

test("reuses an unexpired token and shares concurrent lookups for one audience", async () => {
  const now = 1_800_000_000_000;
  let finish!: (response: Response) => void;
  const request = vi.fn(() => new Promise<Response>((resolve) => {
    finish = resolve;
  }));
  const { read } = createRuntimeIdentityReader({ fetch: request, now: () => now });
  const first = read("https://auth.example");
  const second = read("https://auth.example");
  expect(request).toHaveBeenCalledOnce();
  finish(new Response(jwt(now / 1000 + 120)));
  const token = await first;
  await expect(second).resolves.toBe(token);
  await expect(read("https://auth.example")).resolves.toBe(token);
  expect(request).toHaveBeenCalledOnce();
});

test("cached lookup returns immediately while warming and serves the completed token", async () => {
  const now = 1_800_000_000_000;
  let finish!: (response: Response) => void;
  const request = vi.fn(() => new Promise<Response>((resolve) => {
    finish = resolve;
  }));
  const reader = createRuntimeIdentityReader({ fetch: request, now: () => now });
  expect(reader.cached("https://auth.example")).toBeUndefined();
  expect(request).toHaveBeenCalledOnce();
  expect(reader.cached("https://auth.example")).toBeUndefined();
  expect(request).toHaveBeenCalledOnce();
  finish(new Response(jwt(now / 1000 + 120)));
  await expect(reader.read("https://auth.example")).resolves.toBe(jwt(now / 1000 + 120));
  expect(reader.cached("https://auth.example")).toBe(jwt(now / 1000 + 120));
});

test("failed background warm is swallowed and a later peek retries", async () => {
  const request = vi.fn()
    .mockRejectedValueOnce(new Error("provider-private-sentinel"))
    .mockResolvedValueOnce(new Response(jwt(1_800_000_120)));
  const reader = createRuntimeIdentityReader({ fetch: request, now: () => 1_800_000_000_000 });
  expect(reader.cached("https://auth.example")).toBeUndefined();
  await Promise.resolve();
  await Promise.resolve();
  expect(reader.cached("https://auth.example")).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(2);
  await expect(reader.read("https://auth.example")).resolves.toBe(jwt(1_800_000_120));
});

test("separates audiences and refreshes tokens inside the expiry margin", async () => {
  let now = 1_800_000_000_000;
  const request = vi.fn(async () => new Response(jwt(now / 1000 + 120)));
  const { read } = createRuntimeIdentityReader({ fetch: request, now: () => now });
  await read("https://one.example");
  await read("https://two.example");
  now += 61_000;
  await read("https://one.example");
  expect(request).toHaveBeenCalledTimes(3);
});

test("clears failed lookups for retry and redacts provider errors", async () => {
  const providerSecret = "provider-error-private-sentinel";
  const request = vi.fn()
    .mockRejectedValueOnce(new Error(providerSecret))
    .mockResolvedValueOnce(new Response(jwt(1_800_000_120)));
  const { read } = createRuntimeIdentityReader({ fetch: request, now: () => 1_800_000_000_000 });
  await expect(read("https://auth.example")).rejects.toThrow("Runtime identity unavailable");
  await expect(read("https://auth.example")).resolves.toBe(jwt(1_800_000_120));
  expect(request).toHaveBeenCalledTimes(2);
  try {
    await read("https://auth.example");
  }
  catch (error) {
    expect(String(error)).not.toContain(providerSecret);
  }
});

test.each([
  "",
  "not-a-jwt",
  "header.e30.signature",
  `header.${btoa(JSON.stringify({ exp: "later" })).replace(/=/gu, "")}.signature`,
  `header.${btoa(JSON.stringify({ exp: 1_800_000_030 })).replace(/=/gu, "")}.signature`,
])("rejects missing, malformed, or near-expiry tokens without exposing their content", async (token) => {
  const marker = "token-private-sentinel";
  const value = token || marker;
  const { read } = createRuntimeIdentityReader({ fetch: async () => new Response(value), now: () => 1_800_000_000_000 });
  await expect(read("https://auth.example")).rejects.toThrow("Runtime identity unavailable");
  await expect(read("https://auth.example")).rejects.not.toThrow(marker);
});
