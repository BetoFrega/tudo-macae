import { configuredAuthenticationClient } from "@tudomacae/authentication-client/server";

export async function resolveSession(cookie?: string) {
  if (!cookie) return { status: "missing" as const };
  return configuredAuthenticationClient().session(cookie);
}
