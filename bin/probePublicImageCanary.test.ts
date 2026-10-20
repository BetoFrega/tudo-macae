import { describe, expect, test, vi } from "vitest";
import { probePublicImageCanary } from "./probe-public-image-canary.mjs";

describe("public image canary probe", () => {
  test("requires a live sample after checking the closed route", async () => {
    const fetchImplementation = vi.fn(async () => new Response("denied", {
      status: 400,
    }));

    const report = await probePublicImageCanary({ fetchImplementation });

    expect(report.passed).toBe(false);
    expect(report.results).toContainEqual(expect.objectContaining({
      id: "delivery.sample",
      passed: false,
      detail: expect.stringContaining("required"),
    }));
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fetchImplementation).toHaveBeenCalledWith(
      expect.stringContaining("origin=https%3A%2F%2Fattacker.example"),
      { redirect: "manual" },
    );
  });

  test("requires a warm second response when a sample is configured", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("image", {
        headers: {
          "content-type": "image/webp",
          "x-image-cache": "miss",
          "x-image-result": "transformed",
        },
      }))
      .mockResolvedValueOnce(new Response("image", {
        headers: {
          "content-type": "image/webp",
          "x-image-cache": "hit",
          "x-image-result": "transformed",
        },
      }));

    const report = await probePublicImageCanary({
      fetchImplementation,
      sampleKey: "ad-images/ad-1/image.webp",
    });

    expect(report.passed).toBe(true);
  });

  test("accepts a sample already warm in the edge cache", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("image", {
        headers: {
          "content-type": "image/webp",
          "x-image-cache": "hit",
          "x-image-result": "transformed",
        },
      }))
      .mockResolvedValueOnce(new Response("image", {
        headers: {
          "content-type": "image/webp",
          "x-image-cache": "hit",
          "x-image-result": "transformed",
        },
      }));

    const report = await probePublicImageCanary({
      fetchImplementation,
      sampleKey: "ad-images/ad-1/image.webp",
    });

    expect(report.passed).toBe(true);
  });

  test.each([
    { status: 206, contentType: "image/webp", caseName: "partial first response" },
    { status: 200, contentType: "text/plain", caseName: "non-image first response" },
  ])("rejects a $caseName", async ({ status, contentType }) => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("denied", { status: 400 }))
      .mockResolvedValueOnce(new Response("image", {
        status,
        headers: {
          "content-type": contentType,
          "x-image-cache": "hit",
          "x-image-result": "transformed",
        },
      }))
      .mockResolvedValueOnce(new Response("image", {
        headers: {
          "content-type": "image/webp",
          "x-image-cache": "hit",
          "x-image-result": "transformed",
        },
      }));

    const report = await probePublicImageCanary({
      fetchImplementation,
      sampleKey: "ad-images/ad-1/image.webp",
    });

    expect(report.passed).toBe(false);
  });
});
