import { expect, test, vi } from "vitest";
import { probePublicImageRevocation } from "./probe-public-image-revocation.mjs";

const sampleKey = "ad-images/disposable/photo.webp";

function image(cache: string) {
  return new Response("image", {
    headers: {
      "content-type": "image/webp",
      "x-image-cache": cache,
      "x-image-result": "transformed",
    },
  });
}

test("warms AVIF, WebP and JPEG under one object key", async () => {
  const fetchImplementation = vi.fn()
    .mockImplementationOnce(async () => image("miss"))
    .mockImplementationOnce(async () => image("hit"))
    .mockImplementationOnce(async () => image("miss"))
    .mockImplementationOnce(async () => image("hit"))
    .mockImplementationOnce(async () => image("miss"))
    .mockImplementationOnce(async () => image("hit"));

  const report = await probePublicImageRevocation({ phase: "warm", sampleKey, executionId: "revocation-1", fetchImplementation });

  expect(report.passed).toBe(true);
  expect(report.executionId).toBe("revocation-1");
  expect(report.results.map(result => result.format)).toEqual(["avif", "webp", "jpeg"]);
  expect(fetchImplementation.mock.calls.map(call => call[1].headers.Accept))
    .toEqual(["image/avif", "image/avif", "image/webp", "image/webp", "image/jpeg", "image/jpeg"]);
});

test("fails verification if either cache layer still serves a removed image", async () => {
  const fetchImplementation = vi.fn()
    .mockResolvedValueOnce(revoked())
    .mockResolvedValueOnce(revoked())
    .mockResolvedValueOnce(image("hit"))
    .mockResolvedValueOnce(image("hit"))
    .mockResolvedValueOnce(image("miss"))
    .mockResolvedValueOnce(image("miss"));

  const report = await probePublicImageRevocation({ phase: "verify", sampleKey, fetchImplementation });

  expect(report.passed).toBe(false);
  expect(report.results.map(result => result.passed)).toEqual([true, false, false]);
});

function revoked() {
  return new Response("gone", { status: 410, headers: {
    "x-image-cache": "miss", "x-image-result": "gone",
  } });
}

test("passes verification only when the Worker reports no cached variant", async () => {
  const fetchImplementation = vi.fn(async () => revoked());

  const report = await probePublicImageRevocation({ phase: "verify", sampleKey, fetchImplementation });

  expect(report.passed).toBe(true);
  expect(fetchImplementation).toHaveBeenCalledTimes(6);
});

test("does not treat generic 404 or a guarded cache hit as a successful purge", async () => {
  const fetchImplementation = vi.fn()
    .mockResolvedValueOnce(new Response("gone", { status: 404 }))
    .mockResolvedValueOnce(revoked())
    .mockResolvedValueOnce(new Response("gone", { status: 410, headers: {
      "x-image-cache": "hit", "x-image-result": "gone",
    } }))
    .mockResolvedValueOnce(revoked())
    .mockResolvedValueOnce(revoked())
    .mockResolvedValueOnce(revoked());

  const report = await probePublicImageRevocation({ phase: "verify", sampleKey, fetchImplementation });

  expect(report.passed).toBe(false);
  expect(report.results.map(result => result.passed)).toEqual([false, false, true]);
});

test("does not mistake an origin outage for revocation", async () => {
  const fetchImplementation = vi.fn(async () => new Response("unavailable", { status: 502 }));

  const report = await probePublicImageRevocation({ phase: "verify", sampleKey, fetchImplementation });

  expect(report.passed).toBe(false);
});

test("a stalled request fails verification within its deadline", async () => {
  const fetchImplementation = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
  }));

  const report = await probePublicImageRevocation({
    phase: "verify", sampleKey, fetchImplementation, requestTimeoutMs: 5,
  });

  expect(report.passed).toBe(false);
  expect(report.results.every(result => result.detail === "0/null/null,0/null/null")).toBe(true);
  expect(fetchImplementation).toHaveBeenCalledTimes(6);
});
