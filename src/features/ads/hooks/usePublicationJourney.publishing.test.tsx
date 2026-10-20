// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
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

describe("publication journey publishing", () => {
  beforeEach(resetJourneyMocks);
  it("saves after authentication without publishing and preserves the pending id on retry", async () => {
    mocks.authenticated = false;
    const { result } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    expect(mocks.save).not.toHaveBeenCalled();
    const authenticated = mocks.login.mock.calls[0]![0];
    await act(async () => {
      await authenticated();
    });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(result.current.step).toBe("publication");
    const id = mocks.save.mock.calls[0]![0].id;
    await act(() => result.current.persist());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(result.current.publicationId.current).toBe(id);
  });
  it("continues to profile creation when the account has no profile", async () => {
    mocks.profiles.mockResolvedValue([]);
    const { result } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    expect(result.current.step).toBe("profile");
    expect(mocks.save.mock.calls[0]![0]).not.toHaveProperty("advertiserProfileId");
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("publishes only on the final action and keeps a durable success result", async () => {
    const { result } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    expect(mocks.publish).not.toHaveBeenCalled();
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(result.current.published).toEqual({ adId: "ad", slug: "bicicleta" });
    expect(result.current.step).toBe("success");
  });
  it("refreshes a stale review and requires another explicit publication action", async () => {
    const initial = { id: "draft", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado.", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [] };
    const current = { ...initial, title: "Título da outra aba", published: false };
    mocks.publish.mockResolvedValueOnce({ success: false, error: "Este rascunho foi alterado em outra aba. Confira o conteúdo atualizado antes de publicar.", publication: current });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenLastCalledWith("draft", expect.objectContaining({ title: "Bicicleta" }));
    expect(result.current.form.getValues("title")).toBe(current.title);
    expect(result.current.published).toBeUndefined();
    expect(result.current.step).toBe("publication");
    expect(result.current.error).toContain("Confira o conteúdo atualizado");
    expect(mocks.save).not.toHaveBeenCalled();
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenLastCalledWith("draft", expect.objectContaining({ title: current.title }));
    expect(result.current.step).toBe("success");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("stores selected photos before publishing and does not send them twice", async () => {
    mocks.sync.mockImplementation(async (_id: string, payload: FormData) => ({
      success: true,
      images: JSON.parse(String(payload.get("images"))).map((image: { id: string }) => ({ ...image, path: `ad-images/ad/${image.id}.png` })),
    }));
    const { result } = renderHook(() => usePublicationJourney());
    act(() => {
      fill(result);
      result.current.form.setValue("images", [{ file: new File(["image"], "photo.png", { type: "image/png" }), url: "data:image/png;base64,aW1hZ2U=", title: "Frente", description: "", order: 0 }]);
    });
    await act(() => result.current.continueAd());
    expect(mocks.sync.mock.calls.some(call => (call[1] as FormData).get("file-0") instanceof File)).toBe(true);
    expect(result.current.form.getValues("images.0.path")).toMatch(/^ad-images\/ad\//);
    expect(result.current.form.getValues("images.0.file")).toBeUndefined();
    await act(() => result.current.publish());
    expect(result.current.published).toEqual({ adId: "ad", slug: "bicicleta" });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("publishes the photo metadata saved by the same final action", async () => {
    const image = { id: "00000000-0000-4000-8000-000000000001", path: "ad-images/draft/photo.webp", title: "Antes", description: "Descrição anterior", order: 0, url: "https://example.test/photo" };
    const initial = { id: "draft", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado.", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [image] };
    mocks.sync.mockResolvedValue({ success: true, images: [{ ...image, title: "Depois", description: "Descrição revisada" }] });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    act(() => result.current.form.setValue("images", [{ ...image, title: "Depois", description: "Descrição revisada" }]));
    await act(() => result.current.publish());
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith("draft", expect.objectContaining({
      images: [{ id: image.id, title: "Depois", description: "Descrição revisada", order: 0 }],
    }));
    expect(result.current.step).toBe("success");
    expect(result.current.photoChangesPending).toBe(false);
  });

  it("publishes a newly uploaded photo from the same final action without another upload", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    const initial = { id: "draft", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado.", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [] };
    mocks.sync.mockResolvedValue({ success: true, images: [{ id, path: "ad-images/draft/new.webp", title: "Nova foto", description: "", order: 0 }] });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    act(() => result.current.form.setValue("images", [{ id, file: new File(["image"], "photo.png", { type: "image/png" }), url: "data:image/png;base64,aW1hZ2U=", title: "Nova foto", description: "", order: 0 }]));
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith("draft", expect.objectContaining({ images: [{ id, title: "Nova foto", description: "", order: 0 }] }));
    expect(result.current.form.getValues("images.0.file")).toBeUndefined();
    expect(result.current.form.getValues("images.0.path")).toBe("ad-images/draft/new.webp");
    expect(result.current.photoChangesPending).toBe(false);
    await act(() => result.current.persist());
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("refreshes a changed advertiser profile and requires another explicit publication action", async () => {
    const initial = { id: "draft", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado.", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [] };
    const currentProfile = { ...profile, title: "Outro nome", contacts: [{ number: "22988888888", isWhatsapp: false }] };
    mocks.profiles.mockResolvedValueOnce([profile]).mockResolvedValueOnce([currentProfile]);
    mocks.publish.mockResolvedValueOnce({ success: false, error: "O perfil foi alterado em outra aba. Confira os dados atualizados de quem anuncia antes de publicar.", publication: initial });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenLastCalledWith("draft", expect.objectContaining({ advertiserProfile: { title: profile.title, contacts: profile.contacts } }));
    expect(result.current.profile).toEqual(currentProfile);
    expect(result.current.published).toBeUndefined();
    expect(result.current.step).toBe("publication");
    expect(result.current.error).toContain("Confira os dados atualizados");
    expect(mocks.publish).toHaveBeenCalledOnce();
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenLastCalledWith("draft", expect.objectContaining({ advertiserProfile: { title: currentProfile.title, contacts: currentProfile.contacts } }));
    expect(result.current.step).toBe("success");
  });
  it("explains how to recover when changed advertiser details cannot be refreshed", async () => {
    const initial = { id: "draft", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado.", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [] };
    mocks.profiles.mockResolvedValueOnce([profile]).mockRejectedValueOnce(new Error("Profile read unavailable"));
    mocks.publish.mockResolvedValueOnce({ success: false, error: "O perfil foi alterado em outra aba. Confira os dados atualizados de quem anuncia antes de publicar.", publication: initial });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    await act(() => result.current.publish());
    expect(result.current.error).toContain("Não foi possível carregar os dados atuais de quem anuncia");
    expect(result.current.error).toContain("Recarregue esta página");
    expect(result.current.error).toContain("Seu anúncio continua salvo");
    expect(result.current.profile).toEqual(profile);
    expect(result.current.form.getValues("title")).toBe(initial.title);
    expect(result.current.publicationId.current).toBe(initial.id);
    expect(result.current.published).toBeUndefined();
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
});
