import { createClassifiedsClient } from "@tudomacae/classifieds-client/client";
import { workerFixture } from "../../../_helpers/auth/helpers/workerFixture";
import type { UserCredentials } from "../auth/auth-test-utils";
import type { BrowserContext } from "@playwright/test";
import { createWorkerAccount, deleteWorkerAccount } from "../../../_helpers/auth/helpers/workerSession";
const sessions = new WeakMap<UserCredentials, ReturnType<typeof authenticatedFixtureClient>>();
export async function classifiedsFixtureClient(credentials: UserCredentials) {
  let session = sessions.get(credentials);
  if (!session) {
    session = authenticatedFixtureClient(credentials);
    sessions.set(credentials, session);
  }
  return session;
}
async function authenticatedFixtureClient(credentials: UserCredentials) {
  await workerFixture("/find", { uid: credentials.uid });
  const origin = process.env.AUTHENTICATION_API_URL!;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN!;
  const login = await fetch(new URL("/api/auth/sign-in/email", origin), { method: "POST", headers: { "content-type": "application/json", "origin": publicOrigin }, body: JSON.stringify({ email: credentials.email, password: credentials.password }) });
  if (!login.ok) throw new Error("Fixture login failed");
  const cookie = login.headers.getSetCookie().find(value => value.startsWith("session="))?.split(";")[0]?.slice("session=".length);
  if (!cookie) throw new Error("Fixture session missing");
  const client = createClassifiedsClient({ origin, publicOrigin, allowLocal: true });
  const credential = { session: decodeURIComponent(cookie) };
  return {
    // Fixture contexts share the real login instead of consuming another attempt.
    installSession: (context: BrowserContext, origin: string) => context.addCookies([{ name: "session", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]),
    read: <T>(...args: Parameters<typeof client.read>) => client.read<T>(args[0], args[1], credential),
    write: <T>(...args: Parameters<typeof client.write>) => client.write<T>(args[0], args[1], credential),
  };
}
/** Runs administrator-only writes, such as claimable profiles, with a disposable administrator account. */
export async function withClassifiedsAdministrator<T>(write: (client: ClassifiedsFixtureClient) => Promise<T>) {
  const administrator = await createWorkerAccount({ admin: true });
  try {
    return await write(await classifiedsFixtureClient(administrator));
  }
  finally {
    await deleteWorkerAccount(administrator.uid);
  }
}
export type ClassifiedsFixtureClient = Awaited<ReturnType<typeof authenticatedFixtureClient>>;
