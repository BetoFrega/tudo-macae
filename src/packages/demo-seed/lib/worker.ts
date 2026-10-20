import { readFile } from "node:fs/promises";
import { createAuthenticationClient } from "@tudomacae/authentication-client/client";
import { createClassifiedsClient, type ClassifiedsCredential } from "@tudomacae/classifieds-client/client";
import type { ClassifiedsReadOperation, ClassifiedsWriteOperation } from "@tudomacae/classifieds-client/protocol";
import { createClassifiedsPhotoClient } from "@tudomacae/classifieds-client/photos";
import type { PhotoUpload } from "@tudomacae/classifieds-photos";
import { createEditorialBlogClient } from "@tudomacae/editorial-blog/client";
import type { SavePostInput } from "@tudomacae/editorial-blog/blog";

/**
 * The seed's only way into accounts and Classifieds: the API Worker fixture
 * that `npm run dev` starts (`apps/api-worker/testing.mjs`). Every record goes
 * through the Worker's own procedures, signed in as the account that owns it,
 * so the demo mass passes the validation and ownership rules production runs.
 *
 * The fixture controller is used for what no procedure offers: creating an
 * account with its roles and dating a record in the past.
 */
interface FixtureConfiguration {
  controllerOrigin: string;
  AUTHENTICATION_API_URL: string;
}

let configuration: Promise<FixtureConfiguration> | undefined;

function fixtureConfiguration(): Promise<FixtureConfiguration> {
  const path = process.env.AUTHENTICATION_FIXTURE_CONFIGURATION;
  if (!path) {
    throw new Error(
      "The demo seed needs the API Worker fixture that `npm run dev` starts; AUTHENTICATION_FIXTURE_CONFIGURATION is not set.",
    );
  }
  configuration ??= readFile(path, "utf8").then(text => JSON.parse(text) as FixtureConfiguration);
  return configuration;
}

function publicOrigin(): string {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) throw new Error("The demo seed needs PUBLIC_APP_ORIGIN to sign in to the API Worker.");
  return origin;
}

/** Calls one route of the fixture controller, which only ever listens on loopback. */
export async function fixture<T>(route: string, input: unknown): Promise<T> {
  const target = new URL(route, (await fixtureConfiguration()).controllerOrigin);
  if (target.hostname !== "127.0.0.1") throw new Error("The API Worker fixture must listen on loopback.");
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`The API Worker fixture refused ${route} (${response.status}).`);
  return (await response.json()) as T;
}

async function workerOrigin(): Promise<string> {
  return (await fixtureConfiguration()).AUTHENTICATION_API_URL;
}

const sessions = new Map<string, Promise<string>>();

/** Signs in through the same Better Auth endpoint the login form reaches. */
export function signIn(email: string, password: string): Promise<string> {
  let session = sessions.get(email);
  if (!session) {
    session = (async () => {
      const client = createAuthenticationClient({ origin: await workerOrigin(), publicOrigin: publicOrigin(), allowLocal: true });
      const response = await client.request("/api/auth/sign-in/email", { body: { email, password } });
      const credential = client.sessionCredential(response);
      if (!response.ok || !credential) throw new Error(`The API Worker refused the demo login for ${email}.`);
      return credential;
    })();
    session.catch(() => sessions.delete(email));
    sessions.set(email, session);
  }
  return session;
}

/**
 * Sessions are reused because Better Auth limits sign-ins per account (three
 * every ten seconds by default); one boot signs each account in only once.
 */
export function forgetSession(email: string): void {
  sessions.delete(email);
}

export async function updateRoles(
  session: string,
  uid: string,
  patch: { admin: boolean; editor: boolean },
): Promise<void> {
  const client = createAuthenticationClient({ origin: await workerOrigin(), publicOrigin: publicOrigin(), allowLocal: true });
  await client.procedure("updateRoles", { uid, patch }, session, true);
}

/** Classifieds procedures under one signed-in account. */
export async function classifiedsAs(session: string) {
  const client = createClassifiedsClient({ origin: await workerOrigin(), publicOrigin: publicOrigin(), allowLocal: true });
  const credential: ClassifiedsCredential = { session };
  return {
    read: <T>(operation: ClassifiedsReadOperation, input: unknown) => client.read<T>(operation, input, credential),
    write: <T>(operation: ClassifiedsWriteOperation, input: unknown) => client.write<T>(operation, input, credential),
    uploadPhoto: async (upload: PhotoUpload) => {
      const photos = createClassifiedsPhotoClient({ origin: await workerOrigin(), publicOrigin: publicOrigin(), allowLocal: true });
      return photos.upload(upload, credential);
    },
  };
}

export type DemoClassifieds = Awaited<ReturnType<typeof classifiedsAs>>;

/** Blog procedures under one signed-in account. */
export async function blogAs(session: string) {
  const client = createEditorialBlogClient({ origin: await workerOrigin(), publicOrigin: publicOrigin(), allowLocal: true });
  return {
    list: (cursor?: string) => client.list(cursor, session),
    save: (input: SavePostInput) => client.save(input, session),
  };
}

export type DemoBlog = Awaited<ReturnType<typeof blogAs>>;
