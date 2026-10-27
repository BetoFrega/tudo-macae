import { describe, expect, test, vi } from "vitest";
import AdminLayout, { AdminLayoutContent } from "./layout";

/**
 * One gate guards every `/admin/*` route, so its variants live here and the
 * browser keeps a single refusal (`tests/e2e/admin/access-control.spec.ts`).
 * `unauthorized()` and `forbidden()` stop rendering by throwing, so the test
 * asserts on the interrupt rather than on the call.
 */
const { currentUser } = vi.hoisted(() => ({
  currentUser: { value: null as { isAdmin: boolean; isEditor: boolean } | null },
}));

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: async () => currentUser.value,
}));

vi.mock("next/navigation", () => ({
  unauthorized: () => {
    throw new Error("NEXT_UNAUTHORIZED");
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
}));

const renderContent = () =>
  AdminLayoutContent({ children: <p>painel</p> });

describe("the admin gate", () => {
  test("sends a visitor with no session to the sign-in page", async () => {
    currentUser.value = null;

    await expect(renderContent()).rejects.toThrow("NEXT_UNAUTHORIZED");
  });

  test("refuses a signed-in user without the administrator role", async () => {
    currentUser.value = { isAdmin: false, isEditor: false };

    await expect(renderContent()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  test("refuses an editor who is not an administrator", async () => {
    currentUser.value = { isAdmin: false, isEditor: true };

    await expect(renderContent()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  test("lets an administrator through", async () => {
    currentUser.value = { isAdmin: true, isEditor: false };

    await expect(renderContent()).resolves.toBeTruthy();
  });

  test("wraps the guarded content so a slow session shows the loader", () => {
    expect(AdminLayout({ children: <p>painel</p> })).toBeTruthy();
  });
});
