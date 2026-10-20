import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { pageObject } from "../../fixtures/POMs/pageObject";
import { waitForAvatarReadiness } from "./avatarReadiness";

export const circularImageScreenshot = { maxDiffPixels: 20 };

export interface AvatarDeliveryEvidence {
  consumer: string;
  dpr: number;
  currentSrc: string;
  optimizerWidth: number | null;
  optimizerStatus: number | null;
  optimizerContentType: string | null;
  optimizerBytes: number | null;
  optimizerSha256: string | null;
  optimizerDecodedWidth: number | null;
  optimizerDecodedHeight: number | null;
  naturalWidth: number;
  complete: boolean;
  transferSize: number | null;
}

export interface OptimizedImageResponseEvidence {
  status: number;
  contentType: string | null;
  bytes: number;
  sha256: string;
  decodedWidth: number;
  decodedHeight: number;
}

export type { AvatarReadinessDiagnostic, AvatarReadinessSample } from "./avatarReadiness";

export type OptimizedImageResponses = Map<string, Promise<OptimizedImageResponseEvidence | null>>;

export interface AvatarVisualCapture {
  consumer: string;
  route: string;
  state: string;
  viewport: { width: number; height: number } | null;
  dpr: number;
  filename: string;
}

export interface AvatarJourneyPhaseDiagnostic {
  phase: string;
  optimizerFailed: boolean;
  directRequested: boolean;
  readyState: "loading" | "interactive" | "complete" | "unknown";
  requests: {
    optimizer: number;
    matchingOptimizer: number;
    directImage: number;
  };
}

/** Sized avatar requests: the API Worker's `?w=` variants for Classifieds photos. */
export function isAvatarVariant(url: URL): boolean {
  return url.pathname.startsWith("/api/classifieds/photos/public/") && url.searchParams.has("w");
}

const maxDiagnosticRequestCount = 20;

export function incrementDiagnosticCount(count: number): number {
  return Math.min(count + 1, maxDiagnosticRequestCount);
}

export async function captureAvatarSurface(
  page: Page,
  consumer: string,
  route: string,
  state: string,
  dpr: number,
): Promise<AvatarVisualCapture> {
  const filename = `${consumer}-dpr${dpr}-${state}.png`;
  const outputPath = test.info().outputPath("visual-evidence", filename);
  await mkdir(dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, animations: "disabled" });
  return {
    consumer,
    route,
    state,
    viewport: page.viewportSize(),
    dpr,
    filename,
  };
}

function optimizerResponseEvidence(response: OptimizedImageResponseEvidence | null | undefined) {
  if (!response) {
    return {
      optimizerStatus: null,
      optimizerContentType: null,
      optimizerBytes: null,
      optimizerSha256: null,
      optimizerDecodedWidth: null,
      optimizerDecodedHeight: null,
    };
  }
  return {
    optimizerStatus: response.status,
    optimizerContentType: response.contentType,
    optimizerBytes: response.bytes,
    optimizerSha256: response.sha256,
    optimizerDecodedWidth: response.decodedWidth,
    optimizerDecodedHeight: response.decodedHeight,
  };
}

export async function inspectAvatar(
  page: Page,
  name: string,
  dpr: number,
  consumer: string,
  optimizedImageResponses?: OptimizedImageResponses,
): Promise<AvatarDeliveryEvidence> {
  const avatarByAlt = pageObject(page).getByAltText(name, { exact: true });
  await expect(avatarByAlt).toHaveCount(1);
  await avatarByAlt.scrollIntoViewIfNeeded();
  await waitForAvatarReadiness(avatarByAlt, consumer);
  const avatar = pageObject(page).getByRole("img", { name, exact: true });
  await expect(avatar).toBeVisible();
  const result = await avatar.evaluate((image) => {
    const img = image as HTMLImageElement;
    const timing = performance.getEntriesByName(img.currentSrc).at(-1) as PerformanceResourceTiming | undefined;
    return {
      currentSrc: img.currentSrc,
      naturalWidth: img.naturalWidth,
      complete: img.complete,
      dpr: window.devicePixelRatio,
      transferSize: timing?.transferSize ?? null,
    };
  });
  const currentSource = new URL(result.currentSrc);
  const isOptimizer = isAvatarVariant(currentSource);
  const response = isOptimizer ? await optimizedImageResponses?.get(result.currentSrc) : null;
  expect(result.dpr).toBe(dpr);
  expect(result.currentSrc).toBeTruthy();
  expect(result.naturalWidth).toBeGreaterThan(0);
  const avatarRoot = avatar.locator("xpath=ancestor::*[@data-slot='avatar'][1]");
  await expect(avatarRoot.locator("[data-slot='avatar-fallback']")).toHaveCount(0);
  return {
    ...result,
    consumer,
    optimizerWidth: isOptimizer ? Number(currentSource.searchParams.get("w")) || null : null,
    ...optimizerResponseEvidence(response),
  };
}
