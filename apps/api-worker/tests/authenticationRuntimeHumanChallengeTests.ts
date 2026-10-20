import { expect, test } from "vitest";
import { start, siteverifyRequests } from "./authenticationRuntimeHarness";

const challenged = [
  { path: "sign-up/email", action: "signup", body: { email: "challenge@example.com", password: "abc123" } },
  { path: "sign-in/email", action: "login", body: { email: "challenge@example.com", password: "abc123" } },
  { path: "request-password-reset", action: "password-reset", body: { email: "challenge@example.com" } },
] as const;

function post(worker: Awaited<ReturnType<typeof start>>, path: string, body: object, token?: string, address = "198.51.100.40", extraHeaders: Record<string, string> = {}) {
  return worker.dispatchFetch(`http://authentication.test/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://authentication.test",
      "cf-connecting-ip": address,
      ...(token === undefined ? {} : { "x-turnstile-token": token }),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

test("challenged authentication refuses missing, failed, cross-action, foreign-host and unverifiable tokens", async () => {
  const worker = await start(true, false, true);
  // Distinct addresses and accounts keep the attempt limit, which runs first, from answering 429.
  let address = 0;
  for (const { path, action, body } of challenged) {
    const otherAction = action === "login" ? "signup" : "login";
    for (const token of [undefined, "x".repeat(2049), "rejected", `${otherAction}@authentication.test`, `${action}@evil.test`, "unreachable"]) {
      const response = await post(worker, path, { ...body, email: `challenge-${++address}@example.com` }, token, `198.51.100.${address}`);
      expect(response.status, `${path} with ${token?.slice(0, 20)}`).toBe(403);
      expect(await response.json()).toMatchObject({ code: "HUMAN_CHALLENGE_FAILED" });
    }
  }
  expect(siteverifyRequests.at(-1)?.has("remoteip")).toBe(false);
});

test("a token for the matching action and application hostname opens each challenged path", async () => {
  const worker = await start(true, false, true);
  const [signUp, signIn, reset] = challenged;
  expect((await post(worker, signUp.path, signUp.body, "signup@authentication.test")).status).toBe(200);
  expect((await post(worker, signIn.path, signIn.body, "login@authentication.test")).status).toBe(200);
  expect((await post(worker, reset.path, reset.body, "password-reset@authentication.test")).status).toBe(200);
  expect(siteverifyRequests.map(form => form.get("secret"))).toEqual(Array(3).fill("disposable-turnstile-secret"));
});

test("the emergency switch admits authentication without contacting siteverify", async () => {
  const worker = await start();
  const [signUp] = challenged;
  expect((await post(worker, signUp.path, signUp.body)).status).toBe(200);
  expect(siteverifyRequests).toHaveLength(0);
});

test("an unreachable siteverify is an unsampled dependency failure while a rejected token is not", async () => {
  const worker = await start(true, false, true);
  const [, signIn] = challenged;
  const capture = { "x-fixture-diagnostics": "capture" };
  await worker.dispatchFetch("http://authentication.test/__fixture/diagnostics");
  expect((await post(worker, signIn.path, signIn.body, "unreachable", "198.51.100.90", capture)).status).toBe(403);
  expect((await post(worker, signIn.path, signIn.body, "internal-error", "198.51.100.92", capture)).status).toBe(403);
  // Another account, so the per-account attempt limit does not answer 429 first.
  expect((await post(worker, signIn.path, { ...signIn.body, email: "challenge-bad-request@example.com" }, "bad-request", "198.51.100.93", capture)).status).toBe(403);
  expect((await post(worker, signIn.path, signIn.body, "rejected", "198.51.100.91", capture)).status).toBe(403);
  const events = await (await worker.dispatchFetch("http://authentication.test/__fixture/diagnostics")).json() as { outcome: string }[];
  // Success events are sampled, so only the failure set is exact.
  expect(events.filter(event => event.outcome === "failed")).toEqual([
    expect.objectContaining({ event: "authentication.worker.failed", failureCategory: "dependency", dependencyFailure: "http_status", dependencyStatus: 503, status: 403 }),
    expect.objectContaining({ event: "authentication.worker.failed", failureCategory: "dependency", dependencyFailure: "invalid_response", status: 403 }),
    expect.objectContaining({ event: "authentication.worker.failed", failureCategory: "dependency", dependencyFailure: "invalid_response", status: 403 }),
  ]);
  expect(JSON.stringify(events)).not.toContain("unreachable");
});
