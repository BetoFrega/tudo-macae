// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { Boundary, ExplicitRefreshProbe, SessionProbe } from "./AuthContextProbes";
import { ReportedSessionFailure, SessionSynchronizationFailure } from "./readBrowserSession";

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

test("identifies a recovered mount session once despite repeated background refreshes", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  readBrowserSession.mockRejectedValueOnce(new Error("transport failed"));
  readBrowserSession.mockResolvedValue({ uid: "u1", email: "a@example.com", isAdmin: true, isEditor: true });
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText("ready:anonymous:false:false");
  expect(identify).not.toHaveBeenCalled();
  fireEvent.focus(window);
  await screen.findByText("ready:u1:true:true");
  expect(identify).toHaveBeenCalledExactlyOnceWith("u1", {});
  await act(async () => {
    fireEvent.focus(window);
  });
  expect(identify).toHaveBeenCalledTimes(1);
  log.mockRestore();
});
test.each(["mount", "focus", "visibilitychange"])("preserves the last confirmed session and retries after %s fails", async (trigger) => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "qualification");
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  readBrowserSession.mockResolvedValue({ uid: "u1", email: null, isAdmin: true, isEditor: true });
  if (trigger === "mount") readBrowserSession.mockRejectedValueOnce(new Error("private transport payload"));
  render(<Boundary><AuthProvider><SessionProbe /></AuthProvider></Boundary>, { onCaughtError: () => {} });
  if (trigger !== "mount") {
    await screen.findByText("ready:u1:true:true");
    readBrowserSession.mockRejectedValueOnce(new Error("private transport payload"));
    await act(async () => {
      if (trigger === "focus") fireEvent.focus(window);
      else fireEvent(document, new Event("visibilitychange"));
    });
  }
  await waitFor(() => expect(screen.queryByText("pending")).not.toBeInTheDocument());
  expect(screen.queryByText("Boundary fallback")).not.toBeInTheDocument();
  expect(screen.getByText(trigger === "mount" ? "ready:anonymous:false:false" : "ready:u1:true:true")).toBeInTheDocument();
  expect(log).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledExactlyOnceWith("session_synchronization_failed", JSON.parse(log.mock.calls[0][0]));
  expect(JSON.stringify(log.mock.calls)).not.toContain("private transport payload");
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ event: "authentication.session.refresh_failed", service: "browser", environment: "qualification", outcome: "failed", failureCategory: "unknown", trigger: "background_refresh" });
  log.mockRestore();
  readBrowserSession.mockResolvedValue({ uid: "u2", email: null, isAdmin: false, isEditor: false });
  fireEvent.focus(window);
  expect(await screen.findByText("ready:u2:false:false")).toBeInTheDocument();
});

test("reads the updated email after a mutation even while an earlier background read is pending", async () => {
  const oldUser = { uid: "u1", email: "old@example.com", emailVerified: false, isAdmin: false, isEditor: false };
  let finish!: (value: typeof oldUser) => void;
  readBrowserSession.mockReturnValueOnce(new Promise((resolve) => {
    finish = resolve;
  }));
  readBrowserSession.mockResolvedValue({ ...oldUser, email: "new@example.com", emailVerified: true });
  render(<AuthProvider><ExplicitRefreshProbe /></AuthProvider>);
  await waitFor(() => expect(readBrowserSession).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await act(async () => {
    finish(oldUser);
  });
  expect(await screen.findByText("success")).toBeInTheDocument();
  expect(screen.getByText("email:new@example.com verified:true")).toBeInTheDocument();
  expect(readBrowserSession).toHaveBeenCalledTimes(2);
});
test("keeps explicit refresh failures observable to the caller", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  render(<AuthProvider><ExplicitRefreshProbe /></AuthProvider>);
  await screen.findByText("ready:anonymous:false:false");
  readBrowserSession.mockRejectedValueOnce(new SessionSynchronizationFailure("transport"));
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("explicit failure")).toBeInTheDocument();
  expect(screen.getByText("ready:anonymous:false:false")).toBeInTheDocument();
  const failure = JSON.parse(log.mock.calls[0][0]);
  expect(failure).toMatchObject({ failureCategory: "transport", trigger: "explicit_refresh" });
  expect(failure).not.toHaveProperty("httpStatus");
  log.mockRestore();
});

test("propagates a server-reported failure without reporting it again in the browser", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  render(<AuthProvider><ExplicitRefreshProbe /></AuthProvider>);
  await screen.findByText("ready:anonymous:false:false");
  readBrowserSession.mockRejectedValueOnce(new ReportedSessionFailure("Session synchronization failed"));
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("explicit failure")).toBeInTheDocument();
  expect(log).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  fireEvent.focus(window);
  await waitFor(() => expect(readBrowserSession).toHaveBeenCalledTimes(3));
  expect(screen.getByText("ready:anonymous:false:false")).toBeInTheDocument();
  log.mockRestore();
});
