import { expect, test } from "vitest";
import { withWorkerVersion } from "./workerVersion";

const version = "0f8d5b2e-7c1a-4e39-9b6d-2a4c8e1f3d57";
const handler = withWorkerVersion({ fetch: (_request: Request, _env: Record<string, unknown>, _ctx: unknown) => new Response("ok", { status: 201, headers: { "cache-control": "private" } }) });

test("names the version Cloudflare serves on every response", async () => {
  const response = await handler.fetch(new Request("https://www.tudomacae.com.br/"), { CF_VERSION_METADATA: { id: version } }, undefined);
  expect(response.status).toBe(201);
  expect(response.headers.get("x-terms-worker-version")).toBe(version);
  expect(response.headers.get("cache-control")).toBe("private");
  expect(await response.text()).toBe("ok");
});

test("leaves the response alone without version metadata", async () => {
  const response = await handler.fetch(new Request("https://www.tudomacae.com.br/"), {}, undefined);
  expect(response.headers.has("x-terms-worker-version")).toBe(false);
});
