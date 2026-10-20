import { describe, expect, test } from "vitest";
import { createSubcategoryLifecycle } from "@tudomacae/categories/subcategoryLifecycle";

const area = { categoryId: "category", subcategoryId: "subcategory" };

describe("subcategory lifecycle", () => {
  test("keeps a partially cleaned subcategory inactive and finishes safely on retry", async () => {
    let subcategory: "active" | "inactive" | "deleted" = "active";
    const associatedProfiles = new Set(["first", "second"]);
    let cleanupAttempts = 0;
    const lifecycle = createSubcategoryLifecycle({
      subcategories: {
        async deactivateIfPresent() {
          if (subcategory !== "deleted") subcategory = "inactive";
        },
        async delete() {
          subcategory = "deleted";
        },
      },
      activityAreas: {
        async removeAll() {
          cleanupAttempts += 1;
          associatedProfiles.delete("first");
          if (cleanupAttempts === 1) throw new Error("partial cleanup");
          associatedProfiles.delete("second");
        },
      },
    });

    await expect(lifecycle.delete(area)).rejects.toThrow("partial cleanup");
    expect(subcategory).toBe("inactive");
    expect([...associatedProfiles]).toEqual(["second"]);

    await expect(lifecycle.delete(area)).resolves.toBeUndefined();
    expect(subcategory).toBe("deleted");
    expect([...associatedProfiles]).toEqual([]);

    await expect(lifecycle.delete(area)).resolves.toBeUndefined();
    expect(subcategory).toBe("deleted");
    expect([...associatedProfiles]).toEqual([]);
  });
});
