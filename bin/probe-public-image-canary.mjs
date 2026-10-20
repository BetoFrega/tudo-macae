import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../config/public-image-canary.json", import.meta.url);

async function readManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}

function result(id, passed, detail) {
  return { id, passed, detail };
}

async function request(fetchImplementation, url) {
  try {
    return await fetchImplementation(url, { redirect: "manual" });
  }
  catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function denialResult(id, response) {
  return response instanceof Error
    ? result(id, false, response.message)
    : result(id, response.status === 400, `status=${response.status}`);
}

function servedTransformedImage(response, cacheStates) {
  return response.status === 200
    && cacheStates.includes(response.headers.get("x-image-cache"))
    && response.headers.get("x-image-result") === "transformed"
    && response.headers.get("content-type")?.startsWith("image/");
}

function deliveryDetail(response) {
  return `${response.status}/${response.headers.get("x-image-cache")}/${response.headers.get("x-image-result")}`;
}

async function sampleDeliveryResult(fetchImplementation, sampleUrl) {
  const first = await request(fetchImplementation, sampleUrl);
  const second = await request(fetchImplementation, sampleUrl);
  if (first instanceof Error || second instanceof Error) {
    return result("delivery.sample", false, "request failed");
  }
  return result(
    "delivery.sample",
    Boolean(servedTransformedImage(first, ["miss", "hit"]) && servedTransformedImage(second, ["hit"])),
    `first=${deliveryDetail(first)}; second=${deliveryDetail(second)}`,
  );
}

export async function probePublicImageCanary({
  fetchImplementation = fetch,
  sampleKey = process.env.PUBLIC_IMAGE_CANARY_SAMPLE_KEY,
} = {}) {
  const manifest = await readManifest();
  const baseUrl = `https://${manifest.worker.host}`;
  const sampleWidth = manifest.presets["ad/card"][0];
  const checks = [
    [
      "denial.width",
      `${baseUrl}/v1/ad/card/777/ad-images%2Fprobe%2Fimage.webp`,
    ],
    [
      "denial.privatePrefix",
      `${baseUrl}/v1/ad/card/${sampleWidth}/editorial%2Fprivate.webp`,
    ],
    [
      "denial.arbitraryOrigin",
      `${baseUrl}/v1/ad/card/${sampleWidth}/ad-images%2Fprobe%2Fimage.webp?origin=${encodeURIComponent("https://attacker.example/private.webp")}`,
    ],
  ];
  const results = [];
  for (const [id, url] of checks) {
    results.push(denialResult(id, await request(fetchImplementation, url)));
  }

  if (!sampleKey) {
    results.push(result(
      "delivery.sample",
      false,
      "required: set PUBLIC_IMAGE_CANARY_SAMPLE_KEY to an existing ad-images key",
    ));
  }
  else {
    const sampleUrl = `${baseUrl}/v1/ad/card/${sampleWidth}/${encodeURIComponent(sampleKey)}`;
    results.push(await sampleDeliveryResult(fetchImplementation, sampleUrl));
  }

  return { manifest, results, passed: results.every(item => item.passed) };
}

async function main() {
  const report = await probePublicImageCanary();
  for (const check of report.results) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id} ${check.detail}`);
  }
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) await main();
