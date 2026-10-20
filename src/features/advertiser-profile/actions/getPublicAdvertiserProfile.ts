"use server";

import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { cacheTag } from "next/cache";
import type { PublicAdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { getPublicAdvertiserProfileUseCase } from "@/packages/classifieds-api";

function reportPublicReadFailure(details: Record<string, unknown>) {
  console.error(JSON.stringify({ event: "advertiser_profile.public_read.failed", service: process.env.K_SERVICE ?? "next",
    environment: process.env.NODE_ENV, release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    route: "server-action:advertiser-profile.public-read", ...details }));
}

export async function getPublicAdvertiserProfile(
  profileId: string,
): Promise<PublicAdvertiserProfileData | null> {
  "use cache";
  cacheTag(`advertiser-profile-${profileId}`);

  try {
    return await getPublicAdvertiserProfileUseCase({ id: profileId });
  }
  catch (error) {
    if (error instanceof ClassifiedsRequestError) {
      if (!error.serverReportedFailure) reportPublicReadFailure({ outcome: "authority_failure", requestId: error.requestId, cause: error.code });
      throw error;
    }
    reportPublicReadFailure({ outcome: "unexpected_failure", operationId: crypto.randomUUID(),
      cause: error instanceof Error ? error.name : "UnknownError" });
    return null;
  }
}
