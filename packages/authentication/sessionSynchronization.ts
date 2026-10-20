import type { SessionResolution, SessionUser } from "./session";

export type SessionSynchronizationDependencies = {
  resolve(cookie: string | undefined): Promise<SessionResolution>;
  clearInvalidCookies(): Promise<void>;
};

export function createSessionSynchronizer(dependencies: SessionSynchronizationDependencies) {
  return {
    async synchronize(cookie: string | undefined): Promise<SessionUser | null> {
      const session = await dependencies.resolve(cookie);
      if (session.status === "invalid") await dependencies.clearInvalidCookies();
      return session.status === "valid" ? session.user : null;
    },
  };
}
