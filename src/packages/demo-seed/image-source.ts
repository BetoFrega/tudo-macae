export type CuratedImageLicense
  = "Public domain"
    | "CC0"
    | "CC BY 2.0"
    | "CC BY 4.0"
    | "CC BY-SA 2.0"
    | "CC BY-SA 2.5"
    | "CC BY-SA 3.0"
    | "CC BY-SA 4.0";

/** Supplier-independent facts needed to retrieve and account for one file. */
export interface CuratedImageSource {
  key: string;
  url: string;
  sha1: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  author: string;
  license: CuratedImageLicense;
  origin: string;
}

export interface DownloadedDemoImage {
  bytes: Uint8Array;
  mimeType: CuratedImageSource["mimeType"];
}

export interface DemoImageSource {
  download(source: CuratedImageSource): Promise<DownloadedDemoImage>;
}

interface DemoImageSourceOptions {
  fetchImage?: typeof fetch;
  minimumIntervalMs?: number;
  now?: () => number;
  timeoutMs?: number;
  retryDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const DEFAULT_MINIMUM_INTERVAL_MS = 1_000;
const RATE_LIMIT_FALLBACK_MS = 5_000;
const ATTEMPTS_PER_FILE = 2;
const USER_AGENT = "Tudo-Macae-demo-seed/1.0 (https://github.com/BetoFrega/tudo-macae)";

class DownloadIntegrityError extends Error {}

class DownloadHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(`Download returned HTTP ${status}.`);
  }
}

function retryAfterDelayMs(value: string | null, now: number): number | null {
  if (value === null || value.trim() === "") return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

async function downloadOnce(
  source: CuratedImageSource,
  fetchImage: typeof fetch,
  timeoutMs: number,
): Promise<DownloadedDemoImage> {
  const response = await fetchImage(source.url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new DownloadHttpError(
      response.status,
      response.headers.get("Retry-After"),
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const sha1 = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")).join("");
  if (sha1 !== source.sha1) {
    throw new DownloadIntegrityError(
      `Downloaded bytes failed integrity verification: expected ${source.sha1}, got ${sha1}.`,
    );
  }

  return { bytes, mimeType: source.mimeType };
}

/** External HTTP adapter: timeout, one retry and byte-integrity verification. */
export function createDemoImageSource({
  fetchImage = fetch,
  minimumIntervalMs = DEFAULT_MINIMUM_INTERVAL_MS,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
}: DemoImageSourceOptions = {}): DemoImageSource {
  const completedOrRunning = new Map<
    string,
    Promise<DownloadedDemoImage>
  >();
  let nextRequestAt = 0;

  async function waitForRequestSlot(): Promise<void> {
    const currentTime = now();
    const delay = Math.max(0, nextRequestAt - currentTime);
    nextRequestAt = Math.max(currentTime, nextRequestAt) + minimumIntervalMs;
    if (delay > 0) {
      await sleep(delay);
    }
  }

  return {
    async download(source) {
      const cached = completedOrRunning.get(source.url);
      if (cached) return await cached;

      const result = (async () => {
        let lastError: unknown;
        let nextRetryDelayMs = retryDelayMs;

        for (let attempt = 0; attempt < ATTEMPTS_PER_FILE; attempt += 1) {
          if (attempt > 0) {
            await sleep(nextRetryDelayMs);
          }

          try {
            await waitForRequestSlot();
            return await downloadOnce(source, fetchImage, timeoutMs);
          }
          catch (error) {
            lastError = error;
            if (error instanceof DownloadIntegrityError) break;

            if (error instanceof DownloadHttpError && error.status === 429) {
              // Wikimedia requires Retry-After to win; without usable guidance,
              // retrying sooner than five seconds can extend the rate limit.
              nextRetryDelayMs = retryAfterDelayMs(error.retryAfter, now())
                ?? Math.max(retryDelayMs, RATE_LIMIT_FALLBACK_MS);
            }
          }
        }

        throw lastError;
      })();
      completedOrRunning.set(source.url, result);

      return await result;
    },
  };
}
