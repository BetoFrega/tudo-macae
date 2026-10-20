import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { setAdStatus } from "@/integrations/ads/mutation";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";
import { updateAdStatus } from "./updateAdStatus";
import { PublicationRequirementError } from "@tudomacae/ads/publicationEligibility";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/integrations/ads/mutation", () => ({
  setAdStatus: vi.fn(),
}));
vi.mock("../../../integrations/ads/use-cases/verifyAdOwnershipUseCase", () => ({
  verifyAdOwnershipUseCase: vi.fn(),
}));

describe("updateAdStatus", () => {
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
    vi.mocked(setAdStatus).mockResolvedValue();
  });

  test("expires the verified persisted placement after a status change", async () => {
    await expect(updateAdStatus("ad-1", "paused")).resolves.toEqual({
      success: true,
      status: "paused",
    });

    expect(verifyAdOwnershipUseCase).toHaveBeenCalledWith({
      id: "ad-1",
      userId: "user-1",
      isAdmin: false,
    });
    expect(setAdStatus).toHaveBeenCalledWith({
      id: "ad-1",
      status: "paused",
    });
    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
      "/",
      "/minha-conta/anuncios",
      "/anuncio/ad-1",
    ]);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledWith(
      "ads-by-profile-profile-1",
    );
    expect(vi.mocked(updateTag).mock.calls.map(([tag]) => tag)).toEqual([
      "ad-ad-1",
      "ads-by-profile-profile-1",
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test("returns the associated profile recovery without attempting activation", async () => {
    vi.mocked(setAdStatus).mockRejectedValue(
      new PublicationRequirementError("profile", ["contact"]),
    );

    await expect(updateAdStatus("ad-1", "active")).resolves.toEqual({
      success: false,
      reason: "profile",
      error: "Complete um contato válido no perfil antes de ativar o anúncio.",
      adId: "ad-1",
      advertiserProfileId: "profile-1",
    });

    expect(updateTag).not.toHaveBeenCalled();
  });

  test("returns the email verification recovery without attempting activation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "user-1",
      email: "pessoa@example.com",
      emailVerified: false,
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
      status: "paused",
      images: [],
      createdAt: 1,
    });

    await expect(updateAdStatus("ad-1", "active")).resolves.toEqual({
      success: false,
      reason: "email",
      error: "Confirme seu e-mail antes de reativar o anúncio.",
      adId: "ad-1",
    });

    expect(setAdStatus).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("refuses a visitor before reading or updating an Ad", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(updateAdStatus("ad-1", "paused")).rejects.toThrow(
      /^Unauthorized: User must be logged in to update an ad status$/,
    );

    expect(verifyAdOwnershipUseCase).not.toHaveBeenCalled();
    expect(setAdStatus).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("expires no tags when persistence fails", async () => {
    vi.mocked(setAdStatus).mockRejectedValue(new Error("Firestore unavailable"));

    await expect(updateAdStatus("ad-1", "paused")).resolves.toEqual({
      success: false,
      reason: "technical",
      error: "Não foi possível atualizar o anúncio. Tente novamente.",
      adId: "ad-1",
    });

    expect(updateTag).not.toHaveBeenCalled();
  });

  test("expires no tags when ownership verification fails", async () => {
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(new Error("Unauthorized"));

    await expect(updateAdStatus("ad-1", "paused")).rejects.toThrow("Unauthorized");

    expect(setAdStatus).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("normalizes a non-Error persistence failure without expiring tags", async () => {
    vi.mocked(setAdStatus).mockRejectedValue("Firestore unavailable");

    await expect(updateAdStatus("ad-1", "paused")).resolves.toMatchObject({
      success: false,
      reason: "technical",
    });

    expect(updateTag).not.toHaveBeenCalled();
  });
});
