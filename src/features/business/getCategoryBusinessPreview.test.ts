import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCategoryBusinessPreviewUseCase: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/packages/classifieds-api", () => ({
  activityAreaCivilDate: () => "2026-09-20",
  listCategoryBusinessPreviewUseCase: mocks.listCategoryBusinessPreviewUseCase,
}));

import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { getCategoryBusinessPreviewOrEmpty } from "./getCategoryBusinessPreview";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test("returns an empty preview when category business discovery fails", async () => {
  mocks.listCategoryBusinessPreviewUseCase.mockRejectedValueOnce(
    new Error("catalog unavailable"),
  );

  await expect(getCategoryBusinessPreviewOrEmpty("food")).resolves.toEqual([]);
});

test("records an unreported catalog failure once with its support id", async () => {
  mocks.listCategoryBusinessPreviewUseCase.mockRejectedValueOnce(new ClassifiedsRequestError("unavailable", "request-1"));

  await getCategoryBusinessPreviewOrEmpty("food");

  expect(console.error).toHaveBeenCalledOnce();
  expect(JSON.parse(String(vi.mocked(console.error).mock.calls[0]![0]))).toMatchObject({
    event: "business.category_preview.read_failed", outcome: "failed", cause: "unavailable", correlationId: "request-1",
  });
});

test("leaves a failure the Worker already reported to its log", async () => {
  mocks.listCategoryBusinessPreviewUseCase.mockRejectedValueOnce(new ClassifiedsRequestError("unavailable", "request-1", true));

  await expect(getCategoryBusinessPreviewOrEmpty("food")).resolves.toEqual([]);
  expect(console.error).not.toHaveBeenCalled();
});

test("preserves a successful category business preview", async () => {
  mocks.listCategoryBusinessPreviewUseCase.mockResolvedValueOnce([
    { id: "restaurant", title: "Restaurante Macaense", activityAreas: [] },
  ]);

  await expect(getCategoryBusinessPreviewOrEmpty("food")).resolves.toMatchObject([
    { id: "restaurant" },
  ]);
});
