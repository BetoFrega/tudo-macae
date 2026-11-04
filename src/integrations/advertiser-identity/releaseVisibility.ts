import { cache } from "react";
import { headers } from "next/headers";
import { edgeRequestIdHeader, requestCorrelationId } from "@tudomacae/www-origin-routing/contract";
import { connection } from "next/server";
import { createPostHogFlagReader, ReleaseFlagUnavailable } from "@tudomacae/release-control/posthog";

/** Only an explicit boolean `true` exposes the release; every other outcome keeps it hidden. */
export async function resolveReleaseVisibility(evaluate: () => Promise<unknown>, report: (error: unknown) => void) {
  try {
    return await evaluate() === true;
  }
  catch (error) {
    report(error);
    return false;
  }
}

const readFlag = createPostHogFlagReader({
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  projectToken: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
  decisionTtlMs: 30_000,
  fetch: (...args) => fetch(...args),
});

/** One decision per server render keeps every surface of a release consistent. */
export function createReleaseVisibility({ flagKey, event, context }: { flagKey: string; event: string; context: string }) {
  let nextFailureReportAt = 0;
  return cache(async () => {
    await connection();
    const requestHeaders = await headers();
    const correlationId = requestCorrelationId(requestHeaders.get(edgeRequestIdHeader));
    return resolveReleaseVisibility(() => readFlag(flagKey), (error) => {
      const now = Date.now();
      if (now < nextFailureReportAt) return;
      nextFailureReportAt = now + 30_000;
      console.warn(JSON.stringify({
        severity: "WARNING", event,
        service: process.env.K_SERVICE ?? "next",
        environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
        release: process.env.K_REVISION ?? process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
        context,
        ...(correlationId ? { correlationId } : {}),
        flag: flagKey, outcome: "fallback",
        failure: error instanceof ReleaseFlagUnavailable ? error.category : "unknown",
        ...(error instanceof ReleaseFlagUnavailable && error.status ? { status: error.status } : {}),
      }));
    });
  });
}
