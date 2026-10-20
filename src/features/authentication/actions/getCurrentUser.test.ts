import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { beforeEach, expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
beforeEach((context) => {
  if (inWorkers) context.skip();
});

const execute = promisify(execFile);

test("the server getter preserves render isolation and the session-sharing gate", async () => {
  const source = await readFile(new URL("./getCurrentUser.ts", import.meta.url), "utf8");
  const getter = source.replace(/^import .*;$/gm, "");
  const readerUrl = pathToFileURL(join(process.cwd(), "src/integrations/authentication/renderSessionReader.ts")).href;
  const directory = await mkdtemp(join(tmpdir(), "account-render-session-"));
  const runner = join(directory, "probe.mjs");
  try {
    await writeFile(runner, `
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import assert from "node:assert/strict";
const require = createRequire(${JSON.stringify(import.meta.url)});
const { cache, createElement } = require("react");
const { renderToPipeableStream } = require("next/dist/compiled/react-server-dom-webpack/server.node");
const { createRenderSessionReader } = await import(${JSON.stringify(readerUrl)});
let sessionValue = "first-request";
let reads = 0;
let sharing = true;
let flagUnavailable = false;
async function cookies() { return { get: () => ({ value: sessionValue }) }; }
async function resolveSession(value) {
  reads++;
  return value === "invalid" ? { status: "invalid" } : { status: "valid", user: { uid: value } };
}
const readCurrentUserForRender = createRenderSessionReader({
  cache,
  sharingEnabled: () => {
    if (flagUnavailable) throw new Error("flag unavailable");
    return sharing;
  },
  resolve: async () => {
    const cookieStore = await cookies();
    const session = await resolveSession(cookieStore.get("session")?.value);
    return session.status === "valid" ? session.user : null;
  },
});
${getter}
async function Probe() {
  const parent = await getCurrentUser();
  const child = await getCurrentUser();
  if (sharing && !flagUnavailable) assert.equal(parent, child);
  else assert.notEqual(parent, child);
  assert.equal(parent?.uid ?? null, sessionValue === "invalid" ? null : sessionValue);
  return createElement("span", null, parent?.uid ?? "absent");
}
async function request() {
  await new Promise((resolve, reject) => {
    const output = new PassThrough();
    output.on("data", () => {});
    output.on("end", resolve);
    output.on("error", reject);
    renderToPipeableStream(createElement(Probe), {}, { onError: reject }).pipe(output);
  });
}
await request();
assert.equal(reads, 1);
sessionValue = "second-request";
await request();
assert.equal(reads, 2);
sessionValue = "invalid";
await request();
assert.equal(reads, 3);
sharing = false;
sessionValue = "flag-off-request";
await request();
assert.equal(reads, 5);
sharing = true;
flagUnavailable = true;
sessionValue = "flag-unavailable-request";
await request();
assert.equal(reads, 7);
console.log(JSON.stringify({ requests: 5, authReads: reads }));
`);
    const result = await execute(process.execPath, ["--conditions=react-server", "--import", "tsx", runner]);
    expect(JSON.parse(result.stdout)).toEqual({ requests: 5, authReads: 7 });
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
});
