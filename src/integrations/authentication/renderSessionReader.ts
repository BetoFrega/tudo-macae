import { cache } from "react";

type RenderCache = <T extends (...args: never[]) => unknown>(fn: T) => T;

/** One session lookup per server render; React's render-scoped cache keeps renders isolated. */
export function createRenderSessionReader<T>(dependencies: { cache: RenderCache; resolve: () => Promise<T> }) {
  return dependencies.cache(dependencies.resolve);
}

async function resolveCurrentUser() {
  const { cookies } = await import("next/headers");
  const { resolveSession } = await import("./session");
  const cookieStore = await cookies();
  const session = await resolveSession(cookieStore.get("session")?.value);
  return session.status === "valid" ? session.user : null;
}

const readSessionForRender = createRenderSessionReader({ cache, resolve: resolveCurrentUser });

export function readCurrentUserForRender() {
  return readSessionForRender();
}
