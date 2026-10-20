import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { AdvertiserProfileAccessError, verifyAdvertiserProfileOwnershipUseCase } from "@/packages/classifieds-api";
import { getAdvertiserProfile } from "./getAdvertiserProfile";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({
  AdvertiserProfileAccessError: class AdvertiserProfileAccessError extends Error {},
  verifyAdvertiserProfileOwnershipUseCase: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

test("returns no profile without an authenticated owner", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  await expect(getAdvertiserProfile("business")).resolves.toBeNull();
  expect(verifyAdvertiserProfileOwnershipUseCase).not.toHaveBeenCalled();
});

test("keeps an absent or unauthorized profile distinct from a read failure", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "owner" } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockRejectedValueOnce(new AdvertiserProfileAccessError("not-found"));
  await expect(getAdvertiserProfile("business")).resolves.toBeNull();
  vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockRejectedValueOnce(new AdvertiserProfileAccessError("forbidden"));
  await expect(getAdvertiserProfile("business")).resolves.toBeNull();

  const failure = new Error("unavailable");
  vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockRejectedValueOnce(failure);
  await expect(getAdvertiserProfile("business")).rejects.toBe(failure);
});
