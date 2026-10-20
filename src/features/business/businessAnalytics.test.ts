import { describe, expect, test } from "vitest";
import {
  businessContactEvent,
  businessOpenedEvent,
  normalizeBusinessAnalyticsSource,
} from "./businessAnalytics";

describe("business analytics privacy", () => {
  test("does not accept an arbitrary URL value as a source", () => {
    expect(normalizeBusinessAnalyticsSource("home")).toBe("home");
    expect(normalizeBusinessAnalyticsSource("telefone=22999999999")).toBe("direct");
  });
  test("records opening and contact without descriptive or contact content", () => {
    expect(businessOpenedEvent({ source: "activity_preview", businessId: "business-1" }))
      .toEqual({
        name: "business_opened",
        properties: { source_surface: "activity_preview", business_id: "business-1" },
      });
    expect(businessContactEvent({
      source: "business_profile",
      businessId: "business-1",
      kind: "whatsapp",
      categoryId: "food",
      subcategoryId: "snacks",
    })).toEqual({
      name: "business_contact_clicked",
      properties: {
        source_surface: "business_profile",
        business_id: "business-1",
        contact_kind: "whatsapp",
        category_id: "food",
        subcategory_id: "snacks",
      },
    });
  });
});
