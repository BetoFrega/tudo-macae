// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
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

describe("publication journey photos and locking", () => {
  beforeEach(resetJourneyMocks);
  it("publishes a removal using the remaining photo position instead of its old order field", async () => {
    const images = [0, 1].map(order => ({ id: `photo-${order}`, path: `ad-images/draft/photo-${order}.webp`, title: `Foto ${order}`, description: "", order, url: `https://example.test/photo-${order}` }));
    const initial = { id: "draft", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado.", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images };
    mocks.sync.mockResolvedValueOnce({ success: true, images }).mockResolvedValue({ success: true, images: [{ ...images[1], order: 0 }] });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.continueAd());
    act(() => result.current.form.setValue("images", [images[1]!]));
    expect(result.current.photoChangesPending).toBe(true);
    await act(() => result.current.publish());
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith("draft", expect.objectContaining({ images: [{ id: "photo-1", title: "Foto 1", description: "", order: 0 }] }));
    expect(JSON.parse(String((mocks.sync.mock.calls[1]![1] as FormData).get("images")))).toEqual([{ id: "photo-1", title: "Foto 1", description: "", order: 0 }]);
    expect(result.current.form.getValues("images.0.order")).toBe(1);
    expect(result.current.photoChangesPending).toBe(false);
    expect(result.current.savedPhotoCount).toBe(1);
  });
  it("sends three photos in one request and skips unchanged saves", async () => {
    mocks.sync.mockImplementation(async (_id: string, payload: FormData) => ({
      success: true,
      images: JSON.parse(String(payload.get("images"))).map((image: { id: string }) => ({ ...image, path: `ad-images/ad/${image.id}.png` })),
    }));
    const { result } = renderHook(() => usePublicationJourney());
    act(() => {
      fill(result);
      result.current.form.setValue("images", [0, 1, 2].map(order => ({
        file: new File([`image-${order}`], `${order}.png`, { type: "image/png" }),
        url: "data:image/png;base64,aW1hZ2U=", title: `Foto ${order}`, description: "", order,
      })));
    });
    await act(() => result.current.continueAd());
    expect(mocks.sync).toHaveBeenCalledOnce();
    const payload = mocks.sync.mock.calls[0]![1] as FormData;
    expect([0, 1, 2].map(index => payload.get(`file-${index}`))).toEqual([expect.any(File), expect.any(File), expect.any(File)]);
    await act(() => result.current.publish());
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledOnce();
  });
  it("drops a missing profile association when resuming a pending publication", () => {
    const { result } = renderHook(() => usePublicationJourney({ id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, advertiserProfileId: "deleted-profile" }));
    expect(result.current.form.getValues("advertiserProfileId")).toBe("");
    expect(result.current.step).toBe("profile");
  });
  it("locks to the persisted publication after a partial publication failure", async () => {
    const publication = { id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, advertiserProfileId: "profile", published: true };
    mocks.publish.mockResolvedValue({ success: false, error: "Try again", publication });
    const { result } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    await act(() => result.current.publish());
    expect(result.current.locked).toBe(true);
    expect(result.current.form.getValues("text")).toBe("Em bom estado");
    expect(result.current.published).toBeUndefined();
  });
  it("unlocks a resumed publication when photo verification returns an editable draft", async () => {
    const initial = { id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, advertiserProfileId: "profile", published: true };
    mocks.publish.mockResolvedValue({ success: false, error: "A foto salva não está disponível. Remova ou substitua a foto e tente publicar novamente.", photoUnavailable: true, publication: { ...initial, published: false } });
    const { result } = renderHook(() => usePublicationJourney(initial));
    expect(result.current.locked).toBe(true);
    await act(() => result.current.publish());
    expect(result.current.locked).toBe(false);
    expect(result.current.error).toContain("Remova ou substitua a foto");
    expect(result.current.photoUnavailable).toBe(true);
    expect(result.current.form.getValues("title")).toBe("Bicicleta");
  });
  it("flags an unavailable photo only from the structured result and only while its error is shown", async () => {
    const initial = { id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, advertiserProfileId: "profile", published: true };
    mocks.publish.mockResolvedValue({ success: false, error: "A foto salva não está disponível.", photoUnavailable: false, publication: { ...initial, published: false } });
    const textOnly = renderHook(() => usePublicationJourney(initial)).result;
    await act(() => textOnly.current.publish());
    expect(textOnly.current.error).toBe("A foto salva não está disponível.");
    expect(textOnly.current.photoUnavailable).toBe(false);
    mocks.publish.mockResolvedValue({ success: false, error: "Foto indisponível", photoUnavailable: true, publication: { ...initial, published: false } });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.publish());
    expect(result.current.photoUnavailable).toBe(true);
    act(() => result.current.setError(""));
    expect(result.current.photoUnavailable).toBe(false);
  });

  it.each([
    { success: true, adId: "old-owner-ad", slug: "bicicleta" },
    { success: false, error: "O perfil foi alterado em outra aba. Confira os dados." },
  ])("discards a publication result ($success) after switching accounts without a recovery query", async (reply) => {
    const initial = { id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, published: true, images: [] };
    let finish!: (result: typeof reply) => void;
    mocks.publish.mockReturnValue(new Promise<typeof reply>((resolve) => {
      finish = resolve;
    }));
    const { result, rerender } = renderHook(() => usePublicationJourney(initial));
    let publishing!: Promise<void>;
    act(() => {
      publishing = result.current.publish();
    });
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledOnce());
    mocks.uid = "another-owner";
    rerender();
    expect(window.location.search).toBe("");
    await act(async () => {
      finish(reply);
      await publishing;
    });
    expect(result.current.published).toBeUndefined();
    expect(result.current.step).not.toBe("success");
    expect(result.current.error).toBe("");
    expect(mocks.profiles).not.toHaveBeenCalled();
  });
  it("opens the profile editor when the profile loses its contact before activation", async () => {
    const publication = { id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, advertiserProfileId: "profile", published: false };
    mocks.profiles.mockResolvedValueOnce([profile]).mockResolvedValueOnce([{ ...profile, contacts: [] }]);
    mocks.publish.mockResolvedValue({ success: false, error: "Complete o nome e um contato do perfil antes de publicar.", publication });
    const { result } = renderHook(() => usePublicationJourney());
    act(() => fill(result));
    await act(() => result.current.continueAd());
    await act(() => result.current.publish());
    expect(result.current.locked).toBe(false);
    expect(result.current.step).toBe("profile");
    expect(result.current.profile?.contacts).toEqual([]);
    expect(result.current.error).toContain("Complete o nome e um contato");
  });
  it("replaces stale local photos with the server's recovery state", async () => {
    const initial = { id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, advertiserProfileId: "profile", published: true, images: [] };
    const imageId = crypto.randomUUID();
    mocks.publish.mockResolvedValue({ success: false, error: "Foto indisponível", publication: { ...initial, published: false, images: [{ id: imageId, path: `ad-images/pending/pending/${imageId}.png`, title: "Frente", description: "", order: 0 }] } });
    const { result } = renderHook(() => usePublicationJourney(initial));
    await act(() => result.current.publish());
    expect(result.current.locked).toBe(false);
    expect(result.current.form.getValues("images")).toMatchObject([{ id: imageId, url: `/api/publicacoes-pendentes/pending/fotos/${imageId}` }]);
    mocks.sync.mockResolvedValueOnce({ success: true, images: [{ id: imageId, path: `ad-images/pending/pending/${imageId}.png` }] });
    await act(() => result.current.persist());
    expect(mocks.sync).toHaveBeenCalledOnce();
    act(() => result.current.form.setValue("images", []));
    await act(() => result.current.persist());
    const submitted = mocks.sync.mock.calls[1]![1];
    expect(JSON.parse(String(submitted.get("observedImageIds")))).toEqual([imageId]);
    expect(JSON.parse(String(submitted.get("observedImages")))).toEqual([{ id: imageId, title: "Frente", description: "", order: 0 }]);
    expect(JSON.parse(String(submitted.get("images")))).toEqual([]);
  });
  it("keeps selected photos on the page and blocks publication when saving them fails", async () => {
    mocks.sync.mockResolvedValue({ success: false, error: "Falha no envio" });
    const { result } = renderHook(() => usePublicationJourney());
    act(() => {
      fill(result);
      result.current.form.setValue("images", [{ file: new File(["image"], "photo.png"), url: "blob:photo", title: "", description: "", order: 0 }]);
    });
    await act(() => result.current.continueAd());
    expect(result.current.published).toBeUndefined();
    expect(result.current.error).toContain("fotos");
    expect(result.current.form.getValues("images.0.file")).toBeInstanceOf(File);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("reuses the photo submission receipt on retry and creates a new one after selection changes", async () => {
    mocks.sync.mockResolvedValue({ success: false, error: "Resposta perdida" });
    const { result } = renderHook(() => usePublicationJourney());
    act(() => {
      fill(result);
      result.current.form.setValue("images", [{ file: new File(["image"], "photo.png"), url: "blob:photo", title: "", description: "", order: 0 }]);
    });
    await act(() => result.current.continueAd());
    await act(() => result.current.continueAd());
    const first = mocks.sync.mock.calls[0]![1].get("operationId");
    expect(first).toMatch(/^[a-f0-9-]{36}$/);
    expect(mocks.sync.mock.calls[1]![1].get("operationId")).toBe(first);
    act(() => result.current.form.setValue("images", []));
    await act(() => result.current.continueAd());
    expect(mocks.sync.mock.calls[2]![1].get("operationId")).not.toBe(first);
    expect(mocks.sync.mock.calls[2]![1].get("images")).toBe("[]");
    expect(result.current.error).toContain("confirmar a lista de fotos");
  });
});

it("focuses the confirmation after React renders the successful publication", async () => {
  window.history.replaceState(null, "", "/publicar");
  mocks.authenticated = true;
  mocks.profiles.mockResolvedValue([profile]);
  mocks.save.mockResolvedValue({ success: true });
  mocks.sync.mockResolvedValue({ success: true, images: [] });
  mocks.publish.mockResolvedValue({ success: true, adId: "ad", slug: "bicicleta" });
  const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  function Journey() {
    const journey = usePublicationJourney();
    return (
      <>
        <button onClick={() => {
          fill({ current: journey });
          void journey.continueAd();
        }}
        >
          Continue
        </button>
        <button disabled={journey.step !== "publication"} onClick={() => void journey.publish()}>Publish</button>
        {journey.published && <h2 id="publication-success" tabIndex={-1}>Published</h2>}
      </>
    );
  }
  try {
    render(<Journey />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const heading = await screen.findByRole("heading", { name: "Published" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  }
  finally {
    frame.mockRestore();
    scroll.mockRestore();
  }
});
