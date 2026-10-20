import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  deleteAdvertiserProfileAdministrationUseCase,
} from "@/packages/classifieds-api";
import { adminDeleteClaimableAdvertiserProfile } from "./adminDeleteClaimableAdvertiserProfile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({
  deleteAdvertiserProfileAdministrationUseCase: vi.fn(),
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
  vi.mocked(deleteAdvertiserProfileAdministrationUseCase).mockResolvedValue({
    outcome: "deleted", replayed: false, profileId: "profile", revision: 2,
    effects: { previousActivityAreas: [{ categoryId: "services", subcategoryId: "food" }], activityAreas: [] },
    photoCleanup: { status: "not_required" },
  });
});

test("administrator deletes through the dedicated claimable operation", async () => {
  await expect(adminDeleteClaimableAdvertiserProfile("profile", 1, "operation")).resolves.toEqual({ success: true });
  expect(deleteAdvertiserProfileAdministrationUseCase).toHaveBeenCalledWith({
    id: "profile", expectedRevision: 1, idempotencyKey: "operation", actorId: "admin", channel: "administration",
  });
  expect(revalidateTag).toHaveBeenCalledWith(
    "activity-area-advertisers:services:food",
    "max",
  );
  expect(updateTag).toHaveBeenCalledWith(
    "activity-area-advertisers:services:food",
  );
  expect(revalidatePath).toHaveBeenCalledWith("/admin/perfis");
});

test.each([
  [null, "Unauthorized"],
  [{ uid: "user", email: "user@example.com", emailVerified: true, isAdmin: false, isEditor: false }, "Forbidden"],
] as const)("rejects deletion without administrator access", async (user, message) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  await expect(adminDeleteClaimableAdvertiserProfile("profile", 1, "operation")).rejects.toThrow(message);
  expect(deleteAdvertiserProfileAdministrationUseCase).not.toHaveBeenCalled();
});
