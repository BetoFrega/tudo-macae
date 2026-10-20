import { expect, test } from "vitest";
import { createAuthenticationAttemptLimit } from "../attemptLimit";

test("different networks share a normalized account budget while independent accounts stay separate", async () => {
  const counts = new Map<string, number>();
  const limiter = createAuthenticationAttemptLimit({
    async consume(key, rule) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { allowed: count <= rule.max, retryAfter: count <= rule.max ? null : rule.window };
    },
  });
  const attempt = (networkKey: string, accountAddress: string) => limiter.consume({ networkKey, operation: "/sign-in/email", accountAddress, rule: { window: 10, max: 3 } });
  expect((await attempt("network-a", " Ana@Example.com ")).allowed).toBe(true);
  expect((await attempt("network-b", "ana@example.com")).allowed).toBe(true);
  expect((await attempt("network-c", "ana@example.com")).allowed).toBe(true);
  expect(await attempt("network-d", "ana@example.com")).toEqual({ allowed: false, retryAfter: 10 });
  expect((await attempt("network-a", "other@example.com")).allowed).toBe(true);
});

test("a closed network budget stops before consuming the account budget", async () => {
  let calls = 0;
  const limiter = createAuthenticationAttemptLimit({
    async consume(_key, rule) {
      calls++;
      expect(rule).toEqual({ window: 10, max: 100 });
      return { allowed: false, retryAfter: 8 };
    },
  });
  expect(await limiter.consume({ networkKey: "network", operation: "/sign-in/email", accountAddress: "ana@example.com", rule: { window: 10, max: 3 } })).toEqual({ allowed: false, retryAfter: 8 });
  expect(calls).toBe(1);
});

test("session and other requests without an account preserve the endpoint network budget", async () => {
  const limiter = createAuthenticationAttemptLimit({
    async consume(key, rule) {
      expect(key).toBe("network");
      expect(rule).toEqual({ window: 10, max: 100 });
      return { allowed: true, retryAfter: null };
    },
  });
  expect((await limiter.consume({ networkKey: "network", operation: "/get-session", rule: { window: 10, max: 100 } })).allowed).toBe(true);
});
