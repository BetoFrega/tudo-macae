import { cache } from "react";
import { createPostHogFlagReader, ReleaseFlagUnavailable } from "@tudomacae/release-control/posthog";

export const authenticationRenderSessionSharingFlag = "authentication-render-session-sharing";

type RenderCache = <T extends (...args: never[]) => unknown>(fn: T) => T;

/** Returns the latest bounded flag decision and refreshes stale state in the background. */
export function createRenderFlagSnapshot(dependencies: {
  evaluate: () => Promise<boolean>;
  refreshIntervalMs: number;
  now?: () => number;
  onFailure?: (error: unknown) => void;
}) {
  const now = dependencies.now ?? Date.now;
  let enabled = false;
  let expiresAt = 0;
  let nextRefreshAt = 0;
  let pending = false;
  let failureReported = false;

  return {
    read() {
      const currentTime = now();
      if (currentTime >= expiresAt) enabled = false;
      if (!pending && currentTime >= nextRefreshAt) {
        pending = true;
        nextRefreshAt = currentTime + dependencies.refreshIntervalMs;
        void Promise.resolve()
          .then(dependencies.evaluate)
          .then((decision) => {
            enabled = decision;
            expiresAt = now() + dependencies.refreshIntervalMs;
            failureReported = false;
            pending = false;
          }, (error: unknown) => {
            enabled = false;
            expiresAt = now() + dependencies.refreshIntervalMs;
            nextRefreshAt = expiresAt;
            pending = false;
            if (!failureReported) {
              failureReported = true;
              try {
                dependencies.onFailure?.(error);
              }
              catch {
                // Flag diagnostics must not change the session result.
              }
            }
          });
      }
      return enabled;
    },
  };
}

/** The injected cache is React's render-scoped cache in production. */
export function createRenderSessionReader<T>(dependencies: {
  cache: RenderCache;
  resolve: () => Promise<T>;
  sharingEnabled: () => boolean | Promise<boolean>;
  onSharingFailure?: (error: unknown) => void;
}) {
  const enabledForRender = dependencies.cache(async () => {
    try {
      return await dependencies.sharingEnabled();
    }
    catch (error) {
      try {
        dependencies.onSharingFailure?.(error);
      }
      catch {
        // Flag diagnostics must not change the session result.
      }
      return false;
    }
  });
  const sharedSessionForRender = dependencies.cache(dependencies.resolve);

  return async () => await enabledForRender()
    ? sharedSessionForRender()
    : dependencies.resolve();
}

const evaluateFlag = createPostHogFlagReader({
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  projectToken: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
  fetch: (...args) => fetch(...args),
});

function reportFlagFallback(error: unknown) {
  const unavailable = error instanceof ReleaseFlagUnavailable ? error : undefined;
  console.warn(JSON.stringify({
    severity: "WARNING",
    event: "authentication_render_session_flag",
    service: process.env.K_SERVICE ?? "next",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.K_REVISION ?? process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
    context: "authentication-session-reader",
    flag: authenticationRenderSessionSharingFlag,
    outcome: "fallback",
    failure: unavailable?.category ?? "unknown",
    ...(unavailable?.status === undefined ? {} : { status: unavailable.status }),
  }));
}

const flagSnapshot = createRenderFlagSnapshot({
  evaluate: () => evaluateFlag(authenticationRenderSessionSharingFlag),
  refreshIntervalMs: 60_000,
  onFailure: reportFlagFallback,
});

function sharingEnabled() {
  return flagSnapshot.read();
}

async function resolveCurrentUser() {
  const { cookies } = await import("next/headers");
  const { resolveSession } = await import("./session");
  const cookieStore = await cookies();
  const session = await resolveSession(cookieStore.get("session")?.value);
  return session.status === "valid" ? session.user : null;
}

const readSessionForRender = createRenderSessionReader({
  cache,
  resolve: resolveCurrentUser,
  sharingEnabled,
});

export async function readCurrentUserForRender() {
  const { cookies } = await import("next/headers");
  // Cookie access establishes request-time execution before the flag reads the clock.
  await cookies();
  return readSessionForRender();
}
