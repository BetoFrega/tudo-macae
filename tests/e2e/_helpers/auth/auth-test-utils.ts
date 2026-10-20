/** biome-ignore-all lint/correctness/noEmptyPattern: Playwright Fixtures require object descructuring, even when empty */
import { registerDisposableEmail } from "../../../_helpers/auth/helpers/verificationAccounts";
import test from "@playwright/test";
import type { ClaimPatch } from "@tudomacae/authentication/claims";
import {
  deleteUser,
  deleteUserByEmail,
  installUserSession,
  loginUser,
  registerTestUser,
} from "./helpers/authentication";
import { makeTestEmail } from "../../../_helpers/auth/helpers/makeTestEmail";
import { makeTestPassword } from "../../../_helpers/auth/helpers/makeTestPassword";
import { LoginPage } from "./POMs/LoginPage";
import { RegistrationPage } from "./POMs/RegistrationPage";

export type UserCredentials = {
  email: string;
  password: string;
  uid: string;
};

/**
 * Credentials for an account that does not exist yet — the test itself
 * registers it through the browser, so there is no uid to hand out up front.
 */
export type UnregisteredCredentials = {
  email: string;
  password: string;
};

export const authTest = test.extend<{
  loginPage: LoginPage;
  registrationPage: RegistrationPage;

  // authentication helpers
  authentication: {
    login: (credentials: { email: string; password: string }) => Promise<void>;
  };

  /**
   * A brand-new user, signed in, with `claims` already in force in the session.
   *
   * Claims travel inside the session cookie: it is minted from the ID token at
   * login and `getCurrentUser` reads them back out of it, so granting a claim
   * leaves an already-open session exactly as it was — the user reaches the new
   * area only after signing in again. Assembling that by hand in a test is easy
   * to get subtly wrong, and the failure looks like flakiness rather than a
   * missing step.
   *
   * Hence the order: create, grant, *then* install the resulting session. A
   * test that needs an editor asks for one and starts from the state it means
   * to test. Journeys that verify login itself use `authentication.login`;
   * fixture setup does not exercise the application's Server Action. Every
   * user it creates is deleted when the test ends.
   *
   * One session at a time: each call signs in on the same `page`, so a second
   * call replaces the first user's session rather than running alongside it.
   * To have two roles act on the same journey, hand each its own browser
   * context.
   */
  userWithClaims: (claims: ClaimPatch) => Promise<UserCredentials>;

  // test users
  userCredentials: UserCredentials;
  verifiedUserCredentials: UserCredentials;
  anotherUserCredentials: UserCredentials;
  adminUserCredentials: UserCredentials;
  anotherAdminUserCredentials: UserCredentials;
  unregisteredCredentials: UnregisteredCredentials;
}>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registrationPage: async ({ page }, use) => {
    await use(new RegistrationPage(page));
  },
  authentication: async ({ page }, use) => {
    await use({
      login: async (credentials: { email: string; password: string }) => {
        await loginUser(page, credentials);
      },
    });
  },
  userWithClaims: async ({ page }, use) => {
    const created: string[] = [];

    await use(async (claims) => {
      const credentials = await registerTestUser({ claims });
      // Recorded before session setup, which has its own timeout: the user
      // exists from here on, so a setup that never lands must still leave one
      // to clean up rather than a stray account in the emulator.
      created.push(credentials.uid);
      await installUserSession(page, credentials);
      return credentials;
    });

    for (const uid of created) {
      await deleteUser(uid);
    }
  },
  verifiedUserCredentials: async ({}, use) => {
    const credentials = await registerTestUser({ emailVerified: true });
    await use(credentials);
    await deleteUser(credentials.uid);
  },
  userCredentials: async ({}, use) => {
    const credentials = await registerTestUser();
    await use(credentials);
    await deleteUser(credentials.uid);
  },
  anotherUserCredentials: async ({}, use) => {
    const credentials = await registerTestUser();
    await use(credentials);
    await deleteUser(credentials.uid);
  },
  adminUserCredentials: async ({}, use) => {
    const credentials = await registerTestUser({ claims: { admin: true } });
    await use(credentials);
    await deleteUser(credentials.uid);
  },
  anotherAdminUserCredentials: async ({}, use) => {
    const credentials = await registerTestUser({ claims: { admin: true } });
    await use(credentials);
    await deleteUser(credentials.uid);
  },
  unregisteredCredentials: async ({}, use) => {
    const credentials = {
      email: makeTestEmail(),
      password: makeTestPassword(),
    };
    registerDisposableEmail(credentials.email);
    await use(credentials);
    await deleteUserByEmail(credentials.email);
  },
});
