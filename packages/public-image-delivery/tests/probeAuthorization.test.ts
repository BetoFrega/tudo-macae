import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { authorizeEditorialCacheProbe, deriveEditorialCacheProbeSecret, editorialCacheProbeAuthorizationHeader, signEditorialCacheProbe } from "../probeAuthorization";

const secret = "synthetic-probe-capability";
const now = 1791324000000;
const url = "https://images.tudomacae.com.br/v1/editorial/hero/750/editorial%2Fphoto%2Faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
function request() {
  return new Request(url, { method: "HEAD", headers: { "x-editorial-cache-probe": "all" } });
}

test("WebCrypto derivation matches the secret transfer without exposing provider credentials", async () => {
  const token = "synthetic-provider-token";
  expect(await deriveEditorialCacheProbeSecret(token)).toBe(createHmac("sha256", token).update("editorial-cache-probe:v1").digest("hex"));
});

test.each(["url", "method", "mode", "signature", "expired", "future"])("signature denies altered %s", async (change) => {
  let probe = request();
  const signed = await signEditorialCacheProbe(probe, secret, now);
  if (change === "url") probe = new Request(url.replace("photo", "other"), probe);
  if (change === "method") probe = new Request(probe, { method: "GET" });
  if (change === "mode") probe.headers.set("x-editorial-cache-probe", "1");
  probe.headers.set(editorialCacheProbeAuthorizationHeader, change === "signature" ? signed.slice(0, -1) + (signed.endsWith("0") ? "1" : "0") : signed);
  expect(await authorizeEditorialCacheProbe(probe, secret, now + (change === "expired" ? 61000 : change === "future" ? -61000 : 0))).toBe(false);
});

test("accepts a signed probe only within its bounded clock window", async () => {
  const probe = request();
  probe.headers.set(editorialCacheProbeAuthorizationHeader, await signEditorialCacheProbe(probe, secret, now));
  expect(await authorizeEditorialCacheProbe(probe, secret, now + 60000)).toBe(true);
  expect(await authorizeEditorialCacheProbe(probe, secret, now - 60000)).toBe(true);
  expect(await authorizeEditorialCacheProbe(probe, undefined, now)).toBe(false);
});
