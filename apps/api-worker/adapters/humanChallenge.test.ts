import { expect, test, vi } from "vitest";
import { admitsHumanChallenge, HumanChallengeVerificationUnavailable, type HumanChallengeVerifier } from "../lib/humanChallenge";

const env = { TURNSTILE_ENFORCEMENT: "on", TURNSTILE_SECRET: "secret", PUBLIC_APP_ORIGIN: "https://tudomacae.com.br" };
const tokenHeaders = new Headers({ "x-turnstile-token": "token" });

function admit(verify: HumanChallengeVerifier | undefined, path = "/sign-in/email", headers = tokenHeaders, environment = env) {
  const unavailable: unknown[][] = [];
  return admitsHumanChallenge(path, headers, environment, verify, (...report) => unavailable.push(report))
    .then(admitted => ({ admitted, unavailable }));
}

test("admits a token the verifier judged for this action and host", async () => {
  const verify = vi.fn<HumanChallengeVerifier>(async () => ({ success: true, action: "login", hostname: "tudomacae.com.br" }));
  expect(await admit(verify)).toEqual({ admitted: true, unavailable: [] });
  expect(verify).toHaveBeenCalledWith("secret", "token");
});

test.each([
  { verdict: { success: false }, reason: "rejected" },
  { verdict: { success: true, action: "signup", hostname: "tudomacae.com.br" }, reason: "another action" },
  { verdict: { success: true, action: "login", hostname: "localhost" }, reason: "another host" },
])("refuses a $reason token without reporting an outage", async ({ verdict }) => {
  expect(await admit(async () => verdict)).toEqual({ admitted: false, unavailable: [] });
});

test("refuses a missing or oversized token without asking the verifier", async () => {
  const verify = vi.fn<HumanChallengeVerifier>();
  expect((await admit(verify, "/sign-in/email", new Headers())).admitted).toBe(false);
  expect((await admit(verify, "/sign-in/email", new Headers({ "x-turnstile-token": "x".repeat(2049) }))).admitted).toBe(false);
  expect(verify).not.toHaveBeenCalled();
});

test("admits unchallenged paths and the emergency switch without asking the verifier", async () => {
  const verify = vi.fn<HumanChallengeVerifier>();
  expect((await admit(verify, "/get-session")).admitted).toBe(true);
  expect((await admit(verify, "/sign-in/email", new Headers(), { ...env, TURNSTILE_ENFORCEMENT: "off" })).admitted).toBe(true);
  expect(verify).not.toHaveBeenCalled();
});

test("reports a verifier that cannot decide, and a missing secret or verifier, as an outage", async () => {
  const outage = new HumanChallengeVerificationUnavailable("http_status", 502);
  expect(await admit(() => Promise.reject(outage)))
    .toEqual({ admitted: false, unavailable: [["http_status", 502]] });
  expect(await admit(undefined)).toEqual({ admitted: false, unavailable: [["configuration", undefined]] });
  expect(await admit(vi.fn(), "/sign-in/email", tokenHeaders, { ...env, TURNSTILE_SECRET: "" }))
    .toEqual({ admitted: false, unavailable: [["configuration", undefined]] });
});
