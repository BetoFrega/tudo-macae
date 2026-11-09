import { ReleaseFlagUnavailable } from "@tudomacae/release-control/posthog";

/**
 * Flagship flags reach the app only through the web Worker's `FLAGS` binding.
 * `vite.vinext.config.ts` replaces this module with `web-worker/flagshipFlag.ts`;
 * any other runtime (Next dev, unit tests) has no binding, so the release stays hidden.
 */
export async function readFlagshipFlag(_flagKey: string): Promise<boolean> {
  throw new ReleaseFlagUnavailable("configuration");
}
