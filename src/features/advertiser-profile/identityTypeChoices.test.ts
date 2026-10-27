import { beforeEach, expect, test, vi } from "vitest";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { getUserAdvertiserProfilesUseCase } from "@/packages/classifieds-api";
import { identityTypeChoices } from "./identityTypeChoices";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/packages/classifieds-api", () => ({ getUserAdvertiserProfilesUseCase: vi.fn() }));

function ownedProfiles(...profiles: Pick<AdvertiserProfileData, "id" | "identityType">[]) {
  vi.mocked(getUserAdvertiserProfilesUseCase).mockResolvedValue(profiles.map(profile => ({ title: profile.id, ...profile })) as AdvertiserProfileData[]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "owner" } as Awaited<ReturnType<typeof getCurrentUser>>);
});

test("a second personal profile is unavailable when the owner already has one", async () => {
  ownedProfiles({ id: "personal-1", identityType: "personal" }, { id: "business-1", identityType: "business" });

  await expect(identityTypeChoices()).resolves.toEqual({ personalAvailable: false });
  await expect(identityTypeChoices({ id: "business-1" })).resolves.toEqual({ personalAvailable: false });
  expect(getUserAdvertiserProfilesUseCase).toHaveBeenCalledWith("owner");
});

test("the owner's personal profile can keep its own type", async () => {
  ownedProfiles({ id: "personal-1", identityType: "personal" });

  await expect(identityTypeChoices({ id: "personal-1" })).resolves.toEqual({ personalAvailable: true });
});

test("the personal type is available while the owner has no personal profile", async () => {
  ownedProfiles();
  await expect(identityTypeChoices()).resolves.toEqual({ personalAvailable: true });

  ownedProfiles({ id: "business-1", identityType: "business" }, { id: "untyped-1" });
  await expect(identityTypeChoices()).resolves.toEqual({ personalAvailable: true });
});
