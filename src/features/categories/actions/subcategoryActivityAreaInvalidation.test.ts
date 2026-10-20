import { beforeEach, describe, expect, test, vi } from "vitest";
import { revalidateTag, updateTag } from "next/cache";
import { deleteSubcategoryUseCase } from "@/packages/classifieds-api";
import { updateSubcategoryUseCase } from "@/packages/classifieds-api";
import { deleteSubcategory } from "./deleteSubcategory";
import { updateSubcategory } from "./updateSubcategory";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("./authorizeCategoryManagement", () => ({
  authorizeCategoryManagement: vi.fn(),
}));
vi.mock("@/packages/classifieds-api", () => ({
  deleteSubcategoryUseCase: vi.fn(),
  updateSubcategoryUseCase: vi.fn(),
}));

const input = {
  categoryId: "category",
  subcategoryId: "subcategory",
  name: "Subcategoria",
  slug: "subcategory",
  order: 1,
  isActive: false,
};
const activityAreaTag
  = "activity-area-advertisers:category:subcategory";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subcategory activity-area invalidation", () => {
  test("invalidates the affected public area after deactivation or reactivation", async () => {
    vi.mocked(updateSubcategoryUseCase).mockResolvedValue();

    await expect(updateSubcategory(input)).resolves.toEqual({ success: true });

    expect(revalidateTag).toHaveBeenCalledWith(activityAreaTag, "max");
    expect(updateTag).toHaveBeenCalledWith(activityAreaTag);
  });

  test("invalidates the affected public area after deletion", async () => {
    vi.mocked(deleteSubcategoryUseCase).mockResolvedValue();

    await expect(deleteSubcategory(input)).resolves.toEqual({ success: true });

    expect(revalidateTag).toHaveBeenCalledWith(activityAreaTag, "max");
    expect(updateTag).toHaveBeenCalledWith(activityAreaTag);
  });

  test("invalidates after a partial deletion failure that already made the area inactive", async () => {
    vi.mocked(deleteSubcategoryUseCase).mockRejectedValue(
      new Error("partial cleanup"),
    );

    await expect(deleteSubcategory(input)).resolves.toEqual({
      success: false,
      error: "Failed to delete subcategory",
    });

    expect(revalidateTag).toHaveBeenCalledWith("categories", "max");
    expect(updateTag).toHaveBeenCalledWith("categories");
    expect(updateTag).toHaveBeenCalledWith(activityAreaTag);
  });
});
