import type { ActivityArea, AdvertiserProfileData, AdvertiserProfileRecord } from "@tudomacae/advertiser-identity/model";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
import type { UserCredentials } from "../auth/auth-test-utils";
import { classifiedsFixtureClient, withClassifiedsAdministrator } from "../ads/classifiedsFixtureClient";

type ProfileInput = Pick<AdvertiserProfileRecord, "title" | "description" | "activityAreas"> & Required<Pick<AdvertiserProfileRecord, "contacts">>;
type ClaimableInput = ProfileInput & { activityAreas: ActivityArea[]; sourceUrl: string };
type AdministrationResult = { profileId: string };

/** Creates a profile owned by `owner` through the API Worker. */
export async function createProfileFixture(owner: UserCredentials, input: ProfileInput) {
  const client = await classifiedsFixtureClient(owner);
  return client.write<string>("profiles.create", { ...input, operationId: crypto.randomUUID() });
}

export async function readProfileFixture(owner: UserCredentials, id: string) {
  const client = await classifiedsFixtureClient(owner);
  return client.read<AdvertiserProfileData | null>("profiles.private", { id });
}

export async function listProfileFixtures(owner: UserCredentials) {
  const client = await classifiedsFixtureClient(owner);
  return client.read<AdvertiserProfileData[]>("profiles.forOwner", { userId: owner.uid });
}

export type ClaimableProfileFixture = { id: string };

/** Creates a claimable Business as an administrator, confirming the expected shared-contact duplicates. */
export async function createClaimableProfileFixture(input: ClaimableInput): Promise<ClaimableProfileFixture> {
  return withClassifiedsAdministrator(async (client) => {
    const create = (duplicateConfirmationToken?: string) => client.write<AdministrationResult>("profiles.admin.create", { ...input, idempotencyKey: crypto.randomUUID(), duplicateConfirmationToken });
    const result = await create().catch((error: unknown) => {
      if (!(error instanceof AdvertiserProfileAdministrationError) || error.code !== "possibleDuplicate") throw error;
      return create(String(error.details.confirmationToken));
    });
    return { id: result.profileId };
  });
}
