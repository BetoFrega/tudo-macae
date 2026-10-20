import { beforeEach, expect, test, vi } from "vitest";
import { savePublicationProfile as persistProfile } from "@/integrations/ads/publication";
import { savePublicationProfile } from "./publication";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn(async () => ({ uid: "owner" })) }));
vi.mock("../../../integrations/ads/pendingPublicationTransitions", () => ({ pendingPublicationTransitions: {} }));
vi.mock("@/integrations/ads/publication", async () => {
  const { publicationProfileInput } = await import("@tudomacae/ads/validation");
  return { publicationProfileInput, savePublicationProfile: vi.fn(async () => "profile") };
});

const input = { publicationId: "publication-1", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] };

beforeEach(() => {
  vi.clearAllMocks();
});

test("a new journey profile requires an explicit type", async () => {
  await expect(savePublicationProfile(input)).resolves.toEqual({ success: false, error: "Escolha se este perfil é pessoal ou de um negócio." });
  expect(persistProfile).not.toHaveBeenCalled();

  await expect(savePublicationProfile({ ...input, identityType: "business" })).resolves.toEqual({ success: true, profileId: "profile" });
  expect(persistProfile).toHaveBeenCalledWith("owner", expect.objectContaining({ identityType: "business" }));
});

test("editing the journey profile keeps working without a type", async () => {
  await expect(savePublicationProfile({ ...input, profileId: "profile" })).resolves.toEqual({ success: true, profileId: "profile" });
  expect(persistProfile).toHaveBeenCalledWith("owner", expect.not.objectContaining({ identityType: expect.anything() }));
});
