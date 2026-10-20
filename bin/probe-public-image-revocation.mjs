import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../config/public-image-canary.json", import.meta.url);
const variants = [
  { format: "avif", accept: "image/avif" },
  { format: "webp", accept: "image/webp" },
  { format: "jpeg", accept: "image/jpeg" },
];

function assertProbeOptions({ phase, sampleKey, executionId }) {
  if (!sampleKey || !/^(ad-images|profile-photos)\/[A-Za-z0-9._/-]+$/.test(sampleKey)) {
    throw new Error("Set PUBLIC_IMAGE_REVOCATION_SAMPLE_KEY to a disposable public image object");
  }
  if (phase !== "warm" && phase !== "verify") {
    throw new Error("Set PUBLIC_IMAGE_REVOCATION_PHASE to warm or verify");
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(executionId)) {
    throw new Error("Use an opaque execution identifier without whitespace");
  }
}

async function canaryImageUrl(sampleKey) {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const imageClass = sampleKey.startsWith("ad-images/") ? "ad" : "profile";
  const preset = imageClass === "ad" ? "card" : "avatar";
  const width = manifest.presets[`${imageClass}/${preset}`][0];
  return `https://${manifest.worker.host}/v1/${imageClass}/${preset}/${width}/${encodeURIComponent(sampleKey)}`;
}

async function observeVariant(url, variant, fetchImplementation, requestTimeoutMs) {
  try {
    const response = await fetchImplementation(url, {
      headers: { Accept: variant.accept },
      redirect: "manual",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    return {
      status: response.status,
      cache: response.headers.get("x-image-cache"),
      result: response.headers.get("x-image-result"),
      mime: response.headers.get("content-type"),
    };
  }
  catch {
    return { status: 0, cache: null, result: null, mime: null };
  }
}

function isWarmTransformed(responses) {
  const transformed = responses.every(response => response.status === 200
    && response.result === "transformed"
    && response.mime?.startsWith("image/"));
  return transformed && responses[1]?.cache === "hit";
}

function isRevoked(responses) {
  return responses.every(response => response.status === 410
    && response.cache === "miss"
    && response.result === "gone");
}

/** @param {{ phase?: "warm" | "verify"; sampleKey?: string; executionId?: string; fetchImplementation?: typeof fetch; requestTimeoutMs?: number }} options */
export async function probePublicImageRevocation({
  phase,
  sampleKey,
  executionId = crypto.randomUUID(),
  fetchImplementation = fetch,
  requestTimeoutMs = 5000,
} = {}) {
  assertProbeOptions({ phase, sampleKey, executionId });
  const url = await canaryImageUrl(sampleKey);
  const results = [];

  for (const variant of variants) {
    const responses = [];
    for (let repetition = 0; repetition < 2; repetition++) {
      responses.push(await observeVariant(url, variant, fetchImplementation, requestTimeoutMs));
    }
    results.push({
      format: variant.format,
      passed: phase === "warm" ? isWarmTransformed(responses) : isRevoked(responses),
      detail: responses.map(response => `${response.status}/${response.cache}/${response.result}`).join(","),
    });
  }

  return { phase, executionId, passed: results.every(result => result.passed), results };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const report = await probePublicImageRevocation({
    phase: process.env.PUBLIC_IMAGE_REVOCATION_PHASE,
    sampleKey: process.env.PUBLIC_IMAGE_REVOCATION_SAMPLE_KEY,
    executionId: process.env.PUBLIC_IMAGE_REVOCATION_EXECUTION_ID,
  });
  console.log(`EXECUTION_ID ${report.executionId}`);
  for (const result of report.results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${report.phase}.${result.format} ${result.detail}`);
  }
  if (!report.passed) process.exitCode = 1;
}
