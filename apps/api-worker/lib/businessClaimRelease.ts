interface FlagshipBinding {
  getBooleanDetails(flagKey: string, defaultValue: boolean): Promise<{ value: boolean; errorCode?: string }>;
}

/** Same Flagship flag the web Worker reads; a missing binding or an evaluation error keeps new claims closed. */
export async function businessClaimReleased(flags: FlagshipBinding | undefined): Promise<boolean> {
  if (!flags) return false;
  const details = await flags.getBooleanDetails("business-claim", false);
  return !details.errorCode && details.value === true;
}

/** Invitations link to the claim page, so they go out only while claims are released too. */
export async function businessInvitationsReleased(flags: FlagshipBinding | undefined): Promise<boolean> {
  if (!flags || !(await businessClaimReleased(flags))) return false;
  const details = await flags.getBooleanDetails("business-invitation-email", false);
  return !details.errorCode && details.value === true;
}
