import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { deleteAdUseCase } from "../../../integrations/ads/use-cases/deleteAdUseCase";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";
import { deleteAd } from "./deleteAd";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  unauthorized: vi.fn(() => {
    throw new Error("NEXT_UNAUTHORIZED");
  }),
}));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("../../../integrations/ads/use-cases/deleteAdUseCase", () => ({ deleteAdUseCase: vi.fn() }));
vi.mock("../../../integrations/ads/use-cases/verifyAdOwnershipUseCase", () => ({
  verifyAdOwnershipUseCase: vi.fn(),
}));

describe("deleteAd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "user-1",
      email: "pessoa@example.com",
      emailVerified: true,
      isAdmin: false,
      isEditor: false,
    });
    vi.mocked(verifyAdOwnershipUseCase).mockResolvedValue({
      id: "ad-1",
      userId: "user-1",
      advertiserProfileId: "profile-1",
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
      title: "Bicicleta",
      slug: "bicicleta",
      text: "Bicicleta em bom estado.",
      status: "active",
      images: [],
      createdAt: 1,
    });
    vi.mocked(deleteAdUseCase).mockResolvedValue();
  });

  test("expires the verified persisted placement after deletion", async () => {
    await expect(deleteAd("ad-1")).resolves.toEqual({ success: true });

    expect(verifyAdOwnershipUseCase).toHaveBeenCalledWith({
      id: "ad-1",
      userId: "user-1",
      isAdmin: false,
    });
    expect(deleteAdUseCase).toHaveBeenCalledWith({ id: "ad-1" });
    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
      "/",
      "/minha-conta/anuncios",
      "/anuncio/ad-1",
    ]);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag).mock.calls.map(([tag]) => tag)).toEqual([
      "ads",
      "ads-by-profile-profile-1",
      "ad-ad-1",
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test("refuses a visitor before reading or deleting an Ad", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(deleteAd("ad-1")).rejects.toThrow("NEXT_UNAUTHORIZED");

    expect(verifyAdOwnershipUseCase).not.toHaveBeenCalled();
    expect(deleteAdUseCase).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("maps a missing Ad to not found without expiring tags", async () => {
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(new Error("Ad not found"));

    await expect(deleteAd("ad-1")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(deleteAdUseCase).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("expires no tags when ownership verification fails", async () => {
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(new Error("Unauthorized"));

    await expect(deleteAd("ad-1")).rejects.toThrow("Failed to delete ad");

    expect(deleteAdUseCase).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("expires no tags when persistence fails", async () => {
    vi.mocked(deleteAdUseCase).mockRejectedValue(new Error("Storage provider secret at ad-images/ad-1/private.webp"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteAd("ad-1")).rejects.toThrow("Failed to delete ad");

    expect(updateTag).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "ad-delete", cause: "unexpected", correlationId: expect.any(String),
      service: "nextjs", environment: expect.any(String), release: expect.any(String),
    });
    expect(log.mock.calls.flat().join(" ")).not.toContain("provider secret");
    log.mockRestore();
  });
});
