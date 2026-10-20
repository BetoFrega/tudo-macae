import { forbidden, unauthorized } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";

vi.mock("next/navigation", () => ({
  forbidden: vi.fn(() => {
    throw new Error("forbidden");
  }),
  unauthorized: vi.fn(() => {
    throw new Error("unauthorized");
  }),
}));

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));

describe("authorizeCategoryManagement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an anonymous caller", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(authorizeCategoryManagement()).rejects.toThrow("unauthorized");
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("rejects a signed-in non-administrator", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "user-1",
      email: "user@example.com",
      emailVerified: true,
      isAdmin: false,
      isEditor: false,
    });

    await expect(authorizeCategoryManagement()).rejects.toThrow("forbidden");
    expect(forbidden).toHaveBeenCalledOnce();
  });

  it("allows an administrator", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "admin-1",
      email: "admin@example.com",
      emailVerified: true,
      isAdmin: true,
      isEditor: false,
    });

    await expect(authorizeCategoryManagement()).resolves.toBeUndefined();
    expect(unauthorized).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });
});
