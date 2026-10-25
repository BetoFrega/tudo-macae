import { expect, test } from "vitest";
import { createOfferEvents } from "../lib/offerEvents";

function harness(options: { projectToken?: string; respond?: () => Promise<Response> } = {}) {
  const requests: { url: string; body: unknown }[] = [];
  const pending: Promise<unknown>[] = [];
  const logs: unknown[] = [];
  const record = createOfferEvents({
    projectToken: "projectToken" in options ? options.projectToken : "phc_project",
    environment: "production", release: "release-1",
    fetch: async (input, init) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return options.respond ? options.respond() : new Response(null, { status: 200 });
    },
    waitUntil: promise => pending.push(promise),
    log: line => logs.push(JSON.parse(line)),
    now: () => Date.UTC(2026, 9, 24, 12),
  });
  return { record, requests, logs, settled: () => Promise.all(pending) };
}

const published = { name: "ad_published", actorId: "account-uid", adId: "ad-1", categoryId: "veiculos", subcategoryId: "carros", identityType: "business" } as const;

test("sends the event as the acting account, with identifiers only and no person profile", async () => {
  const { record, requests, logs, settled } = harness();
  record(published);
  record({ name: "advertiser_identity_created", actorId: "account-uid", identityId: "profile-1", identityType: "personal" });
  await settled();
  expect(requests).toEqual([
    { url: "https://eu.i.posthog.com/i/v0/e/", body: {
      api_key: "phc_project", event: "ad_published", distinct_id: "account-uid", timestamp: "2026-10-24T12:00:00.000Z",
      properties: { ad_id: "ad-1", category_id: "veiculos", subcategory_id: "carros", identity_type: "business", environment: "production", $process_person_profile: false },
    } },
    { url: "https://eu.i.posthog.com/i/v0/e/", body: {
      api_key: "phc_project", event: "advertiser_identity_created", distinct_id: "account-uid", timestamp: "2026-10-24T12:00:00.000Z",
      properties: { identity_id: "profile-1", identity_type: "personal", environment: "production", $process_person_profile: false },
    } },
  ]);
  expect(logs).toEqual([]);
});

test("marks events from admin or editor accounts for the internal-user filter", async () => {
  const { record, requests, settled } = harness();
  record({ ...published, internalActor: true });
  await settled();
  expect(requests[0]!.body).toMatchObject({ properties: { ad_id: "ad-1", internal_actor: true } });
});

test("sends nothing without a PostHog project token", async () => {
  for (const projectToken of [undefined, ""]) {
    const { record, requests, settled } = harness({ projectToken });
    record(published);
    await settled();
    expect(requests).toEqual([]);
  }
});

test("a refused or failed delivery is logged without identifiers and never rejects", async () => {
  const outcomes = [
    () => Promise.resolve(new Response(null, { status: 503 })),
    () => Promise.reject(new Error("network detail")),
  ];
  const logged = [];
  for (const respond of outcomes) {
    const { record, logs, settled } = harness({ respond });
    expect(() => record(published)).not.toThrow();
    await expect(settled()).resolves.toBeDefined();
    logged.push(...logs);
  }
  const common = { severity: "WARNING", event: "offer_event_delivery_failed", service: "api-worker", environment: "production", release: "release-1", outcome: "failed", offerEvent: "ad_published" };
  expect(logged).toEqual([{ ...common, status: 503 }, common]);
});
