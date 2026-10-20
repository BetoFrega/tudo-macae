// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mocks, profile, resetJourneyMocks } from "./usePublicationJourney.fixtures";
import { usePublicationJourney } from "./usePublicationJourney";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URL(window.location.href).searchParams }));
vi.mock("@/features/authentication/AuthContext", () => ({ useAuth: () => ({ user: mocks.authenticated ? { uid: mocks.uid } : null }) }));
vi.mock("@/features/authentication/LoginModalContext", () => ({ useLoginModal: () => ({ openLoginModal: mocks.login }) }));
vi.mock("@/features/advertiser-profile/actions/getUserAdvertiserProfiles", () => ({ getUserAdvertiserProfiles: mocks.profiles }));
vi.mock("../actions/publication", () => ({ savePendingPublication: mocks.save, publishPendingPublication: mocks.publish }));
vi.mock("../client/readPendingPublication", () => ({ readPendingPublication: mocks.recover }));
vi.mock("../client/savePendingPhotos", () => ({ savePendingPhotos: mocks.sync }));
vi.mock("../contexts/AdFormContext", () => ({ useAdFormContext: () => ({ profiles: [], categories: [], actions: { uploadAdImage: mocks.upload } }) }));

describe("publication journey navigation and login", () => {
  beforeEach(resetJourneyMocks);
  it("clears the successful publication result when another draft is selected", async () => {
    const initial = { id: "first", userId: "user", title: "Primeiro anúncio", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [] };
    window.history.replaceState(null, "", "/publicar?publication=first");
    const { result, rerender } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    await act(() => result.current.publish());
    expect(result.current.published).toEqual({ adId: "ad", slug: "bicicleta" });
    mocks.recover.mockResolvedValue({ publication: { ...initial, id: "second", title: "Segundo rascunho" }, profiles: [] });
    window.history.replaceState(null, "", "/publicar?publication=second");
    rerender();
    await waitFor(() => expect(result.current.publicationId.current).toBe("second"));
    expect(result.current.published).toBeUndefined();
    expect(result.current.locked).toBe(false);
    expect(result.current.step).toBe("profile");
  });
  it("does not show the result of publishing an earlier draft after navigation", async () => {
    const initial = { id: "first", userId: "user", title: "Primeiro anúncio", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [] };
    let finishPublication!: (value: unknown) => void;
    mocks.publish.mockImplementationOnce(() => new Promise((resolve) => {
      finishPublication = resolve;
    }));
    window.history.replaceState(null, "", "/publicar?publication=first");
    const { result, rerender } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    let publishing!: Promise<void>;
    act(() => {
      publishing = result.current.publish();
    });
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledOnce());
    mocks.recover.mockResolvedValue({ publication: { ...initial, id: "second", title: "Segundo rascunho" }, profiles: [] });
    window.history.replaceState(null, "", "/publicar?publication=second");
    rerender();
    await waitFor(() => expect(result.current.publicationId.current).toBe("second"));
    await act(async () => {
      finishPublication({ success: true, adId: "first", slug: "primeiro" });
      await publishing;
    });
    expect(result.current.published).toBeUndefined();
    expect(result.current.form.getValues("title")).toBe("Segundo rascunho");
    expect(result.current.step).toBe("profile");
    expect(result.current.error).toBe("");
  });
  it("does not apply an upload result after navigation recovers another draft", async () => {
    let finishUpload!: (value: unknown) => void;
    mocks.sync.mockImplementationOnce(() => new Promise((resolve) => {
      finishUpload = resolve;
    }));
    const { result, rerender } = renderHook(() => usePublicationJourney());
    act(() => {
      fill(result);
      result.current.form.setValue("images", [{ file: new File(["photo"], "photo.png", { type: "image/png" }), url: "blob:local", title: "Local", description: "", order: 0 }]);
    });
    let saving!: Promise<void>;
    act(() => {
      saving = result.current.continueAd();
    });
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
    const oldImages = JSON.parse(String((mocks.sync.mock.calls[0]![1] as FormData).get("images")));
    const second = { id: "second", userId: "user", title: "Segundo rascunho", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, images: [] };
    mocks.recover.mockResolvedValue({ publication: second, profiles: [] });
    window.history.replaceState(null, "", "/publicar?publication=second");
    rerender();
    await waitFor(() => expect(result.current.publicationId.current).toBe("second"));
    await act(async () => {
      finishUpload({ success: true, images: oldImages.map((image: { id: string }) => ({ ...image, path: `ad-images/first/${image.id}.png` })) });
      await saving;
    });
    expect(result.current.form.getValues("title")).toBe(second.title);
    expect(result.current.form.getValues("images")).toEqual([]);
    expect(result.current.error).toBe("");
    expect(new URL(window.location.href).searchParams.get("publication")).toBe("second");
  });
  it("does not replace local edits when saving adds the same draft id to the URL", async () => {
    const { result, rerender } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    act(() => result.current.form.setValue("title", "Edição local ainda não salva"));
    rerender();
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(result.current.form.getValues("title")).toBe("Edição local ainda não salva");
  });
  it("preserves visitor photos when the original login callback resumes under a newly authenticated UID", async () => {
    mocks.authenticated = false;
    let finishUpload!: (value: unknown) => void;
    mocks.sync.mockImplementationOnce(() => new Promise((resolve) => {
      finishUpload = resolve;
    }));
    const { result, rerender } = renderHook(() => usePublicationJourney());
    act(() => {
      fill(result);
      result.current.form.setValue("images", [{ file: new File(["photo"], "photo.png", { type: "image/png" }), url: "data:image/png;base64,aW1hZ2U=", title: "Frente", description: "", order: 0 }]);
    });
    await act(() => result.current.continueAd());
    const authenticated = mocks.login.mock.calls[0]![0];
    mocks.authenticated = true;
    mocks.uid = "registered-owner";
    rerender();
    act(() => authenticated());
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
    const images = JSON.parse(String((mocks.sync.mock.calls[0]![1] as FormData).get("images")));
    rerender();
    try {
      expect(mocks.recover).not.toHaveBeenCalled();
      await act(async () => finishUpload({ success: true, images: images.map((image: { id: string }) => ({ ...image, path: `ad-images/draft/${image.id}.png` })) }));
      await waitFor(() => expect(result.current.savedPhotoCount).toBe(1));
      expect(result.current.form.getValues("images.0.file")).toBeUndefined();
      expect(result.current.form.getValues("images.0.title")).toBe("Frente");
      expect(result.current.error).toBe("");
    }
    finally {
      finishUpload({ success: true, images: [] });
    }
  });
  it("ignores login callbacks from another publication context", async () => {
    mocks.authenticated = false;
    const { result, rerender } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    const [authenticated, dismissed] = mocks.login.mock.calls[0]!;
    mocks.authenticated = true;
    mocks.recover.mockResolvedValue({ publication: { id: "second", userId: "user", title: "Segundo rascunho", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, images: [] }, profiles: [] });
    window.history.replaceState(null, "", "/publicar?publication=second");
    rerender();
    await waitFor(() => expect(result.current.publicationId.current).toBe("second"));
    await act(async () => {
      authenticated();
      dismissed();
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(result.current.form.getValues("title")).toBe("Segundo rascunho");
    expect(result.current.error).toBe("");
  });
  it.each(["success", "failure"])("discards the login continuation profile %s after the account changes", async (outcome) => {
    mocks.authenticated = false;
    let finish!: (profiles: typeof profile[]) => void;
    let fail!: (error: Error) => void;
    mocks.profiles.mockReturnValue(new Promise<typeof profile[]>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    }));
    const { result, rerender } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    const authenticated = mocks.login.mock.calls[0]![0];
    mocks.authenticated = true;
    mocks.uid = "first-owner";
    rerender();
    act(() => authenticated());
    await waitFor(() => expect(mocks.profiles).toHaveBeenCalledOnce());
    mocks.uid = "next-owner";
    rerender();
    await act(async () => {
      if (outcome === "success") finish([profile]);
      else fail(new Error("Old account profile failure"));
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.profiles).toEqual([]);
    expect(result.current.form.getValues("advertiserProfileId")).toBe("");
    expect(result.current.error).toBe("");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
