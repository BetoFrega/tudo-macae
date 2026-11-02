import { expect, test } from "vitest";
import { createOfferingFlag } from "../offeringFlag";

test("management and anonymous visitors target the business by property, without an identity, and fail closed", async () => {
  const bodies: string[] = [];
  const flag = createOfferingFlag({ host: "https://eu.i.posthog.com", token: "test", fetch: async (_url, init) => {
    bodies.push(String(init.body));
    return new Response(JSON.stringify({ flags: { "business-offering-catalog": { enabled: true } } }));
  } });
  expect(await flag("business-a")).toBe("enabled");
  expect(JSON.parse(bodies[0]!)).toMatchObject({ distinct_id: "", person_properties: { business_id: "business-a" } });
  const missing = createOfferingFlag({ host: "https://eu.i.posthog.com", token: "test", fetch: async () => new Response("{}") });
  expect(await missing("business-a")).toBe("unavailable");
});

test.each([
  ["a matched audience without the release", "disabled", () => new Response(JSON.stringify({ flags: { "business-offering-catalog": { enabled: false, reason: { code: "condition_match" } } } }))],
  ["a business outside every audience condition", "outside_audience", () => new Response(JSON.stringify({ flags: { "business-offering-catalog": { enabled: false, reason: { code: "no_condition_match" } } } }))],
  ["a provider outage", "unavailable", () => new Response(JSON.stringify({ flags: { "business-offering-catalog": { enabled: true } } }), { status: 503 })],
  ["a network failure", "unavailable", () => {
    throw new TypeError("fetch failed");
  }],
] as const)("%s maps to %s", async (_case, decision, answer) => {
  const flag = createOfferingFlag({ host: "https://eu.i.posthog.com", token: "test", fetch: async () => answer() });
  expect(await flag("business-a")).toBe(decision);
});
