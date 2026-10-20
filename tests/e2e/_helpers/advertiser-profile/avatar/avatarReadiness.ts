import type { Locator } from "@playwright/test";
import { expect, test } from "../../fixtures";

export interface AvatarReadinessDiagnostic {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  loading: string;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  visible: boolean;
  devicePixelRatio: number;
  connected: boolean;
  ariaHidden: string | null;
  fallbackPresent: boolean;
  currentSource: {
    host: string;
    path: string;
    width?: string | null;
    quality?: string | null;
    srcSetDescriptor: string | null;
  } | null;
}

export interface AvatarReadinessSample {
  ready: boolean;
  currentSrc: string;
  diagnostic: AvatarReadinessDiagnostic;
}

interface AvatarDecodeDiagnostic {
  status: "resolved" | "rejected" | "timeout" | "not-attempted";
  errorName?: string;
  sourceStable?: boolean;
  connected?: boolean;
}

interface AvatarLoadFailureDiagnostic {
  lastPoll: AvatarReadinessDiagnostic | { state: "unavailable" };
  decode?: AvatarDecodeDiagnostic;
}

// Runs in the browser: every helper it uses must be declared inside it.
function sampleAvatarReadiness(element: Element): AvatarReadinessSample {
  const image = element as HTMLImageElement;
  const rect = image.getBoundingClientRect();
  const style = getComputedStyle(image);
  function matchingDescriptor(candidate: string): string | null {
    const [candidateSrc, descriptor] = candidate.trim().split(/\s+/, 2);
    try {
      return new URL(candidateSrc, document.baseURI).href === image.currentSrc
        && descriptor && /^(?:\d+(?:\.\d+)?x|\d+w)$/.test(descriptor)
        ? descriptor
        : null;
    }
    catch {
      return null;
    }
  }
  function describeCurrentSource(): AvatarReadinessDiagnostic["currentSource"] {
    try {
      const current = new URL(image.currentSrc);
      const isOptimizer = current.pathname === "/_next/image";
      const srcSetDescriptor = image.srcset.split(",").map(matchingDescriptor).find(Boolean) ?? null;
      return {
        host: current.host,
        path: isOptimizer ? current.pathname : "image-source",
        ...(isOptimizer ? { width: current.searchParams.get("w"), quality: current.searchParams.get("q") } : {}),
        srcSetDescriptor,
      };
    }
    catch {
      return null;
    }
  }
  function isVisible() {
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0;
  }
  return {
    ready: image.complete && image.naturalWidth > 0,
    currentSrc: image.currentSrc,
    diagnostic: {
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      loading: image.loading,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visible: isVisible(),
      devicePixelRatio: window.devicePixelRatio,
      connected: image.isConnected,
      ariaHidden: image.getAttribute("aria-hidden"),
      fallbackPresent: Boolean(image.closest("[data-slot='avatar']")?.querySelector("[data-slot='avatar-fallback']")),
      currentSource: describeCurrentSource(),
    },
  };
}

// Runs in the browser: every helper it uses must be declared inside it.
async function probeAvatarDecode(element: Element, expectedCurrentSrc: string): Promise<AvatarDecodeDiagnostic> {
  const image = element as HTMLImageElement;
  if (!image.isConnected || image.currentSrc !== expectedCurrentSrc || !image.complete || image.naturalWidth !== 0) {
    return { status: "not-attempted" as const, connected: image.isConnected, sourceStable: image.currentSrc === expectedCurrentSrc };
  }
  let timer: number | undefined;
  const decoded = image.decode().then(
    () => ({ status: "resolved" as const }),
    (error: unknown) => {
      const name = error instanceof DOMException || error instanceof Error ? error.name : "";
      const errorName = ["EncodingError", "AbortError", "InvalidStateError"].includes(name) ? name : "other";
      return { status: "rejected" as const, errorName };
    },
  );
  const outcome = await Promise.race([
    decoded,
    new Promise<{ status: "timeout" }>((resolve) => {
      timer = window.setTimeout(() => resolve({ status: "timeout" }), 750);
    }),
  ]);
  if (timer !== undefined) window.clearTimeout(timer);
  return {
    ...outcome,
    connected: image.isConnected,
    sourceStable: image.currentSrc === expectedCurrentSrc,
  };
}

/** A complete, connected image with no decoded width failed to decode rather than to load. */
function isUndecodedImage(sample: AvatarReadinessSample) {
  return sample.diagnostic.complete
    && sample.diagnostic.naturalWidth === 0
    && sample.diagnostic.connected
    && Boolean(sample.currentSrc);
}

async function attachAvatarLoadFailure(avatar: Locator, consumer: string, lastSample: AvatarReadinessSample | null) {
  const diagnostic: AvatarLoadFailureDiagnostic = {
    lastPoll: lastSample?.diagnostic ?? { state: "unavailable" },
  };
  if (lastSample && isUndecodedImage(lastSample)) {
    diagnostic.decode = await avatar.evaluate(probeAvatarDecode, lastSample.currentSrc)
      .catch(() => ({ status: "not-attempted" as const }));
  }
  await test.info().attach(`avatar-${consumer}-load-failure.json`, {
    body: JSON.stringify(diagnostic, null, 2),
    contentType: "application/json",
  }).catch(() => undefined);
}

/** Waits until the avatar has decoded pixels; on timeout attaches the last readiness sample. */
export async function waitForAvatarReadiness(avatar: Locator, consumer: string) {
  const readinessState: { lastSample: AvatarReadinessSample | null } = { lastSample: null };
  try {
    await expect.poll(async () => {
      readinessState.lastSample = await avatar.evaluate(sampleAvatarReadiness);
      return readinessState.lastSample.ready;
    }).toBe(true);
  }
  catch (error) {
    await attachAvatarLoadFailure(avatar, consumer, readinessState.lastSample);
    throw error;
  }
}
