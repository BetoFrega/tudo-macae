// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAdFormLogic } from "./useAdFormLogic";
import {
  mockActions,
  mockRouterPush,
  rootErrorMessage,
  validValues,
  wrapper,
} from "./useAdFormLogic.fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

describe("useAdFormLogic submission errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows generic Portuguese copy for an unsuccessful action result", async () => {
    mockActions.createAd.mockResolvedValue({
      success: false,
      error: "Failed to create ad: firestore provider detail",
    });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, images: [] });
    });

    expect(rootErrorMessage(result.current.form)).toBe(
      "Ocorreu um erro ao enviar o anúncio. Tente novamente.",
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("hides technical text when the action call is rejected", async () => {
    const technicalMessage = "Minified React error #441: session cookie secret";
    mockActions.createAd.mockRejectedValue(new Error(technicalMessage));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({ ...validValues, images: [] });
    });

    expect(consoleError).toHaveBeenCalled();
    expect(rootErrorMessage(result.current.form)).toBe(
      "Ocorreu um erro ao enviar o anúncio. Tente novamente.",
    );
    expect(rootErrorMessage(result.current.form)).not.toContain(
      technicalMessage,
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("shows the same generic copy for an unsuccessful update", async () => {
    mockActions.updateAd.mockResolvedValue({
      success: false,
      error: "internal ownership detail",
    });
    const { result } = renderHook(
      () => useAdFormLogic({ adId: "ad-1" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.onSubmit({ ...validValues, images: [] });
    });

    expect(rootErrorMessage(result.current.form)).toBe(
      "Ocorreu um erro ao enviar o anúncio. Tente novamente.",
    );
    expect(mockActions.uploadAdImage).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("preserves a recoverable update result and the edited values", async () => {
    mockActions.updateAd.mockResolvedValue({
      success: false,
      reason: "profile",
      error: "Complete um contato válido no perfil antes de ativar o anúncio.",
      adId: "ad-1",
      advertiserProfileId: "p1",
    });
    const { result } = renderHook(
      () => useAdFormLogic({ adId: "ad-1" }),
      { wrapper },
    );
    act(() => result.current.form.setValue("title", "Título ainda não salvo"));

    await act(async () => {
      await result.current.onSubmit({
        ...validValues,
        title: "Título ainda não salvo",
        images: [],
      });
    });

    expect(result.current.submissionIssue).toEqual({
      reason: "profile",
      error: "Complete um contato válido no perfil antes de ativar o anúncio.",
      adId: "ad-1",
      advertiserProfileId: "p1",
    });
    expect(result.current.form.getValues("title")).toBe("Título ainda não salvo");
    expect(rootErrorMessage(result.current.form)).toBeUndefined();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("serializes existing images when updating an ad", async () => {
    mockActions.updateAd.mockResolvedValue({ success: true, slug: "new-slug" });
    const { result } = renderHook(
      () => useAdFormLogic({ adId: "ad-1" }),
      { wrapper },
    );
    const existingImage = {
      id: "image-1",
      path: "ad-images/ad-1/image-1.webp",
      url: "https://storage.test/image-1.webp",
      title: "Lateral",
      description: "Vista lateral",
      order: 1,
    };

    await act(async () => {
      await result.current.onSubmit({
        ...validValues,
        images: [existingImage],
      });
    });

    const formData = mockActions.updateAd.mock.calls[0][1] as FormData;
    expect(formData.get("images")).toBe(JSON.stringify([{
      id: existingImage.id,
      path: existingImage.path,
      title: existingImage.title,
      description: existingImage.description,
      order: existingImage.order,
    }]));
    expect(mockRouterPush).toHaveBeenCalledWith("/anuncio/ad-1/new-slug");
  });
});
