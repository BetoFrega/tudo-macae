import type { ClaimPatch } from "@tudomacae/authentication/claims";
import { createAuthenticationClient } from "@tudomacae/authentication-client/client";
import { updateTestUserClaims } from "./authentication";
import { makeTestEmail } from "./makeTestEmail";
import { makeTestPassword } from "./makeTestPassword";
import { networkFetch, workerFixture } from "./workerFixture";

export type WorkerAccount = { uid: string; email: string; password: string };

/** A verified API Worker account, without the Firestore advertiser profile `registerTestUser` adds. */
export async function createWorkerAccount(claims: ClaimPatch = {}): Promise<WorkerAccount> {
  const account = { email: makeTestEmail(), password: makeTestPassword() };
  const { uid } = await workerFixture<{ uid: string }>("/create", { ...account, claims, emailVerified: true });
  return { ...account, uid };
}

/** The session credential the app stores in its `session` cookie. */
export async function signInWorkerAccount(account: Pick<WorkerAccount, "email" | "password">) {
  const origin = process.env.AUTHENTICATION_API_URL;
  if (!origin || new URL(origin).hostname !== "127.0.0.1")
    throw new Error("Fixture must use loopback");
  const client = createAuthenticationClient({
    origin,
    publicOrigin: process.env.PUBLIC_APP_ORIGIN ?? "",
    allowLocal: true,
    request: networkFetch,
  });
  const response = await client.request("/api/auth/sign-in/email", { body: account });
  const credential = client.sessionCredential(response);
  if (!response.ok || !credential)
    throw new Error("Worker rejected the fixture login");
  return credential;
}

/** Changes roles through the production `updateRoles` procedure, as an administrator would. */
export async function updateWorkerRoles(uid: string, patch: ClaimPatch) {
  const administrator = await createWorkerAccount({ admin: true });
  try {
    await updateTestUserClaims(uid, patch, administrator);
  }
  finally {
    await deleteWorkerAccount(administrator.uid);
  }
}

export async function deleteWorkerAccount(uid: string) {
  await workerFixture("/delete", { uid });
}
