// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAdFormLogic } from "./useAdFormLogic";
import {
  mockActions,
  mockRouterPush,
  validValues,
  wrapper,
} from "./useAdFormLogic.fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

describe("useAdFormLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize form with default values", () => {
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    expect(result.current.form.getValues("advertiserProfileId")).toBe("p1");
    expect(result.current.activeCategories).toHaveLength(1);
  });

  it("preserves existing image metadata while initializing an edit", () => {
    const { result } = renderHook(() => useAdFormLogic({
      adId: "ad-1",
      initialData: {
        ...validValues,
        images: [{
          id: "image-1",
          path: "ad-images/ad-1/image-1.webp",
          url: "https://storage.test/image-1.webp",
          order: 2,
          title: "",
          description: "Vista lateral",
        }],
      },
    }), { wrapper });

    expect(result.current.form.getValues("images")).toEqual([{
      id: "image-1",
      path: "ad-images/ad-1/image-1.webp",
      url: "https://storage.test/image-1.webp",
      order: 2,
      title: "",
      description: "Vista lateral",
    }]);
  });

  it("should initialize loginRequired as false", () => {
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });
    expect(result.current.loginRequired).toBe(false);
  });

  it("should handle valid submission (create ad)", async () => {
    mockActions.createAd.mockResolvedValue({ success: true, adId: "new-ad", slug: "new-slug" });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, images: [] });
    });

    expect(mockActions.createAd).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith("/anuncio/new-ad/new-slug");
  });

  it("should include advertiserProfileId in FormData when provided", async () => {
    mockActions.createAd.mockResolvedValue({ success: true, adId: "new-ad", slug: "new-slug" });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, status: "active", images: [] });
    });

    const formData = mockActions.createAd.mock.calls[0][0] as FormData;
    expect(formData.get("advertiserProfileId")).toBe("p1");
    expect(Object.fromEntries(formData.entries())).toEqual({
      advertiserProfileId: "p1",
      categoryId: "c1",
      status: "active",
      subcategoryId: "s1",
      text: "Long enough description",
      title: "Test Ad",
    });
  });

  it("exposes loading only while the submission is pending", async () => {
    let finishCreation: ((value: {
      success: true;
      adId: string;
      slug: string;
    }) => void) | undefined;
    mockActions.createAd.mockReturnValue(new Promise((resolve) => {
      finishCreation = resolve;
    }));
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    let submission: Promise<void> | undefined;
    act(() => {
      submission = result.current.onSubmit({ ...validValues, images: [] });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      finishCreation?.({ success: true, adId: "new-ad", slug: "new-slug" });
      await submission;
    });
    expect(result.current.loading).toBe(false);
  });

  it("ignores a concurrent edit submission", async () => {
    let finishUpdate: ((value: { success: true; slug: string }) => void) | undefined;
    mockActions.updateAd.mockReturnValue(new Promise((resolve) => {
      finishUpdate = resolve;
    }));
    const { result } = renderHook(
      () => useAdFormLogic({ adId: "ad-1" }),
      { wrapper },
    );

    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.onSubmit({ ...validValues, images: [] });
      await result.current.onSubmit({ ...validValues, images: [] });
    });
    expect(mockActions.updateAd).toHaveBeenCalledOnce();

    await act(async () => {
      finishUpdate?.({ success: true, slug: "new-slug" });
      await first;
    });
  });

  it("should omit advertiserProfileId from FormData when undefined", async () => {
    mockActions.createAd.mockResolvedValue({ success: true, adId: "new-ad", slug: "new-slug" });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, advertiserProfileId: undefined, images: [] });
    });

    const formData = mockActions.createAd.mock.calls[0][0] as FormData;
    expect(formData.get("advertiserProfileId")).toBeNull();
  });

  it("should reset subcategory when category changes", async () => {
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    // Set category and subcategory
    act(() => {
      result.current.form.setValue("categoryId", "c1");
      result.current.form.setValue("subcategoryId", "s1");
    });

    // Change to invalid category (simulated by setting ID that doesn't match c1)
    // However, in our mock we only have one category.
    // Change to invalid category (one that doesn't include the current subcategory)
    // The logic checks if the current subcategory exists in the chosen category's activeSubcategories.

    act(() => {
      result.current.form.setValue("categoryId", "invalid-cat");
    });

    await waitFor(() => {
      expect(result.current.form.getValues("subcategoryId")).toBe("");
    });
  });
});
