import { beforeEach, expect, test, vi } from "vitest";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { AdvertiserProfileAccessError } from "@tudomacae/advertiser-identity/profiles";
import { AdOperationError } from "@tudomacae/ads/operationError";
const reads = vi.hoisted(() => ({ user: vi.fn(), publications: vi.fn(), profiles: vi.fn() }));
vi.mock("./actions/getCurrentUser", () => ({ getCurrentUser: reads.user }));
vi.mock("@/integrations/authentication/verification", () => ({ readEmailVerification: vi.fn() }));
vi.mock("@/integrations/ads/publication", () => ({ listPublications: reads.publications, readPublication: vi.fn() }));
vi.mock("@/integrations/ads/use-cases/verifyAdOwnershipUseCase", () => ({ verifyAdOwnershipUseCase: vi.fn() }));
vi.mock("@/packages/classifieds-api", async () => ({
  ...await vi.importActual("@tudomacae/advertiser-identity/profiles"), getUserAdvertiserProfilesUseCase: reads.profiles,
}));
import { readAccountReminder } from "./emailVerificationReads";
beforeEach(() => {
  vi.resetAllMocks();
  reads.user.mockResolvedValue({ uid: "owner", emailVerified: true });
});
test.each([
  new ClassifiedsRequestError("forbidden", crypto.randomUUID()),
  new AdvertiserProfileAccessError("forbidden"),
  new AdOperationError("forbidden", "Unauthorized"),
])("revoked authorization removes the reminder without a false dependency failure", async (error) => {
  reads.publications.mockRejectedValueOnce(error);
  expect(await readAccountReminder()).toBeNull();
  expect(reads.profiles).not.toHaveBeenCalled();
});
test("a qualified dependency failure remains visible to the HTTP boundary", async () => {
  const failure = new ClassifiedsRequestError("unavailable", crypto.randomUUID());
  reads.publications.mockRejectedValueOnce(failure);
  await expect(readAccountReminder()).rejects.toBe(failure);
});
test("the reminder checks contacts from the same selected authority as its pending ad", async () => {
  reads.publications.mockResolvedValueOnce([{ advertiserProfileId: "profile" }]);
  reads.profiles.mockResolvedValueOnce([{ id: "profile", title: "Anunciante", contacts: [{ number: "22999999999" }] }]);
  expect(await readAccountReminder()).toMatchObject({ href: "/minha-conta/anuncios?filter=pending" });
  expect(reads.profiles).toHaveBeenCalledWith("owner");
});
