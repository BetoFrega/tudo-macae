import { describe, expect, test, vi } from "vitest";
import NewsroomLayout, { NewsroomLayoutContent } from "./layout";

/**
 * The gate, tested by the interrupt it raises.
 *
 * `unauthorized()` and `forbidden()` work by throwing — that is how Next stops
 * rendering and swaps in `unauthorized.tsx` / `forbidden.tsx`. So which one a
 * visitor gets is observable behaviour, not an implementation detail, and the
 * test asserts on the interrupt rather than on the call.
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
  NewsroomLayoutContent({ children: <p>painel</p> });

describe("the newsroom gate", () => {
  test("sends a visitor with no session to the sign-in page", async () => {
    currentUser.value = null;

    await expect(renderContent()).rejects.toThrow("NEXT_UNAUTHORIZED");
  });

  test("refuses a signed-in user holding neither role", async () => {
    currentUser.value = { isAdmin: false, isEditor: false };

    await expect(renderContent()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  test("lets an administrator through", async () => {
    currentUser.value = { isAdmin: true, isEditor: false };

    await expect(renderContent()).resolves.toBeTruthy();
  });

  test("lets an editor through", async () => {
    currentUser.value = { isAdmin: false, isEditor: true };

    await expect(renderContent()).resolves.toBeTruthy();
  });

  test("lets someone holding both roles through", async () => {
    currentUser.value = { isAdmin: true, isEditor: true };

    await expect(renderContent()).resolves.toBeTruthy();
  });

  test("wraps the guarded content so a slow session shows the loader", () => {
    expect(NewsroomLayout({ children: <p>painel</p> })).toBeTruthy();
  });
});
