import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  deleteAdvertiserIdentityUseCase,
  previewAdvertiserIdentityDeletionUseCase,
} from "@/packages/classifieds-api";
import { adminDeleteAdvertiserIdentity, previewAdminAdvertiserIdentityDeletion } from "./adminDeleteAdvertiserIdentity";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({
  deleteAdvertiserIdentityUseCase: vi.fn(),
  previewAdvertiserIdentityDeletionUseCase: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  unauthorized: () => { throw new Error("Unauthorized"); },
  forbidden: () => { throw new Error("Forbidden"); },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "admin", email: "admin@example.com", emailVerified: true, isAdmin: true, isEditor: false,
  });
  vi.mocked(deleteAdvertiserIdentityUseCase).mockResolvedValue({
    outcome: "deleted", replayed: false, profileId: "profile", revision: 2,
    effects: { previousActivityAreas: [{ categoryId: "services", subcategoryId: "food" }], activityAreas: [] },
    photoCleanup: { status: "not_required" }, cacheTags: ["ad-ad", "ads"], deletedAds: 1,
  });
});

test("administrator confirms deletion and expires affected public caches", async () => {
  await expect(adminDeleteAdvertiserIdentity({ id: "profile", confirmationToken: "token", confirmedTitle: "Oficina", reason: "Duplicado", idempotencyKey: "operation" })).resolves.toEqual({ success: true });
  expect(deleteAdvertiserIdentityUseCase).toHaveBeenCalledWith(expect.objectContaining({
    id: "profile", confirmationToken: "token", confirmedTitle: "Oficina", reason: "Duplicado", idempotencyKey: "operation", actorId: "admin", channel: "administration",
  }));
  expect(revalidateTag).toHaveBeenCalledWith(
    "activity-area-advertisers:services:food",
    "max",
  );
  expect(updateTag).toHaveBeenCalledWith(
    "activity-area-advertisers:services:food",
  );
  expect(revalidatePath).toHaveBeenCalledWith("/admin/perfis");
  expect(updateTag).toHaveBeenCalledWith("ad-ad");
});

test("preserves the expected instruction when associated photos block deletion", async () => {
  const message = "Aguarde o envio das fotos terminar antes de excluir o perfil.";
  vi.mocked(deleteAdvertiserIdentityUseCase).mockRejectedValue(new AdvertiserProfileAdministrationError("imageCleanupBlocked", message));
  await expect(adminDeleteAdvertiserIdentity({ id: "profile", confirmationToken: "token", confirmedTitle: "Oficina", reason: "Duplicado", idempotencyKey: "operation" })).resolves.toEqual({ success: false, error: message });
  expect(updateTag).not.toHaveBeenCalled();
});

test.each([
  [null, "Unauthorized"],
  [{ uid: "user", email: "user@example.com", emailVerified: true, isAdmin: false, isEditor: false }, "Forbidden"],
] as const)("rejects deletion without administrator access", async (user, message) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  await expect(adminDeleteAdvertiserIdentity({ id: "profile", confirmationToken: "token", confirmedTitle: "Oficina", reason: "Duplicado", idempotencyKey: "operation" })).rejects.toThrow(message);
  await expect(previewAdminAdvertiserIdentityDeletion("profile")).rejects.toThrow(message);
  expect(previewAdvertiserIdentityDeletionUseCase).not.toHaveBeenCalled();
  expect(deleteAdvertiserIdentityUseCase).not.toHaveBeenCalled();
});
