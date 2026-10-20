// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const execute = promisify(execFile);

test.skipIf(inWorkers)("issues test identity and simulates a write outage without building the Worker", async () => {
  // No Worker source or wrangler binary exists in this directory.
  const directory = await mkdtemp(join(tmpdir(), "article-index-preload-"));
  try {
    const result = await execute(process.execPath, [
      "--import", resolve("tests/e2e/bin/articleIndexTestPreload.mjs"),
      "--input-type=module", "--eval", `
const endpoint = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https://article-index.test";
const denied = await fetch(endpoint);
const identity = await fetch(endpoint, { headers: { "Metadata-Flavor": "Google" } });
const token = await identity.text();
const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
const write = await fetch("https://article-index.test/articles/draft", {
  method: "DELETE", headers: { authorization: "Bearer " + token },
});
console.log(JSON.stringify({ denied: denied.status, identity: identity.status,
  audience: payload.aud, outage: write.status }));
`,
    ], {
      cwd: directory,
      env: { ...process.env, NEXT_PUBLIC_APP_ENV: "test",
        AUTHENTICATION_API_URL: "http://127.0.0.1:9999/",
        PUBLIC_ARTICLE_INDEX_URL: "https://article-index.test" },
      timeout: 15_000,
    });
    expect(JSON.parse(result.stdout)).toEqual({
      denied: 403, identity: 200,
      audience: "https://article-index.test", outage: 503,
    });
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
});
