import { workerFixture } from "./workerFixture";
import { registerDisposableEmail } from "./verificationAccounts";
import type { ClaimPatch } from "@tudomacae/authentication/claims";
import { createAuthenticationClient } from "@tudomacae/authentication-client/client";
import { makeTestEmail } from "./makeTestEmail";
import { makeTestPassword } from "./makeTestPassword";

export async function updateTestUserClaims(
  uid: string,
  patch: ClaimPatch,
  administrator: { email: string; password: string },
) {
  const user = await workerFixture<{ uid: string } | null>("/find", { uid });
  if (!user) throw new Error("Fixture account missing");
  const origin = process.env.AUTHENTICATION_API_URL;
  if (!origin || new URL(origin).hostname !== "127.0.0.1")
    throw new Error("Fixture must use loopback");
  const client = createAuthenticationClient({
    origin,
    publicOrigin: process.env.PUBLIC_APP_ORIGIN ?? "",
    allowLocal: true,
  });
  const response = await client.request("/api/auth/sign-in/email", {
    body: administrator,
  });
  const credential = client.sessionCredential(response);
  if (!response.ok || !credential)
    throw new Error("Worker rejected the fixture administrator login");
  await client.procedure("updateRoles", { uid, patch }, credential, true);
}

export const registerTestUser = async ({
  claims = {},
  emailVerified = false,
  migrated = false,
}: {
  claims?: ClaimPatch;
  emailVerified?: boolean;
  migrated?: boolean;
} = {}) => {
  const userCredential = {
    email: makeTestEmail(),
    password: makeTestPassword(),
    uid: "",
  };
  const user = await workerFixture<{ uid: string }>("/create", {
    ...userCredential,
    claims,
    emailVerified,
    migrated,
  });
  userCredential.uid = user.uid;
  registerDisposableEmail(userCredential.email);

  return userCredential;
};

/**
 * Deletes whoever registered under this email, along with everything they
 * created, if they exist. Used to clean up after a test that registers through
 * the browser, where the uid is not known up front.
 */
export const deleteUserByEmail = async (email: string) => {
  const user = await workerFixture<{ uid: string } | null>("/find", {
    email,
  });
  if (user) await deleteUser(user.uid);
};

/**
 * Deletes a user along with the ads and advertiser profiles they own, so a
 * fixture leaves nothing behind for the other workers sharing the fixture.
 */
export const deleteUser = async (uid: string) => {
  await workerFixture("/delete", { uid });
};
