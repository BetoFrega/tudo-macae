import { expect, test, vi } from "vitest";
import { updateTag } from "next/cache";
import { deleteCategoryUseCase } from "@/packages/classifieds-api";
import { deleteCategory } from "./deleteCategory";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("./authorizeCategoryManagement", () => ({ authorizeCategoryManagement: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({ deleteCategoryUseCase: vi.fn() }));

test.each([false, true])("invalidates Category discovery after deletion, including partial failure (%s)", async (fails) => {
  vi.clearAllMocks();
  if (fails) vi.mocked(deleteCategoryUseCase).mockRejectedValue(new Error("partial cleanup"));
  else vi.mocked(deleteCategoryUseCase).mockResolvedValue();
  await expect(deleteCategory({ id: "category" })).resolves.toMatchObject({ success: !fails });
  expect(updateTag).toHaveBeenCalledWith("categories");
});
