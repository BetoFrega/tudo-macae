import { ReleaseFlagUnavailable } from "@tudomacae/release-control/posthog";

export interface FlagshipBinding {
  getBooleanDetails(flagKey: string, defaultValue: boolean): Promise<{ value: boolean; errorCode?: string }>;
}

/** A missing binding or an evaluation error (unknown flag, type mismatch, timeout) is reported, never served. */
export async function evaluateFlagshipFlag(flags: FlagshipBinding | undefined, flagKey: string): Promise<boolean> {
  if (!flags) throw new ReleaseFlagUnavailable("configuration");
  let details: Awaited<ReturnType<FlagshipBinding["getBooleanDetails"]>>;
  try {
    details = await flags.getBooleanDetails(flagKey, false);
  }
  catch (error) {
    throw new ReleaseFlagUnavailable("network", undefined, { cause: error });
  }
  if (details.errorCode) throw new ReleaseFlagUnavailable("evaluation", undefined, { cause: new Error(details.errorCode) });
  return details.value;
}
