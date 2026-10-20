import { cookies } from "next/headers";
import { configuredAuthenticationClient } from "@tudomacae/authentication-client/server";
import { allowsTestAffordances } from "@/lib/appEnv";
export async function authenticationCredential() {
  return (await cookies()).get("session")?.value;
}
export async function installWorkerSession(credential: string) {
  const resolution = await configuredAuthenticationClient().session(credential);
  if (resolution.status !== "valid") return { success: false as const };
  const store = await cookies();
  store.set("session", credential, {
    httpOnly: true,
    secure: !allowsTestAffordances(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 5,
  });
  store.delete("verification-refresh");
  return { success: true as const, uid: resolution.user.uid };
}
export async function workerProcedure<T>(
  name: string,
  input: unknown,
  mutation = false,
): Promise<T> {
  return (await configuredAuthenticationClient().procedure(
    name,
    input,
    await authenticationCredential(),
    mutation,
  )) as T;
}
