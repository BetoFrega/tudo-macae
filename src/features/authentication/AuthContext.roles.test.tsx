// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderProvider, roles } from "./AuthContextProbes";

const { applyEmailVerification, readBrowserSession, readBrowserSessionAfterMutation, loginWithPasswordRequest, register, clearSessionCookie, capture, identify, refresh } = vi.hoisted(() => ({
  applyEmailVerification: vi.fn(async () => ({ status: "confirmed", email: "ana@example.com" })),
  identify: vi.fn(),
  refresh: vi.fn(),
  capture: vi.fn(),
  readBrowserSession: vi.fn(),
  readBrowserSessionAfterMutation: vi.fn(),
  loginWithPasswordRequest: vi.fn(),
  register: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: {
  identify, capture, reset: vi.fn(),
  get_property: vi.fn(), getSessionProperty: vi.fn(),
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), redirect: vi.fn() }));
vi.mock("./readBrowserSession", async importOriginal => ({
  ...await importOriginal<typeof import("./readBrowserSession")>(),
  readBrowserSession,
  readBrowserSessionAfterMutation,
}));
vi.mock("./passwordLoginRequest", () => ({ loginWithPasswordRequest }));
vi.mock("./actions/emailVerification", () => ({ applyEmailVerification }));
vi.mock("./actions/register", () => ({ register }));
vi.mock("./actions/clearSessionCookie", () => ({ clearSessionCookie }));

beforeEach(() => {
  vi.unstubAllEnvs();
  readBrowserSession.mockReset();
  readBrowserSessionAfterMutation.mockReset();
  loginWithPasswordRequest.mockReset();
  register.mockReset();
  refresh.mockReset();
  vi.clearAllMocks();
  clearSessionCookie.mockResolvedValue({ success: true });
  readBrowserSessionAfterMutation.mockResolvedValue(null);
  readBrowserSession.mockResolvedValue(null);
});

describe("AuthProvider", () => {
  test("publishes no roles when nobody is signed in", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    readBrowserSession.mockResolvedValue(null);
    try {
      renderProvider();
      expect(await roles(false, false)).toBeInTheDocument();
      await waitFor(() => expect(readBrowserSession).toHaveBeenCalledOnce());
      expect(capture).not.toHaveBeenCalled();
      expect(warnings).not.toHaveBeenCalled();
    }
    finally { warnings.mockRestore(); }
  });

  test("publishes who is signed in alongside their roles", async () => {
    readBrowserSession.mockResolvedValue({
      uid: "u1",
      email: "a@example.com",
      isAdmin: false,
      isEditor: true,
    });
    renderProvider();

    expect(await screen.findByText("quem:u1/a@example.com")).toBeInTheDocument();
  });

  test("coalesces focus and visibility refreshes while session synchronization is pending", async () => {
    let finishSynchronization!: (value: null) => void;
    const pendingSynchronization = new Promise<null>((resolve) => {
      finishSynchronization = resolve;
    });
    readBrowserSession.mockReturnValue(pendingSynchronization);
    renderProvider();
    await waitFor(() => expect(readBrowserSession).toHaveBeenCalledTimes(1));

    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    const concurrentCalls = readBrowserSession.mock.calls.length;

    finishSynchronization(null);
    await roles(false, false);
    expect(concurrentCalls).toBe(1);
  });

  // A session without an e-mail carries `undefined` for it; the
  // context promises `string | null`, and a consumer rendering `undefined`
  // shows nothing at all rather than a placeholder.
  test("reports a missing e-mail as null rather than undefined", async () => {
    readBrowserSession.mockResolvedValue({ uid: "u1", isAdmin: false, isEditor: false });
    renderProvider();

    expect(await screen.findByText("quem:u1/null")).toBeInTheDocument();
  });

  test("publishes the editor role from the session", async () => {
    readBrowserSession.mockResolvedValue({
      uid: "u1",
      email: "a@example.com",
      isAdmin: false,
      isEditor: true,
    });
    renderProvider();

    expect(await roles(false, true)).toBeInTheDocument();
  });

  test("publishes both roles independently", async () => {
    readBrowserSession.mockResolvedValue({
      uid: "u1",
      email: "a@example.com",
      isAdmin: true,
      isEditor: true,
    });
    renderProvider();

    expect(await roles(true, true)).toBeInTheDocument();
  });

  // Signing out has to drop *both* roles. Dropping one and keeping the other
  // leaves the next person at this browser with a menu they cannot use.
  test("drops every role on sign-out", async () => {
    readBrowserSession.mockResolvedValue({
      uid: "u1",
      email: "a@example.com",
      isAdmin: true,
      isEditor: true,
    });
    renderProvider();
    await roles(true, true);

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(async () =>
      expect(await roles(false, false)).toBeInTheDocument());
    // The roles going is not enough — the identity has to go with them, or the
    // sheet still greets the person who just signed out.
    expect(screen.getByText("quem:ninguém")).toBeInTheDocument();
    expect(clearSessionCookie).toHaveBeenCalled();
  });
});

// The app alone decides whether the browser credential affordance exists.
test.each([undefined, "production", "staging", "development", "unknown", "test"])("installs the login helper only in the exact test environment: %s", async (appEnv) => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", appEnv);
  const { unmount } = renderProvider();
  await roles(false, false);
  expect(typeof window.login).toBe(appEnv === "test" ? "function" : "undefined");
  unmount();
  expect(window.login).toBeUndefined();
  vi.unstubAllEnvs();
});
