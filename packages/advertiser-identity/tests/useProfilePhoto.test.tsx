// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { processImage, validateImageFile } from "@tudomacae/media/imageProcessing";
import { IdentityProvider, useProfilePhoto, type IdentityIntegrations } from "../ui";

vi.mock("@tudomacae/media/imageProcessing", () => ({ processImage: vi.fn(), validateImageFile: vi.fn() }));

function change(file: File) {
  return { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

test("keeps the initial preview on invalid input and processing failures", async () => {
  const { result } = renderHook(() => useProfilePhoto("https://example.com/original.webp"), { wrapper });
  vi.mocked(validateImageFile).mockReturnValue({ isValid: false, error: "Arquivo inválido" });
  await act(() => result.current.handlePhotoChange(change(new File(["x"], "x.txt", { type: "text/plain" }))));
  expect(result.current.photoPreview).toBe("https://example.com/original.webp");
  expect(result.current.uploadError).toBe("Arquivo inválido");
  vi.mocked(validateImageFile).mockReturnValue({ isValid: true });
  vi.mocked(processImage).mockRejectedValue(new Error("Não foi possível processar"));
  await act(() => result.current.handlePhotoChange(change(new File(["x"], "x.webp", { type: "image/webp" }))));
  expect(result.current.uploadError).toBe("Não foi possível processar");
});

test("previews processed replacements and resets to the initial photo", async () => {
  const readAsDataURL = vi.fn();
  vi.stubGlobal("FileReader", class {
    result = "data:image/webp;base64,processed";
    onloadend: (() => void) | null = null;
    readAsDataURL(file: Blob) {
      readAsDataURL(file);
      this.onloadend?.();
    }
  });
  const first = new File(["first"], "first.webp", { type: "image/webp" });
  const second = new File(["second"], "second.webp", { type: "image/webp" });
  const { result } = renderHook(() => useProfilePhoto("https://example.com/original.webp"), { wrapper });
  vi.mocked(validateImageFile).mockReturnValue({ isValid: true });
  vi.mocked(processImage).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await act(() => result.current.handlePhotoChange(change(first)));
  await waitFor(() => expect(result.current.photoPreview).toContain("processed"));
  await act(() => result.current.handlePhotoChange(change(second)));
  expect(result.current.photoFile).toBe(second);
  expect(readAsDataURL).toHaveBeenCalledTimes(2);
  act(() => result.current.removePhoto());
  expect(result.current.photoFile).toBeNull();
  expect(result.current.photoPreview).toBe("https://example.com/original.webp");
});

test("a lost response retries the same photo intent, while another file gets a new intent", async () => {
  const uploadPhoto = vi.fn()
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce({ success: true, photoURL: "/photo" })
    .mockResolvedValueOnce({ success: true, photoURL: "/other-photo" });
  const customWrapper = ({ children }: { children: React.ReactNode }) => (
    <IdentityProvider integrations={{ Link: props => <a {...props} />, Image: props => <span role="img" aria-label={props.alt} />, origin: "https://www.test", capture() {}, readBusinesses: async () => ({ items: [] }), readPublicOfferings: async () => null, uploadPhoto }}>{children}</IdentityProvider>
  );
  const { result } = renderHook(() => useProfilePhoto(), { wrapper: customWrapper });
  const first = new File(["first"], "photo.webp", { type: "image/webp" });
  act(() => result.current.setPhotoFile(first));
  await act(() => result.current.uploadPhoto({ profileId: "profile", revision: 4 }));
  expect(result.current.hasPendingPhotoUpload).toBe(true);
  const complete = vi.fn();
  await act(() => result.current.retryPhotoUpload(complete));
  expect(complete).toHaveBeenCalledOnce();
  expect(uploadPhoto.mock.calls[0]![2].get("uploadId")).toBe(uploadPhoto.mock.calls[1]![2].get("uploadId"));
  expect(uploadPhoto.mock.calls[1]!.slice(0, 2)).toEqual(["profile", 4]);
  act(() => result.current.setPhotoFile(new File(["second"], "photo.webp", { type: "image/webp" })));
  await act(() => result.current.uploadPhoto({ profileId: "profile", revision: 5 }));
  expect(uploadPhoto.mock.calls[2]![2].get("uploadId")).not.toBe(uploadPhoto.mock.calls[0]![2].get("uploadId"));
});

test("a terminal refusal drops the file and its intent so the next upload needs a new selection", async () => {
  const uploadPhoto = vi.fn()
    .mockResolvedValueOnce({ success: false, error: "Este envio não pode mais ser confirmado.", reason: "invalid_photo" })
    .mockResolvedValueOnce({ success: true, photoURL: "/photo" });
  const customWrapper = ({ children }: { children: React.ReactNode }) => (
    <IdentityProvider integrations={{ Link: props => <a {...props} />, Image: props => <span role="img" aria-label={props.alt} />, origin: "https://www.test", capture() {}, readBusinesses: async () => ({ items: [] }), readPublicOfferings: async () => null, uploadPhoto }}>{children}</IdentityProvider>
  );
  const { result } = renderHook(() => useProfilePhoto("https://example.com/original.webp"), { wrapper: customWrapper });
  const file = new File(["photo"], "photo.webp", { type: "image/webp" });
  act(() => result.current.setPhotoFile(file));
  expect(await act(() => result.current.uploadPhoto({ profileId: "profile", revision: 4 }))).toBe(false);
  expect(result.current.hasPendingPhotoUpload).toBe(false);
  expect(result.current.photoFile).toBeNull();
  expect(result.current.photoPreview).toBe("https://example.com/original.webp");
  expect(result.current.uploadError).toContain("Este envio não pode mais ser confirmado.");
  act(() => result.current.setPhotoFile(file));
  await act(() => result.current.uploadPhoto({ profileId: "profile", revision: 5 }));
  expect(uploadPhoto.mock.calls[1]![2].get("uploadId")).not.toBe(uploadPhoto.mock.calls[0]![2].get("uploadId"));
});

function wrapper({ children }: { children: React.ReactNode }) {
  const integrations: IdentityIntegrations = {
    Link: props => <a {...props} />, Image: props => <span role="img" aria-label={props.alt} />,
    origin: "https://www.tudomacae.com.br", capture() {},
    readBusinesses: async () => ({ items: [] }), readPublicOfferings: async () => null,
    uploadPhoto: async () => ({ success: false, error: "Unused upload" }),
  };
  return <IdentityProvider integrations={integrations}>{children}</IdentityProvider>;
}
