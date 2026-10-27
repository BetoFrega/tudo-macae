// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { workerProcedure } from "@/integrations/authentication/authority";
import AdminUsersPage from "./page";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/integrations/authentication/authority", () => ({ workerProcedure: vi.fn() }));
vi.mock("@/features/users/actions/setRoleClaim", () => ({ setRoleClaim: vi.fn() }));

function admin(uid: string) {
  return { uid, email: `${uid}@example.com`, displayName: undefined, createdAt: undefined, lastSignIn: undefined, isAdmin: true, isEditor: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ uid: "me", isAdmin: true } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(workerProcedure).mockResolvedValue({ users: [admin("me"), admin("other")] });
});

async function openRevocation(email: string) {
  render(await AdminUsersPage());
  await userEvent.click(screen.getByRole("button", { name: `Remover admin de ${email}` }));
  return within(screen.getByRole("dialog"));
}

test("the signed-in admin cannot revoke their own admin role from the users page", async () => {
  const dialog = await openRevocation("me@example.com");

  expect(dialog.getByText("Você não pode remover seu próprio status de admin.")).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
});

test("the signed-in admin may revoke another admin from the users page", async () => {
  const dialog = await openRevocation("other@example.com");

  expect(dialog.getByRole("button", { name: "Confirmar" })).toBeVisible();
  expect(dialog.queryByText("Você não pode remover seu próprio status de admin.")).not.toBeInTheDocument();
});
