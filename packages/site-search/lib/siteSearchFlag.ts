export const siteSearchFlagKey = "site-search";
/** Anonymous visitors share one evaluation, so public traffic costs one call per window. */
export const siteSearchPublicDistinctId = "site-search-public";

const decisionTtlMs = 30_000;
const maximumRememberedAudiences = 500;
const maximumDistinctIdLength = 200;

export interface SiteSearchFlagRecord {
  enabled: false;
  failure: "evaluation";
}

/**
 * Reads the PostHog persistence cookie. Only identified people are evaluated
 * individually; the flag is a release control, so a forged cookie only selects
 * which release condition applies.
 */
function parseCookie(value: string): unknown {
  try {
    return JSON.parse(value);
  }
  catch {
    // A raw header value is still URL-encoded; Next's cookie API decodes it.
    return JSON.parse(decodeURIComponent(value));
  }
}

export function siteSearchDistinctId(posthogCookie: string | undefined): string {
  if (!posthogCookie) return siteSearchPublicDistinctId;
  try {
    const value = parseCookie(posthogCookie);
    if (typeof value !== "object" || value === null) return siteSearchPublicDistinctId;
    const { distinct_id: distinctId, $user_state: userState } = value as Record<string, unknown>;
    return userState === "identified"
      && typeof distinctId === "string"
      && distinctId.length > 0
      && distinctId.length <= maximumDistinctIdLength
      ? distinctId
      : siteSearchPublicDistinctId;
  }
  catch {
    return siteSearchPublicDistinctId;
  }
}

export function createSiteSearchFlag(dependencies: {
  /** Resolves the raw PostHog decision for the key; rejects when unavailable. */
  evaluate(distinctId: string): Promise<unknown>;
  now(): number;
  record?(record: SiteSearchFlagRecord): void;
}) {
  const decisions = new Map<string, { enabled: boolean; expiresAt: number }>();
  // Concurrent requests for one audience, such as a cold instance's first
  // anonymous burst, wait for a single PostHog call.
  const pending = new Map<string, Promise<boolean>>();

  async function evaluate(distinctId: string, now: number) {
    let enabled = false;
    try {
      enabled = await dependencies.evaluate(distinctId) === true;
    }
    catch {
      dependencies.record?.({ enabled: false, failure: "evaluation" });
    }

    decisions.delete(distinctId);
    if (decisions.size >= maximumRememberedAudiences) {
      const oldest = decisions.keys().next().value;
      if (oldest !== undefined) decisions.delete(oldest);
    }
    decisions.set(distinctId, { enabled, expiresAt: now + decisionTtlMs });
    return enabled;
  }

  return {
    async enabled(distinctId: string): Promise<boolean> {
      const now = dependencies.now();
      const remembered = decisions.get(distinctId);
      if (remembered && remembered.expiresAt > now) return remembered.enabled;

      const inFlight = pending.get(distinctId);
      if (inFlight) return inFlight;
      const decision = evaluate(distinctId, now).finally(() => pending.delete(distinctId));
      pending.set(distinctId, decision);
      return decision;
    },
  };
}
