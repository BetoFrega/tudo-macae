// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import UserSidebar from "@/features/navigation/UserSidebar";
import { AuthProvider } from "./AuthContext";

const { analytics, readBrowserSession, refresh } = vi.hoisted(() => {
  const analytics = { userState: "identified" as "identified" | "anonymous" };
  return {
    analytics,
    readBrowserSession: vi.fn(),
    refresh: vi.fn(),
  };
});

vi.mock("posthog-js", () => ({ default: {
  identify: vi.fn(),
  capture: vi.fn(),
  // PostHog's reset rotates the persisted identity to a new anonymous one.
  reset: vi.fn(() => {
    analytics.userState = "anonymous";
  }),
  get_property: vi.fn((name: string) => (name === "$user_state" ? analytics.userState : undefined)),
  getSessionProperty: vi.fn(() => undefined),
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), redirect: vi.fn() }));
vi.mock("./readBrowserSession", async importOriginal => ({
  ...await importOriginal<typeof import("./readBrowserSession")>(),
  readBrowserSession,
}));

beforeEach(() => {
  vi.clearAllMocks();
  analytics.userState = "identified";
  readBrowserSession.mockResolvedValue(null);
});

test("a stale identified analytics identity without a session keeps the anonymous entry and rotates once", async () => {
  const posthog = (await import("posthog-js")).default;
  render(<AuthProvider><UserSidebar /></AuthProvider>);

  await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled());
  expect(screen.queryByRole("button", { name: "Minha conta" })).not.toBeInTheDocument();
  expect(posthog.reset).toHaveBeenCalledOnce();
  expect(posthog.identify).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledOnce();

  await act(async () => {
    fireEvent.focus(window);
  });
  await waitFor(() => expect(readBrowserSession).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  expect(posthog.reset).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
});
