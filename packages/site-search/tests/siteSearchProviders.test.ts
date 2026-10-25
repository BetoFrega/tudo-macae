import { describe, expect, test, vi } from "vitest";
import { createSiteSearchWorkerProvider } from "../providers";

function workerWith(fetch: typeof globalThis.fetch, origin = "https://search.example.workers.dev") {
  return createSiteSearchWorkerProvider({
    origin,
    fetch,
    identityToken: async audience => `token-for-${audience}`,
    timeoutMs: 50,
    correlationId: () => "trace-1",
  });
}

describe("site search Worker provider", () => {
  test("sends the query with the runtime identity and reads chunks", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      durationMs: 31,
      chunks: [{ key: "https://www.tudomacae.com.br/negocio/b1/padaria", title: "Padaria", text: "Pães" }, { key: 1 }],
    }));

    await expect(workerWith(fetch).search("padaria")).resolves.toEqual({
      status: "ok",
      providerDurationMs: 31,
      chunks: [{ key: "https://www.tudomacae.com.br/negocio/b1/padaria", title: "Padaria", text: "Pães" }],
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://search.example.workers.dev/search");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ query: "padaria" }) });

    await workerWith(fetch).search("padaria", ["ad", "business"]);
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ body: JSON.stringify({ query: "padaria", types: ["ad", "business"] }) });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-for-https://search.example.workers.dev");
    expect(new Headers(init?.headers).get("x-request-id")).toBe("trace-1");
  });

  test("a loopback development provider receives no identity", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ chunks: [] }));

    await workerWith(fetch, "http://127.0.0.1:4555").search("padaria");
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false);
  });

  test.each([
    [429, "quota"],
    [503, "unavailable"],
    [502, "provider-error"],
    [401, "provider-error"],
  ] as const)("maps status %i to %s", async (status, expected) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({}, { status }));

    await expect(workerWith(fetch).search("padaria")).resolves.toEqual({ status: expected });
  });

  test("reports a malformed payload as a provider error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("<html>"));

    await expect(workerWith(fetch).search("padaria")).resolves.toEqual({ status: "provider-error" });
  });

  test("reports the deadline as a timeout", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));

    await expect(workerWith(fetch).search("padaria")).resolves.toEqual({ status: "timeout" });
  });

  test.each([
    ["the network fails", "https://search.example.workers.dev", vi.fn().mockRejectedValue(new TypeError("fetch failed"))],
    ["the origin is not HTTPS", "http://search.example.workers.dev", vi.fn()],
    ["the origin is missing", "", vi.fn()],
  ])("reports unavailability when %s", async (_label, origin, fetch) => {
    await expect(workerWith(fetch, origin).search("padaria")).resolves.toEqual({ status: "unavailable" });
  });

  test("shares one deadline across the calls of a visitor search", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(Response.json({ chunks: [] })), 40)))
      .mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }));
    const provider = workerWith(fetch);

    const startedAt = performance.now();
    await expect(provider.search("padaria", ["ad"])).resolves.toMatchObject({ status: "ok" });
    await expect(provider.search("padaria")).resolves.toEqual({ status: "timeout" });
    expect(performance.now() - startedAt).toBeLessThan(90);
  });

  test("does not call the Worker once the search deadline has passed", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    const provider = workerWith(fetch);

    await expect(provider.search("padaria", ["ad"])).resolves.toEqual({ status: "timeout" });
    await expect(provider.search("padaria")).resolves.toEqual({ status: "timeout" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("counts identity acquisition within the same deadline", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ chunks: [] }));
    const provider = createSiteSearchWorkerProvider({
      origin: "https://search.example.workers.dev",
      fetch,
      identityToken: () => new Promise(resolve => setTimeout(() => resolve("late-token"), 120)),
      timeoutMs: 50,
    });

    await expect(provider.search("padaria")).resolves.toEqual({ status: "timeout" });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("reports unavailability when the runtime identity cannot be obtained", async () => {
    const provider = createSiteSearchWorkerProvider({
      origin: "https://search.example.workers.dev",
      fetch: vi.fn(),
      identityToken: () => Promise.reject(new Error("metadata server down")),
      timeoutMs: 50,
    });

    await expect(provider.search("padaria")).resolves.toEqual({ status: "unavailable" });
  });
});
