#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules/.bin/wrangler");
const config = path.join(root, "apps/public-images/wrangler.jsonc");
// The probe secret derives from this numbered version; a new version rotates the probe secret too.
const purgeTokenVersion = "1";

function run(command, args, { input, capture = false, maxBytes = 65_536 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" },
      stdio: [input ? "pipe" : "ignore", capture ? "pipe" : "ignore", "ignore"],
    });
    const chunks = [];
    let size = 0;
    let failed = false;

    child.on("error", () => {
      failed = true;
      reject(new Error("Transfer command could not start"));
    });
    child.stdout?.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        chunk.fill(0);
        for (const buffered of chunks) buffered.fill(0);
        child.kill();
        return;
      }
      chunks.push(chunk);
    });
    child.stdin?.on("error", () => {});
    if (input) child.stdin.end(input);
    child.on("close", (code) => {
      if (failed || code !== 0) {
        for (const chunk of chunks) chunk.fill(0);
        reject(new Error("Transfer command failed"));
        return;
      }
      const result = Buffer.concat(chunks);
      for (const chunk of chunks) chunk.fill(0);
      resolve(result);
    });
  });
}

async function main() {
  if (process.argv[2] !== "--production") {
    throw new Error("Pass --production after authorization to configure the production image Worker");
  }

  // Keep the value in process memory only; no child stderr, stdout, or value reaches the agent.
  const proof = await run("gcloud", [
    "secrets", "versions", "access", purgeTokenVersion,
    "--secret=public-image-cache-purge-token", "--project=macaetem-dev",
  ], { capture: true });
  if (proof.length === 0) throw new Error("Purge credential is unavailable");

  const scoped = Buffer.from(createHmac("sha256", proof).update("editorial-cache-probe:v1").digest("hex"));
  proof.fill(0);
  try {
    await run(wrangler, [
      "secret", "put", "EDITORIAL_CACHE_PROBE_SECRET",
      "--config", config, "--env", "production",
    ], { input: scoped });
  }
  finally {
    scoped.fill(0);
  }

  const names = await run(wrangler, [
    "secret", "list", "--config", config, "--env", "production", "--format", "json",
  ], { capture: true, maxBytes: 1_048_576 });
  const exists = JSON.parse(names.toString("utf8")).some(({ name }) => name === "EDITORIAL_CACHE_PROBE_SECRET");
  if (!exists) throw new Error("Image probe secret name readback failed");
  console.log("Editorial cache probe capability transfer confirmed by secret name only.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
