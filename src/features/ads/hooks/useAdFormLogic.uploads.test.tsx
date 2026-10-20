// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAdFormLogic } from "./useAdFormLogic";
import {
  mockActions,
  mockOpenLoginModal,
  mockRouterPush,
  rootErrorMessage,
  validValues,
  wrapper,
} from "./useAdFormLogic.fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

describe("useAdFormLogic image uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a failed new-image upload with safe Portuguese copy", async () => {
    mockActions.createAd.mockResolvedValue({
      success: true,
      adId: "new-ad",
      slug: "new-slug",
    });
    mockActions.uploadAdImage.mockResolvedValue({
      success: false,
      error: "Não foi possível enviar a imagem do anúncio.",
    });
    const { result } = renderHook(() => useAdFormLogic({}), { wrapper });

    await act(async () => {
      await result.current.onSubmit({
        ...validValues,
        images: [{
          url: "blob:preview",
          file: new File(["image"], "anuncio.webp", { type: "image/webp" }),
          title: "Frente",
          description: "Vista frontal",
          order: 0,
        }],
      });
    });

    const imageFormData = mockActions.uploadAdImage.mock.calls[0][1] as FormData;
    expect(mockActions.uploadAdImage).toHaveBeenCalledWith(
      "new-ad",
      expect.any(FormData),
    );
    expect(imageFormData.get("title")).toBe("Frente");
    expect(imageFormData.get("description")).toBe("Vista frontal");
    expect(result.current.partialUpload).toEqual({
      url: "/anuncio/new-ad/new-slug",
      pendingNames: ["Frente (anuncio.webp)"],
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("retries only the missing photo after an edit upload returns an error", async () => {
    mockActions.updateAd.mockResolvedValue({ success: true, slug: "edited" });
    mockActions.uploadAdImage
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "storage detail" })
      .mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() => useAdFormLogic({ adId: "ad-1" }), { wrapper });
    const images = ["one.webp", "two.webp"].map((name, order) => ({
      url: `blob:${name}`,
      file: new File([name], name, { type: "image/webp" }),
      title: name,
      description: "",
      order,
    }));

    await act(async () => result.current.onSubmit({ ...validValues, images }));
    expect(result.current.partialUpload).toEqual({ url: "/anuncio/ad-1/edited", pendingNames: ["two.webp (two.webp)"] });
    expect(mockRouterPush).not.toHaveBeenCalled();

    await act(async () => result.current.retryPendingUploads());
    expect(mockActions.updateAd).toHaveBeenCalledOnce();
    expect(mockActions.uploadAdImage).toHaveBeenCalledTimes(3);
    const retried = mockActions.uploadAdImage.mock.calls[2][1] as FormData;
    expect((retried.get("file") as File).name).toBe("two.webp");
    expect(mockRouterPush).toHaveBeenCalledWith("/anuncio/ad-1/edited");
  });

  it("preserves the rejected photo reason and prevents retrying the same selection", async () => {
    mockActions.updateAd.mockResolvedValue({ success: true, slug: "edited" });
    mockActions.uploadAdImage.mockResolvedValueOnce({ success: false, reason: "invalid_photo", error: "A imagem processada excede o limite de 1MB." });
    const { result } = renderHook(() => useAdFormLogic({ adId: "ad-1" }), { wrapper });
    await act(async () => result.current.onSubmit({ ...validValues, images: [{
      url: "blob:photo", file: new File(["photo"], "photo.webp", { type: "image/webp" }),
      title: "", description: "", order: 0,
    }] }));
    expect(result.current.partialUpload).toMatchObject({
      pendingNames: ["photo.webp"],
      invalidPhoto: { error: "A imagem processada excede o limite de 1MB.", editUrl: "/anuncio/ad-1/editar" },
    });
    await act(async () => result.current.retryPendingUploads());
    expect(mockActions.uploadAdImage).toHaveBeenCalledOnce();
    expect(mockActions.updateAd).toHaveBeenCalledOnce();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("opens login before retrying photos when the saved ad outlives the session", async () => {
    mockActions.updateAd.mockResolvedValue({ success: true, slug: "edited" });
    mockActions.uploadAdImage
      .mockResolvedValueOnce({ success: false, reason: "authentication_required", error: "Entre na sua conta." })
      .mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() => useAdFormLogic({ adId: "ad-1" }), { wrapper });
    const image = {
      url: "blob:image",
      file: new File(["image"], "photo.webp", { type: "image/webp" }),
      title: "",
      description: "",
      order: 0,
    };

    await act(async () => result.current.onSubmit({ ...validValues, images: [image] }));
    expect(result.current.partialUpload).toEqual({
      url: "/anuncio/ad-1/edited", pendingNames: ["photo.webp"], authenticationRequired: true,
    });

    await act(async () => result.current.retryPendingUploads());
    expect(mockOpenLoginModal).toHaveBeenCalledOnce();
    expect(mockActions.uploadAdImage).toHaveBeenCalledOnce();
    const onLogin = mockOpenLoginModal.mock.calls[0]![0] as () => void;
    await act(async () => onLogin());
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/anuncio/ad-1/edited"));
    expect(mockActions.updateAd).toHaveBeenCalledOnce();
    expect(mockActions.uploadAdImage).toHaveBeenCalledTimes(2);
  });

  it("keeps the saved edit recoverable when image upload rejects", async () => {
    mockActions.updateAd.mockResolvedValue({ success: true, slug: "edited" });
    mockActions.uploadAdImage.mockRejectedValueOnce(new Error("storage detail"));
    const { result } = renderHook(() => useAdFormLogic({ adId: "ad-1" }), { wrapper });
    const image = {
      url: "blob:image",
      file: new File(["image"], "photo.webp", { type: "image/webp" }),
      title: "",
      description: "",
      order: 0,
    };

    await act(async () => result.current.onSubmit({ ...validValues, images: [image] }));
    expect(result.current.partialUpload).toEqual({ url: "/anuncio/ad-1/edited", pendingNames: ["photo.webp"] });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(rootErrorMessage(result.current.form)).toBeUndefined();
  });

  it("reports a failed retry without repeating the saved edit", async () => {
    mockActions.updateAd.mockResolvedValue({ success: true, slug: "edited" });
    mockActions.uploadAdImage.mockResolvedValue({ success: false, error: "storage detail" });
    const { result } = renderHook(() => useAdFormLogic({ adId: "ad-1" }), { wrapper });
    const image = {
      url: "blob:image", file: new File(["image"], "photo.webp", { type: "image/webp" }),
      title: "", description: "", order: 0,
    };

    await act(async () => result.current.onSubmit({ ...validValues, images: [image] }));
    await act(async () => result.current.retryPendingUploads());

    expect(result.current.partialUpload).toEqual({
      url: "/anuncio/ad-1/edited", pendingNames: ["photo.webp"], retryFailed: true,
    });
    expect(mockActions.updateAd).toHaveBeenCalledOnce();
    const first = mockActions.uploadAdImage.mock.calls[0][1] as FormData;
    const retried = mockActions.uploadAdImage.mock.calls[1][1] as FormData;
    expect(retried.get("uploadId")).toBe(first.get("uploadId"));
  });
});
