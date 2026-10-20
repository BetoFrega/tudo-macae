import { authorizeEditorialCacheProbe, editorialCacheProbeAuthorizationHeader } from "../probeAuthorization";
import { expect, test, vi } from "vitest";
import { createEditorialPurgeVerifier as createVerifier } from "../editorialPurgeVerification";
import { editorialCacheProbeHeader, editorialCacheVariantHeader } from "../contract";

const createEditorialPurgeVerifier = (fetchProbe: typeof fetch, options: Parameters<typeof createVerifier>[1] = {}) => createVerifier(fetchProbe, { probeSecret: "test-probe-secret", ...options });
const key = `editorial/photo/${"a".repeat(64)}`;

test("verifies the denied origin and complete cache inspection with identity-free HEAD probes", async () => {
  const fetchProbe = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(init?.method).toBe("HEAD");
    expect(init?.redirect).toBe("manual");
    const headers = new Headers(init?.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    if (url.hostname === "images.tudomacae.com.br") expect(await authorizeEditorialCacheProbe(new Request(url, { method: "HEAD", headers }), "test-probe-secret")).toBe(true);
    else expect(headers.has(editorialCacheProbeAuthorizationHeader)).toBe(false);
    return new Response(null, { status: 404, headers: url.hostname === "images.tudomacae.com.br" ? { [editorialCacheProbeHeader]: "all" } : {} });
  });
  expect(await createEditorialPurgeVerifier(fetchProbe)([key])).toBe(true);
  expect(fetchProbe).toHaveBeenCalledTimes(2);
});

test.each(["present", "unsupported", "transport", "public-origin"])("does not certify %s delivery", async (mode) => {
  const fetchProbe = vi.fn<typeof fetch>(async (input) => {
    if (mode === "transport") throw Error("unreachable");
    const origin = new URL(String(input)).hostname === "www.tudomacae.com.br";
    return new Response(null, { status: origin ? mode === "public-origin" ? 200 : 404 : mode === "present" ? 200 : 404 });
  });
  expect(await createEditorialPurgeVerifier(fetchProbe)([key]).catch(() => false)).toBe(false);
});

test("invalid image keys cannot select a probe destination", async () => {
  const fetchProbe = vi.fn<typeof fetch>();
  expect(await createEditorialPurgeVerifier(fetchProbe)(["https://other.example/image"])).toBe(false);
  expect(fetchProbe).not.toHaveBeenCalled();
});

test("maps a failed probe's generated response ID to cleanup without retaining arbitrary headers or bodies", async () => {
  const failed = vi.fn();
  const responseId = crypto.randomUUID();
  const fetchProbe = vi.fn<typeof fetch>(async (_input, init) => {
    expect(new Headers(init?.headers).get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    return new Response("private response", { status: 503, headers: { "x-request-id": responseId } });
  });
  expect(await createEditorialPurgeVerifier(fetchProbe, { failed })([key])).toBe(false);
  expect(failed).toHaveBeenCalledExactlyOnceWith({ requestId: responseId, boundary: "origin", outcome: "response", statusClass: "5xx" });
  failed.mockClear();
  expect(await createEditorialPurgeVerifier(async () => new Response(null, { status: 503, headers: { "x-request-id": "private-token" } }), { failed })([key])).toBe(false);
  expect(failed.mock.calls[0][0].requestId).toMatch(/^[a-f0-9-]{36}$/);
  const unsafeFetch = vi.fn<typeof fetch>(async (_input, init) => {
    expect(new Headers(init?.headers).get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    throw Error("private transport details");
  });
  failed.mockClear();
  expect(await createEditorialPurgeVerifier(unsafeFetch, { failed })([key])).toBe(false);
  expect(failed.mock.calls[0][0]).toMatchObject({ boundary: "origin", outcome: "transport", statusClass: "none" });
  expect(JSON.stringify(failed.mock.calls)).not.toMatch(/private/);
});

test("a twenty-media retirement fits the bounded observation budget without increasing concurrency", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  let active = 0;
  let peak = 0;
  const fetchProbe = vi.fn<typeof fetch>(async (input, init) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve, reject) => {
      setTimeout(resolve, 10);
      init?.signal?.addEventListener("abort", () => reject(Error("deadline")), { once: true });
    });
    active--;
    return new Response(null, { status: 404, headers: String(input).startsWith("https://images.") ? { [editorialCacheProbeHeader]: "all" } : {} });
  });
  try {
    const keys = Array.from({ length: 20 }, (_, index) => `editorial/media-${index}/${"a".repeat(64)}`);
    expect(await createEditorialPurgeVerifier(fetchProbe)(keys)).toBe(true);
    expect(peak).toBeLessThanOrEqual(5);
    expect(fetchProbe).toHaveBeenCalledTimes(20 * (2));
    expect(timeout.mock.calls[0]).toEqual([30000]);
  }
  finally {
    vi.restoreAllMocks();
  }
});

test.each([undefined, "1"])("older probe marker %s cannot certify a complete observation", async (marker) => {
  const probe = vi.fn<typeof fetch>(async input => new Response(null, {
    status: 404, headers: String(input).includes("https://images.") && marker ? { [editorialCacheProbeHeader]: marker } : {},
  }));
  expect(await createEditorialPurgeVerifier(probe)([key])).toBe(false);
});

test.each(["3840/jpeg", "999/jpeg", "750/private-token"])("retains only allowed resident variant %s in the bounded diagnostic", async (resident) => {
  const failed = vi.fn();
  const probe = vi.fn<typeof fetch>(async input => new Response(null, {
    status: String(input).startsWith("https://www.") ? 404 : 200,
    headers: { [editorialCacheVariantHeader]: resident },
  }));
  expect(await createEditorialPurgeVerifier(probe, { failed })([key])).toBe(false);
  expect(failed.mock.calls[0][0]).toMatchObject({ boundary: "worker", statusClass: "2xx" });
  if (resident === "3840/jpeg") expect(failed.mock.calls[0][0]).toMatchObject({ width: 3840, format: "jpeg" });
  else expect(failed.mock.calls[0][0]).not.toHaveProperty("width");
  expect(JSON.stringify(failed.mock.calls)).not.toContain("private-token");
});

test("missing server capability cannot certify absence or issue a full scan", async () => {
  const probe = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));
  expect(await createVerifier(probe)([key])).toBe(false);
  expect(probe).toHaveBeenCalledTimes(1);
});
