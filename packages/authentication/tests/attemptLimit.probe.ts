import type * as entry from "../attemptLimit";
export async function run(module: typeof entry) {
  const limiter = module.createAuthenticationAttemptLimit({
    async consume() { return { allowed: true, retryAfter: null }; },
  });
  await limiter.consume({ networkKey: "network", operation: "/sign-in/email", accountAddress: "person@example.com", rule: { window: 10, max: 3 } });
}
