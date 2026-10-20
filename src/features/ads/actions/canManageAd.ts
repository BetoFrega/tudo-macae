"use server";

import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { verifyAdOwnershipUseCase } from "@/integrations/ads/use-cases/verifyAdOwnershipUseCase";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { authenticationRequestId } from "@tudomacae/authentication/diagnostics";
import { requestCorrelationId } from "@tudomacae/www-origin-routing/contract";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";

export async function canManageAd(adId: string): Promise<{ status: "allowed" | "denied" | "unavailable" }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: "denied" };

    await verifyAdOwnershipUseCase({
      id: adId,
      userId: user.uid,
      isAdmin: user.isAdmin,
    });
    return { status: "allowed" };
  }
  catch (error) {
    // A denied or missing ad should hide the controls; infrastructure failures
    // are still recorded without logging session or ad data.
    if (isDenial(error)) return { status: "denied" };
    if (error instanceof ClassifiedsRequestError && error.serverReportedFailure) return { status: "unavailable" };
    logPermissionFailure(error);
    return { status: "unavailable" };
  }
}

function isDenial(error: unknown): boolean {
  if (error instanceof AdOperationError && (error.code === "forbidden" || error.code === "not-found")) return true;
  if (error instanceof ClassifiedsRequestError && error.code === "forbidden") return true;
  return error instanceof Error && (error.message.startsWith("Unauthorized") || error.message === "Ad not found");
}

function logPermissionFailure(error: unknown) {
  const correlationId = requestCorrelationId(stringProperty(error, "authenticationCorrelationId"));
  console.error(JSON.stringify({
    event: "ad-management-permission",
    outcome: "failed",
    service: process.env.K_SERVICE ?? "next",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    route: "server-action:ad-management-permission",
    cause: failureCause(error),
    ...failureReference(error),
    ...(correlationId ? { correlationId } : {}),
  }));
}

function failureCause(error: unknown) {
  if (error instanceof ClassifiedsRequestError) return error.code;
  return error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unexpected";
}

function failureReference(error: unknown) {
  if (error instanceof ClassifiedsRequestError) return { requestId: error.requestId };
  const requestId = authenticationRequestId(stringProperty(error, "authenticationRequestId"));
  return requestId ? { requestId } : { operationId: crypto.randomUUID() };
}

function stringProperty(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== "object" || !(key in error)) return undefined;
  const value: unknown = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
