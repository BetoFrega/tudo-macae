interface FlagshipBinding {
  getBooleanDetails(flagKey: string, defaultValue: boolean): Promise<{ value: boolean; errorCode?: string }>;
}

/** Same Flagship flag the web Worker reads; a missing binding or an evaluation error keeps new claims closed. */
export async function businessClaimReleased(flags: FlagshipBinding | undefined): Promise<boolean> {
  if (!flags) return false;
  const details = await flags.getBooleanDetails("business-claim", false);
  return !details.errorCode && details.value === true;
}
