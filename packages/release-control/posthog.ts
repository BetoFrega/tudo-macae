export class ReleaseFlagUnavailable extends Error {
  constructor(
    readonly category: "configuration" | "network" | "timeout" | "http_status" | "invalid_response" | "evaluation",
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super("Journey route flag could not be evaluated", options);
  }
}

interface FlagEvaluatorConfiguration {
  host: string | undefined;
  projectToken: string | undefined;
  environment?: string;
  fetch: typeof globalThis.fetch;
  flagKey: string;
  now?: () => number;
  decisionTtlMs?: number;
}

interface FlagsResponse {
  flags?: Record<
    string,
    { enabled?: unknown; failed?: unknown } | undefined
  >;
  errorsWhileComputingFlags?: unknown;
}

/** Separate cached decisions keep canary requests from changing the global audience. */
function createFlagEvaluator(configuration: FlagEvaluatorConfiguration) {
  const flagKey = configuration.flagKey;
  const now = configuration.now ?? Date.now;
  const decisionTtlMs = configuration.decisionTtlMs ?? 1_000;
  let cached: { value: boolean; expiresAt: number } | undefined;
  let pending: Promise<boolean> | undefined;
  let unavailableUntil = 0;
  let lastFailure: ReleaseFlagUnavailable | undefined;
  return async () => {
    if (cached && now() < cached.expiresAt) return cached.value;
    if (pending) return pending;
    if (now() < unavailableUntil)
      throw lastFailure ?? new ReleaseFlagUnavailable("network");
    pending = evaluate();
    try {
      return await pending;
    }
    finally {
      pending = undefined;
    }
  };

  async function evaluate() {
    let category: ReleaseFlagUnavailable["category"] = "configuration";
    try {
      const endpoint = flagsEndpoint(configuration);
      category = "network";
      const response = await requestFlags(configuration, endpoint);
      category = "invalid_response";
      const enabled = readDecision((await response.json()) as FlagsResponse, flagKey);
      cached = { value: enabled, expiresAt: now() + decisionTtlMs };
      return enabled;
    }
    catch (error) {
      // Keep an expired true decision unusable while limiting retries during an outage.
      unavailableUntil = now() + decisionTtlMs;
      lastFailure = unavailableFailure(error, category);
      throw lastFailure;
    }
  }
}

function flagsEndpoint({ host: configuredHost, environment, projectToken }: FlagEvaluatorConfiguration) {
  const host = new URL(configuredHost ?? "");
  const testLoopback = environment === "test"
    && host.protocol === "http:" && host.hostname === "127.0.0.1";
  if ((host.protocol !== "https:" && !testLoopback) || !projectToken)
    throw new ReleaseFlagUnavailable("configuration");
  return new URL("/flags?v=2", host);
}

async function requestFlags(configuration: FlagEvaluatorConfiguration, endpoint: URL) {
  const fetchFlag = configuration.fetch;
  const response = await fetchFlag(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: configuration.projectToken,
      // eslint-disable-next-line local/no-fixed-posthog-distinct-id -- Flag-only environment identity; never used for event capture or person updates.
      distinct_id: `tudo-macae:release-control:${configuration.environment ?? "global"}`,
      ...(configuration.environment === undefined
        ? {}
        : { person_properties: { environment: configuration.environment } }),
    }),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(1_500),
  });
  if (!response.ok) throw new ReleaseFlagUnavailable("http_status", response.status);
  return response;
}

function readDecision(value: FlagsResponse, flagKey: string): boolean {
  if (!value.flags || typeof value.flags !== "object")
    throw new ReleaseFlagUnavailable("invalid_response");
  const decision = value.flags[flagKey];
  // PostHog omits a globally inactive flag from an otherwise valid flags map.
  if (!decision) {
    if (value.errorsWhileComputingFlags === true)
      throw new ReleaseFlagUnavailable("evaluation");
    return false;
  }
  if (decision.failed !== undefined && decision.failed !== false)
    throw new ReleaseFlagUnavailable("evaluation");
  if (typeof decision.enabled !== "boolean")
    throw new ReleaseFlagUnavailable("invalid_response");
  return decision.enabled;
}

function unavailableFailure(error: unknown, category: ReleaseFlagUnavailable["category"]) {
  if (error instanceof ReleaseFlagUnavailable) return error;
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  return new ReleaseFlagUnavailable(timedOut ? "timeout" : category, undefined, { cause: error });
}

/** Cache each key independently for the lifetime of this adapter. */
export function createPostHogFlagReader(configuration: {
  host: string | undefined;
  projectToken: string | undefined;
  environment?: string;
  fetch: typeof globalThis.fetch;
  now?: () => number;
  decisionTtlMs?: number;
}) {
  const evaluators = new Map<string, () => Promise<boolean>>();
  return (key: string): Promise<boolean> => {
    let evaluator = evaluators.get(key);
    if (!evaluator) {
      evaluator = createFlagEvaluator({ ...configuration, flagKey: key });
      evaluators.set(key, evaluator);
    }
    return evaluator();
  };
}
