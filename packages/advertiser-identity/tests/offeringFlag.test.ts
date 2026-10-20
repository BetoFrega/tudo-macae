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
