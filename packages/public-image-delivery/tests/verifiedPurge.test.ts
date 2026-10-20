import { editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "../probeAuthorization";
import { expect, test, vi } from "vitest";
import { createVerifiedPublicImagePurger } from "../verifiedPurge";
import { createPublicImageWorker } from "../worker";
import { editorialCacheProbeHeader } from "../contract";

const key = `editorial/photo/${"a".repeat(64)}`;
const success = { success: true, attempts: 2, failures: [] };

test("repeats purge when a delayed cache write lands between absent observations", async () => {
  let release!: () => void, cached: Response | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: Promise<unknown>[] = [];
  const worker = createPublicImageWorker({
    cache: { match: async () => cached?.clone(), put: async (_request, response) => {
      await gate;
      cached = response;
    } },
    checkOrigin: async () => new Response(null, { status: 200 }),
    fetchOriginal: async () => new Response("original"),
    transform: async () => ({ response: new Response("old image"), failure: "transformation" }),
    log: () => {},
  });
  const configuration = { publicHost: "images.tudomacae.com.br", editorialOrigin: "https://www.tudomacae.com.br", editorialCacheProbeSecret: "test-probe-secret" };
  const url = `https://images.tudomacae.com.br/v1/editorial/hero/750/${encodeURIComponent(key)}`;
  await worker.fetch(new Request(url, { headers: { cookie: `ph_token_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "visitor" }))}` } }), configuration, (promise) => {
    writes.push(promise);
  });
  const purgeMany = vi.fn(async () => {
    cached = undefined;
    return success;
  });
  let waited = false;
  const purger = createVerifiedPublicImagePurger({
    purgeMany,
    verifyAbsent: async () => {
      const request = new Request(url, { method: "HEAD", headers: { [editorialCacheProbeHeader]: "all" } });
      request.headers.set(editorialCacheProbeAuthorizationHeader, await signEditorialCacheProbe(request, configuration.editorialCacheProbeSecret));
      return (await worker.fetch(request, configuration)).status === 404;
    },
    wait: async () => {
      if (!waited) {
        waited = true;
        release();
        await Promise.all(writes);
      }
    },
  });
  expect(await purger.purgeMany([key])).toMatchObject({ success: true, attempts: 4 });
  expect(purgeMany).toHaveBeenCalledTimes(2);
  expect(cached).toBeUndefined();
});

test.each(["present", "unreachable"])("cannot certify %s cache and bounds retries", async (state) => {
  const purgeMany = vi.fn(async () => success);
  const purger = createVerifiedPublicImagePurger({ purgeMany, wait: async () => {},
    verifyAbsent: async () => {
      if (state === "unreachable") throw Error("offline");
      return false;
    } });
  const result = await purger.purgeMany([key]);
  expect(result.success).toBe(false);
  expect(result.failures).toEqual([expect.objectContaining({ cause: "verification" })]);
  expect(purgeMany).toHaveBeenCalledTimes(3);
});

test("provider failure remains unconfirmed and skips positive verification", async () => {
  const verifyAbsent = vi.fn(async () => true);
  const purger = createVerifiedPublicImagePurger({
    purgeMany: async () => ({ success: false, attempts: 3, failures: [{ layer: "worker", cause: "authorization", tags: [] }] }),
    verifyAbsent, wait: async () => {},
  });
  expect((await purger.purgeMany([key])).success).toBe(false);
  expect(verifyAbsent).not.toHaveBeenCalled();
});
