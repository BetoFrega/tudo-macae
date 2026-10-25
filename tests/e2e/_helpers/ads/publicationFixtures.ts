import type { readPublication } from "@/integrations/ads/publication";
import type { CreateAdResult } from "@tudomacae/ads/management";
import type { CreateAdInput, PendingPublicationInput, PublicationProfileInput } from "@tudomacae/ads/validation";
import { workerFixture } from "../../../_helpers/auth/helpers/workerFixture";
import type { UserCredentials } from "../auth/auth-test-utils";
import { classifiedsFixtureClient } from "./classifiedsFixtureClient";

type Publication = NonNullable<Awaited<ReturnType<typeof readPublication>>>;

/** Pending publications and ads written by `owner` through the API Worker. */
export async function savePublicationFixture(owner: UserCredentials, input: PendingPublicationInput) {
  const client = await classifiedsFixtureClient(owner);
  return client.write("publications.save", input);
}

export async function savePublicationProfileFixture(owner: UserCredentials, input: PublicationProfileInput) {
  const client = await classifiedsFixtureClient(owner);
  return client.write<string>("publications.profile", input);
}

export async function readPublicationFixture(owner: UserCredentials, id: string) {
  const client = await classifiedsFixtureClient(owner);
  return client.read<Publication | null>("publications.read", { id });
}

export async function publishPublicationFixture(owner: UserCredentials, id: string) {
  const client = await classifiedsFixtureClient(owner);
  return client.write("publications.publish", { id });
}

export async function createAdRecordFixture(owner: UserCredentials, input: CreateAdInput) {
  const client = await classifiedsFixtureClient(owner);
  return client.write<CreateAdResult>("ads.create", { ...input, id: crypto.randomUUID() });
}

/** Whether a deleted publication queued its photo for the API Worker's scheduled removal. */
export async function photoReleasedFixture(path: string) {
  return (await workerFixture<{ scheduled: boolean }>("/ad-photo-cleanup", { path })).scheduled;
}
