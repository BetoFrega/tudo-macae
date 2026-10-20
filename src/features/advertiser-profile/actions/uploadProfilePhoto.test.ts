import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { expect, test, vi, beforeEach } from "vitest";
import { updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { uploadAdvertiserProfilePhoto } from "@/integrations/advertiser-identity/upload";
import { getAdvertiserProfileUseCase } from "@/packages/classifieds-api";
import { uploadProfilePhoto } from "./uploadProfilePhoto";
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/integrations/advertiser-identity/upload", () => ({ uploadAdvertiserProfilePhoto: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({ getAdvertiserProfileUseCase: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
test("missing session does not invoke upload", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect(await uploadProfilePhoto("profile", 1, new FormData())).toEqual({ success: false, error: "Entre na sua conta para enviar uma foto ao perfil." });
  expect(uploadAdvertiserProfilePhoto).not.toHaveBeenCalled();
});
test("forwards authenticated identity and invalidates only after success", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "owner", email: "owner@example.com", emailVerified: true, isAdmin: false, isEditor: false });
  vi.mocked(getAdvertiserProfileUseCase).mockResolvedValue({
    id: "profile", userId: "owner", title: "Perfil", description: "", contacts: [], activityAreas: [], createdAt: 1, updatedAt: 1,
  });
  vi.mocked(uploadAdvertiserProfilePhoto).mockResolvedValueOnce({ success: true, photoURL: "photo.webp" }).mockResolvedValueOnce({ success: false, error: "refused" });
  expect(await uploadProfilePhoto("profile", 1, new FormData())).toEqual({ success: true, photoURL: "photo.webp" });
  expect(uploadAdvertiserProfilePhoto).toHaveBeenCalledWith({ profileId: "profile", userId: "owner", isAdmin: false, expectedRevision: 1, file: null, operationId: null });
  expect(updateTag).toHaveBeenCalledWith("advertiser-profile-profile");
  vi.mocked(updateTag).mockClear();
  await uploadProfilePhoto("profile", 1, new FormData());
  expect(updateTag).not.toHaveBeenCalled();
});

test("a failed profile read happens before upload and preserves the Worker support code without duplicate logging", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "owner", email: "owner@example.com", emailVerified: true, isAdmin: false, isEditor: false });
  vi.mocked(getAdvertiserProfileUseCase).mockRejectedValueOnce(new ClassifiedsRequestError("unavailable", "worker-request", true));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await uploadProfilePhoto("profile", 1, new FormData())).toEqual({ success: false, error: "Não foi possível enviar a foto do perfil. Código de suporte: worker-request." });
    expect(uploadAdvertiserProfilePhoto).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  }
  finally { log.mockRestore(); }
});

test("cache invalidation failure does not relabel a persisted upload as failed", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "owner", email: "owner@example.com", emailVerified: true, isAdmin: false, isEditor: false });
  vi.mocked(uploadAdvertiserProfilePhoto).mockResolvedValueOnce({ success: true, photoURL: "photo.webp" });
  vi.mocked(updateTag).mockImplementationOnce(() => {
    throw new Error("Cache unavailable");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await uploadProfilePhoto("profile", 1, new FormData())).toEqual({ success: true, photoURL: "photo.webp" });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ cause: "cache_invalidation", profileId: "profile", service: "nextjs", statusClass: "5xx" });
  }
  finally { log.mockRestore(); }
});
