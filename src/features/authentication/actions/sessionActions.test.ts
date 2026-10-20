// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const { resolveSession, sessionCookie } = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  sessionCookie: {
    current: undefined as string | undefined,
    deletions: 0,
  },
}));

vi.mock("@/integrations/authentication/session", () => ({
  resolveSession,
  createSessionSynchronizer: (dependencies: { resolve: typeof resolveSession; clearInvalidCookies: () => Promise<void> }) => ({
    async synchronize(cookie: string | undefined) {
      const session = await dependencies.resolve(cookie);
      if (session.status === "invalid") await dependencies.clearInvalidCookies();
      return session.status === "valid" ? session.user : null;
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" && sessionCookie.current !== undefined
        ? { value: sessionCookie.current }
        : undefined,
    delete: (name: string) => {
      if (name === "session") {
        sessionCookie.current = undefined;
        sessionCookie.deletions += 1;
      }
    },
  }),
}));

const { getCurrentUser } = await import("./getCurrentUser");
const { synchronizeSessionRequest } = await import("../synchronizeSessionRequest");

const validUser = {
  uid: "user-1",
  email: "person@example.com",
  isAdmin: true,
  isEditor: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionCookie.current = undefined;
  sessionCookie.deletions = 0;
});

describe("getCurrentUser", () => {
  test("reports no one when there is no session cookie", async () => {
    resolveSession.mockResolvedValue({ status: "missing" });

    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie.deletions).toBe(0);
  });

  test("returns the package's valid user shape unchanged", async () => {
    sessionCookie.current = "valid-session";
    resolveSession.mockResolvedValue({ status: "valid", user: validUser });

    expect(await getCurrentUser()).toEqual(validUser);
    expect(sessionCookie.deletions).toBe(0);
  });

  test("reports no one without mutating an invalid cookie during render", async () => {
    sessionCookie.current = "invalid-session";
    resolveSession.mockResolvedValue({ status: "invalid" });

    expect(await getCurrentUser()).toBeNull();
    expect(sessionCookie.current).toBe("invalid-session");
    expect(sessionCookie.deletions).toBe(0);
  });
});

describe("synchronizeSession", () => {
  test("reports no one without deleting when there is no cookie", async () => {
    resolveSession.mockResolvedValue({ status: "missing" });

    expect(await synchronizeSessionRequest()).toBeNull();
    expect(sessionCookie.deletions).toBe(0);
  });

  test("clears an invalid cookie from its mutation-capable response", async () => {
    sessionCookie.current = "invalid-session";
    resolveSession.mockImplementation(async (cookie: string | undefined) =>
      cookie === "invalid-session" ? { status: "invalid" } : { status: "missing" });

    expect(await synchronizeSessionRequest()).toBeNull();
    expect(sessionCookie.current).toBeUndefined();
    expect(sessionCookie.deletions).toBe(1);
  });

  test("returns a valid user without deleting its cookie", async () => {
    sessionCookie.current = "valid-session";
    resolveSession.mockResolvedValue({ status: "valid", user: validUser });

    expect(await synchronizeSessionRequest()).toEqual(validUser);
    expect(sessionCookie.current).toBe("valid-session");
    expect(sessionCookie.deletions).toBe(0);
  });
});
