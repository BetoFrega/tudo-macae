import { beforeEach, expect, test, vi } from "vitest";
import { revalidateTag, updateTag } from "next/cache";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

test("invalidates every affected subcategory once", () => {
  invalidateActivityAreaAdvertisers([
    { categoryId: "old-category", subcategoryId: "old-subcategory" },
    { categoryId: "new-category", subcategoryId: "new-subcategory" },
    { categoryId: "old-category", subcategoryId: "old-subcategory" },
  ]);

  expect(revalidateTag).toHaveBeenCalledTimes(3);
  expect(updateTag).toHaveBeenCalledTimes(3);
  expect(revalidateTag).toHaveBeenCalledWith(
    "activity-area-advertisers:old-category:old-subcategory",
    "max",
  );
  expect(updateTag).toHaveBeenCalledWith(
    "activity-area-advertisers:new-category:new-subcategory",
  );
  expect(revalidateTag).toHaveBeenCalledWith("business-catalog-taxonomy", "max");
  expect(updateTag).toHaveBeenCalledWith("business-catalog-taxonomy");
});

test("does not invalidate the catalog when no activity area changed", () => {
  invalidateActivityAreaAdvertisers([]);

  expect(revalidateTag).not.toHaveBeenCalled();
  expect(updateTag).not.toHaveBeenCalled();
});
