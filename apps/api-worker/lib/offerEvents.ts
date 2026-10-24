import type { AdvertiserIdentityType } from "@tudomacae/advertiser-identity/model";

/**
 * New Classifieds supply, recorded after its write commits; `actorId` is the account `uid` that acted.
 * `internalActor` marks an admin or editor account: the events carry no person profile, so
 * PostHog's internal-user filter can only exclude them through this event property.
 */
export type OfferEvent = { actorId: string; identityType?: AdvertiserIdentityType; internalActor?: boolean } & (
  | { name: "ad_published"; adId: string; categoryId: string; subcategoryId: string }
  | { name: "advertiser_identity_created"; identityId: string }
);

const captureUrl = "https://eu.i.posthog.com/i/v0/e/";

function eventProperties(event: OfferEvent) {
  const common = { ...(event.identityType ? { identity_type: event.identityType } : {}), ...(event.internalActor ? { internal_actor: true } : {}) };
  return event.name === "ad_published"
    ? { ad_id: event.adId, category_id: event.categoryId, subcategory_id: event.subcategoryId, ...common }
    : { identity_id: event.identityId, ...common };
}

/**
 * Sends each event to PostHog without holding the response: delivery runs in
 * `waitUntil`, and a refused or failed delivery becomes a structured log line,
 * never an error of the domain operation that already committed.
 * Without a project token (local runs, qualification) nothing is sent.
 */
export function createOfferEvents(dependencies: {
  projectToken: string | undefined;
  environment: string | undefined;
  release: string | undefined;
  fetch: typeof fetch;
  waitUntil(promise: Promise<unknown>): void;
  log(line: string): void;
  now(): number;
}) {
  const { projectToken } = dependencies;
  const reportFailure = (event: OfferEvent, status?: number) => dependencies.log(JSON.stringify({
    severity: "WARNING", event: "offer_event_delivery_failed", service: "api-worker",
    environment: dependencies.environment ?? "unknown", release: dependencies.release ?? "unknown",
    outcome: "failed", offerEvent: event.name, ...(status ? { status } : {}),
  }));
  return (event: OfferEvent) => {
    if (!projectToken?.startsWith("phc_")) return;
    const delivery = dependencies.fetch(captureUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: projectToken,
        event: event.name,
        distinct_id: event.actorId,
        timestamp: new Date(dependencies.now()).toISOString(),
        properties: {
          ...eventProperties(event),
          environment: dependencies.environment,
          // Weekly supply counts need no person profile; anonymous events cost about a quarter of identified ones.
          $process_person_profile: false,
        },
      }),
      signal: AbortSignal.timeout(5000),
    }).then((response) => {
      if (!response.ok) reportFailure(event, response.status);
    }, () => reportFailure(event));
    dependencies.waitUntil(delivery);
  };
}
