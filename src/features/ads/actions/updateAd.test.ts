import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { updateAdUseCase } from "../../../integrations/ads/use-cases/updateAdUseCase";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";
import { updateAd } from "./updateAd";
import { PublicationRequirementError } from "@tudomacae/ads/publicationEligibility";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../../integrations/ads/use-cases/updateAdUseCase", () => ({ updateAdUseCase: vi.fn() }));
vi.mock("../../../integrations/ads/use-cases/verifyAdOwnershipUseCase", () => ({
  verifyAdOwnershipUseCase: vi.fn(),
}));

function adFormData() {
  const formData = new FormData();
  formData.append("categoryId", "category-1");
  formData.append("subcategoryId", "subcategory-1");
  formData.append("title", "Bicicleta revisada");
  formData.append("text", "Bicicleta revisada nesta semana.");
  formData.append("status", "active");
  formData.append("advertiserProfileId", "profile-2");
  formData.append("images", "[]");
  return formData;
}

function listingTagCalls() {
  return vi.mocked(updateTag).mock.calls
    .map(([tag]) => tag)
    .filter(tag => tag.startsWith("ads-category-") || tag.startsWith("ads-subcategory-"));
}

describe("updateAd", () => {
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
      status: "paused",
      images: [],
      createdAt: 1700000000000,
    });
    vi.mocked(updateAdUseCase).mockResolvedValue({
      slug: "bicicleta-revisada",
    });
  });

  test("keeps the successful update result and invalidation", async () => {
    const result = await updateAd("ad-1", adFormData());

    expect(result).toEqual({ success: true, slug: "bicicleta-revisada" });
    expect(verifyAdOwnershipUseCase).toHaveBeenCalledWith({
      id: "ad-1",
      userId: "user-1",
      isAdmin: false,
    });
    expect(updateAdUseCase).toHaveBeenCalledWith({
      id: "ad-1",
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
      title: "Bicicleta revisada",
      text: "Bicicleta revisada nesta semana.",
      advertiserProfileId: "profile-2",
      status: "active",
      images: [],
      observedImageIds: [],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/anuncio/ad-1");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/anuncio/ad-1/bicicleta-revisada",
    );
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledWith("ad-ad-1");
    expect(updateTag).toHaveBeenCalledWith("ads-by-profile-profile-1");
    expect(updateTag).toHaveBeenCalledWith("ads-by-profile-profile-2");
    expect(listingTagCalls()).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test("expires the distinct union after category and subcategory changes", async () => {
    const formData = adFormData();
    formData.set("categoryId", "category-2");
    formData.set("subcategoryId", "subcategory-2");

    await updateAd("ad-1", formData);

    expect(listingTagCalls()).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
      "ads-category-category-2",
      "ads-subcategory-subcategory-2",
    ]);
  });

  test("expires both subcategories and one parent after only subcategory changes", async () => {
    const formData = adFormData();
    formData.set("subcategoryId", "subcategory-2");

    await updateAd("ad-1", formData);

    expect(listingTagCalls()).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
      "ads-subcategory-subcategory-2",
    ]);
  });

  test("expires both categories and one subcategory after only category changes", async () => {
    const formData = adFormData();
    formData.set("categoryId", "category-2");

    await updateAd("ad-1", formData);

    expect(listingTagCalls()).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
      "ads-category-category-2",
    ]);
  });

  test.each(["categoryId", "subcategoryId"])(
    "refuses an update without %s",
    async (field) => {
      const incomplete = adFormData();
      incomplete.delete(field);

      await expect(updateAd("ad-1", incomplete)).resolves.toEqual({
        success: false,
        error: "Preencha os campos obrigatórios do anúncio.",
      });
      expect(listingTagCalls()).toEqual([]);
    },
  );

  test("returns intentional refusals for expected authentication and input failures", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    await expect(updateAd("ad-1", adFormData())).resolves.toEqual({
      success: false,
      error: "Entre na sua conta para atualizar o anúncio.",
    });

    const incomplete = adFormData();
    incomplete.delete("title");
    await expect(updateAd("ad-1", incomplete)).resolves.toEqual({
      success: false,
      error: "Preencha os campos obrigatórios do anúncio.",
    });
    expect(listingTagCalls()).toEqual([]);
  });

  test("returns a profile recovery tied to the edited Ad", async () => {
    vi.mocked(updateAdUseCase).mockRejectedValue(
      new PublicationRequirementError("profile", ["title", "contact"]),
    );

    await expect(updateAd("ad-1", adFormData())).resolves.toEqual({
      success: false,
      reason: "profile",
      error: "Complete o nome e um contato válido no perfil antes de ativar o anúncio.",
      adId: "ad-1",
      advertiserProfileId: "profile-2",
    });
  });

  test("returns an email recovery tied to the edited Ad", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "user-1",
      email: "pessoa@example.com",
      emailVerified: false,
      isAdmin: false,
      isEditor: false,
    });

    await expect(updateAd("ad-1", adFormData())).resolves.toEqual({
      success: false,
      reason: "email",
      error: "Confirme seu e-mail antes de reativar o anúncio.",
      adId: "ad-1",
    });
    expect(updateAdUseCase).not.toHaveBeenCalled();
  });

  test("logs an ownership or update failure and returns only generic copy", async () => {
    const technicalError = new Error("Unauthorized: internal ownership detail");
    vi.mocked(verifyAdOwnershipUseCase).mockRejectedValue(technicalError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updateAd("ad-1", adFormData());

    expect(consoleError).toHaveBeenCalledWith("Error updating ad:", technicalError);
    expect(result).toEqual({
      success: false,
      reason: "technical",
      error: "Não foi possível atualizar o anúncio. Tente novamente.",
      adId: "ad-1",
    });
    expect(updateAdUseCase).not.toHaveBeenCalled();
    expect(listingTagCalls()).toEqual([]);
  });
});
