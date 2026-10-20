import { describe, expect, test } from "vitest";
import { adListingTags } from "../index";

describe("adListingTags", () => {
  test("maps a category-only placement to its category listing", () => {
    expect(adListingTags({ categoryId: "category-1" })).toEqual([
      "ads-category-category-1",
    ]);
  });

  test("maps a subcategory placement to its parent and specific listings", () => {
    expect(
      adListingTags({
        categoryId: "category-1",
        subcategoryId: "subcategory-1",
      }),
    ).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test("keeps stable order while de-duplicating repeated placements", () => {
    const placement = {
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
    };

    expect(adListingTags(placement, placement)).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test("returns the distinct union of old and new placements", () => {
    expect(
      adListingTags(
        { categoryId: "category-1", subcategoryId: "subcategory-1" },
        { categoryId: "category-2", subcategoryId: "subcategory-2" },
      ),
    ).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
      "ads-category-category-2",
      "ads-subcategory-subcategory-2",
    ]);
  });
});
