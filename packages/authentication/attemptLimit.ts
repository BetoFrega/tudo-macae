type AttemptRule = { window: number; max: number };
type AttemptDecision = { allowed: boolean; retryAfter: number | null };

export function createAuthenticationAttemptLimit(dependencies: {
  consume(key: string, rule: AttemptRule): Promise<AttemptDecision>;
}) {
  return {
    async consume(input: {
      networkKey: string;
      operation: string;
      accountAddress?: string;
      rule: AttemptRule;
    }) {
      const address = input.accountAddress?.trim().toLowerCase();
      if (!address) return dependencies.consume(input.networkKey, input.rule);
      const network = await dependencies.consume(input.networkKey, { window: 10, max: 100 });
      return network.allowed
        ? dependencies.consume(`account:${address}:${input.operation}`, input.rule)
        : network;
    },
  };
}
