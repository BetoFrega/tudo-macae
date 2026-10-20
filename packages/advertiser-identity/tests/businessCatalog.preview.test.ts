import { expect, test } from "vitest";
import { createBusinessCatalog } from "../business";
import type { AdvertiserProfileData } from "../model";

test("category preview checks a shared activity area once per request", async () => {
  const records: AdvertiserProfileData[] = Array.from({ length: 2 }, (_, index) => ({
    id: `profile-${index}`,
    userId: `owner-${index}`,
    title: `Profile ${index}`,
    description: "Local business",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: "services", subcategoryId: "hotels" }],
    createdAt: 1,
    updatedAt: 1,
  }));
  let areaChecks = 0;
  const catalog = createBusinessCatalog({
    activityAreas: {
      async isActive() {
        areaChecks += 1;
        return true;
      },
    },
    store: {
      async getById() { return null; },
      async listCandidates({ after, limit }) {
        const start = after ? Number(after.id.replace("profile-", "")) + 1 : 0;
        const page = records.slice(start, start + limit);
        return {
          items: page.map(profile => ({ profile, position: { normalizedTitle: profile.title, id: profile.id } })),
          ...(start + page.length < records.length && page.at(-1)
            ? { next: { normalizedTitle: page.at(-1)!.title, id: page.at(-1)!.id } }
            : {}),
        };
      },
    },
  });
  const result = await catalog.previewCategory({ categoryId: "services", civilDate: "2026-09-25" });
  expect(result).toHaveLength(2);
  expect(areaChecks).toBe(1);
  await catalog.previewCategory({ categoryId: "services", civilDate: "2026-09-26" });
  expect(areaChecks).toBe(2);
});

test("category preview skips activity checks for unrelated categories", async () => {
  let areaChecks = 0;
  const catalog = createBusinessCatalog({
    activityAreas: {
      async isActive() {
        areaChecks += 1;
        return true;
      },
    },
    store: {
      async getById() { return null; },
      async listCandidates() {
        return {
          items: [{
            profile: {
              id: "unrelated",
              userId: "owner",
              title: "Other business",
              description: "Unrelated business",
              contacts: [{ number: "22999999999", isWhatsapp: true }],
              activityAreas: [{ categoryId: "food", subcategoryId: "snacks" }],
              createdAt: 1,
              updatedAt: 1,
            },
            position: { normalizedTitle: "other business", id: "unrelated" },
          }],
        };
      },
    },
  });
  expect(await catalog.previewCategory({ categoryId: "services", civilDate: "2026-09-25" })).toEqual([]);
  expect(areaChecks).toBe(0);
});
