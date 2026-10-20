import { AdvertiserProfileAccessError } from "@tudomacae/advertiser-identity/profiles";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { getUserAdvertiserProfilesUseCase, verifyAdvertiserProfileOwnershipUseCase } from "@/packages/classifieds-api";
import { createAdUseCase } from "../../../integrations/ads/use-cases/createAdUseCase";
import { createAd } from "./createAd";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/packages/classifieds-api", () => ({
  getUserAdvertiserProfilesUseCase: vi.fn(),
  verifyAdvertiserProfileOwnershipUseCase: vi.fn(),
}));

vi.mock("../../../integrations/ads/use-cases/createAdUseCase", () => ({
  createAdUseCase: vi.fn(),
}));

function adFormData() {
  const formData = new FormData();
  formData.append("categoryId", "category-1");
  formData.append("subcategoryId", "subcategory-1");
  formData.append("advertiserProfileId", "profile-1");
  formData.append("title", "Bicicleta seminova");
  formData.append("text", "Bicicleta revisada e em bom estado.");
  return formData;
}

function listingTagCalls() {
  return vi.mocked(updateTag).mock.calls.map(([tag]) => tag)
    .filter(tag => tag.startsWith("ads-category-") || tag.startsWith("ads-subcategory-"));
}

describe("createAd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      uid: "user-1",
      email: "pessoa@example.com",
      emailVerified: true,
      isAdmin: false,
      isEditor: false,
    });
    vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockResolvedValue({ id: "profile-1", userId: "user-1", title: "Perfil", description: "", createdAt: 1, updatedAt: 1 });
    vi.mocked(getUserAdvertiserProfilesUseCase).mockResolvedValue([]);
    vi.mocked(createAdUseCase).mockResolvedValue({
      id: "ad-1",
      slug: "bicicleta-seminova",
    });
  });

  test("keeps the successful creation result and invalidation", async () => {
    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: true,
      adId: "ad-1",
      slug: "bicicleta-seminova",
    });
    expect(createAdUseCase).toHaveBeenCalledWith({
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
      advertiserProfileId: "profile-1",
      title: "Bicicleta seminova",
      text: "Bicicleta revisada e em bom estado.",
      userId: "user-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledWith("ads-by-profile-profile-1");
    expect(listingTagCalls()).toEqual([
      "ads-category-category-1",
      "ads-subcategory-subcategory-1",
    ]);
  });

  test.each(["categoryId", "subcategoryId"])(
    "refuses a submission without %s",
    async (field) => {
      const incomplete = adFormData();
      incomplete.delete(field);

      await expect(createAd(incomplete)).resolves.toEqual({
        success: false,
        error: "Preencha os campos obrigatórios do anúncio.",
      });
      expect(updateTag).not.toHaveBeenCalled();
    },
  );

  test("uses the person's first advertiser profile when none was selected", async () => {
    const formData = adFormData();
    formData.delete("advertiserProfileId");
    vi.mocked(getUserAdvertiserProfilesUseCase).mockResolvedValueOnce([{
      id: "profile-default",
      userId: "user-1",
      title: "Perfil principal",
      description: "",
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }]);

    await expect(createAd(formData)).resolves.toMatchObject({ success: true });
    expect(createAdUseCase).toHaveBeenCalledWith(expect.objectContaining({
      advertiserProfileId: "profile-default",
    }));
    expect(verifyAdvertiserProfileOwnershipUseCase).not.toHaveBeenCalled();
  });

  test("returns an intentional refusal when no advertiser profile exists", async () => {
    const formData = adFormData();
    formData.delete("advertiserProfileId");

    await expect(createAd(formData)).resolves.toEqual({
      success: false,
      error: "Não foi possível encontrar um perfil de anunciante para publicar o anúncio.",
    });
    expect(createAdUseCase).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("refuses direct creation with a claimable profile before creating an ad", async () => {
    vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockRejectedValue(new AdvertiserProfileAccessError("forbidden"));

    await expect(createAd(adFormData())).resolves.toEqual({
      success: false,
      error: "Você não tem permissão para publicar neste perfil de anunciante.",
    });
    expect(createAdUseCase).not.toHaveBeenCalled();
  });

  test("returns intentional refusals for expected authentication and input failures", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    await expect(createAd(adFormData())).resolves.toEqual({
      success: false,
      error: "Entre na sua conta para publicar um anúncio.",
    });

    const incomplete = adFormData();
    incomplete.delete("title");
    await expect(createAd(incomplete)).resolves.toEqual({
      success: false,
      error: "Preencha os campos obrigatórios do anúncio.",
    });

    vi.mocked(verifyAdvertiserProfileOwnershipUseCase).mockRejectedValueOnce(new AdvertiserProfileAccessError("forbidden"));
    await expect(createAd(adFormData())).resolves.toEqual({
      success: false,
      error: "Você não tem permissão para publicar neste perfil de anunciante.",
    });
    expect(createAdUseCase).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  test("logs an unexpected creation failure and returns only generic copy", async () => {
    const technicalError = new Error("firestore credential and provider detail");
    vi.mocked(createAdUseCase).mockRejectedValue(technicalError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createAd(adFormData());

    expect(consoleError).toHaveBeenCalledWith("Error creating ad:", technicalError);
    expect(result).toEqual({
      success: false,
      error: "Não foi possível criar o anúncio.",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
