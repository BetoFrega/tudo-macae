// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { UserRecord } from "@/features/users/use-cases/listUsersUseCase";
import { UserList } from "./UserList";

const { setRoleClaim } = vi.hoisted(() => ({ setRoleClaim: vi.fn() }));

vi.mock("@/features/users/actions/setRoleClaim", () => ({ setRoleClaim }));

function makeUser(overrides: Partial<UserRecord> & { uid: string }): UserRecord {
  return {
    email: `${overrides.uid}@example.com`,
    displayName: undefined,
    createdAt: undefined,
    lastSignIn: undefined,
    isAdmin: false,
    isEditor: false,
    ...overrides,
  };
}

const plainUser = makeUser({ uid: "plain" });
const editorUser = makeUser({ uid: "editor", isEditor: true });
const adminUser = makeUser({ uid: "admin", isAdmin: true });
const bothUser = makeUser({ uid: "both", isAdmin: true, isEditor: true });

const rowFor = (user: UserRecord) =>
  within(screen.getByRole("row", { name: new RegExp(user.uid) }));

function renderList(users: UserRecord[], currentUserUid = "someone-else") {
  return render(<UserList users={users} currentUserUid={currentUserUid} />);
}

beforeEach(() => {
  setRoleClaim.mockReset();
  setRoleClaim.mockResolvedValue({ success: true });
});

describe("UserList", () => {
  test("labels a column for each role", () => {
    renderList([plainUser]);

    expect(screen.getByRole("columnheader", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Editor" })).toBeInTheDocument();
  });

  // The accessible name is what the badge offers to a screen reader, and what
  // the e2e specs pick the right control by. Both columns, both directions.
  test("names each badge by the role it changes and the person it changes it for", () => {
    renderList([bothUser]);

    expect(
      screen.getByRole("button", { name: `Remover admin de ${bothUser.email}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Remover editor de ${bothUser.email}` }),
    ).toBeInTheDocument();

    renderList([plainUser]);

    expect(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} admin` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} editor` }),
    ).toBeInTheDocument();
  });

  test("shows a dash where a user has no name or dates on record", () => {
    renderList([plainUser]);

    expect(rowFor(plainUser).getAllByText("-")).toHaveLength(3);
  });

  test("shows the dates a user does have, in Brazilian format", () => {
    const dated = makeUser({
      uid: "dated",
      createdAt: "2026-03-09T12:00:00Z",
      lastSignIn: "2026-04-27T12:00:00Z",
    });
    renderList([dated]);

    expect(rowFor(dated).getByText("09/03/2026")).toBeInTheDocument();
    expect(rowFor(dated).getByText("27/04/2026")).toBeInTheDocument();
  });

  test("shows the two roles as independent badges", () => {
    renderList([plainUser, editorUser, adminUser, bothUser]);

    expect(rowFor(plainUser).getByText("Usuário")).toBeInTheDocument();
    expect(rowFor(plainUser).getByText("Leitor")).toBeInTheDocument();

    expect(rowFor(editorUser).getByText("Usuário")).toBeInTheDocument();
    expect(rowFor(editorUser).getByText("Editor")).toBeInTheDocument();

    expect(rowFor(adminUser).getByText("Admin")).toBeInTheDocument();
    expect(rowFor(adminUser).getByText("Leitor")).toBeInTheDocument();

    expect(rowFor(bothUser).getByText("Admin")).toBeInTheDocument();
    expect(rowFor(bothUser).getByText("Editor")).toBeInTheDocument();
  });

  test("granting the editor role asks for confirmation naming the user", async () => {
    renderList([plainUser]);

    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} editor` }),
    );

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Adicionar Editor")).toBeInTheDocument();
    expect(dialog.getByText(plainUser.email!)).toBeInTheDocument();
    expect(setRoleClaim).not.toHaveBeenCalled();
  });

  test("confirming a grant asks only for the role that was clicked", async () => {
    renderList([adminUser]);

    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${adminUser.email} editor` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(setRoleClaim).toHaveBeenCalledExactlyOnceWith(
      adminUser.uid,
      "editor",
      true,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      `Acesso editorial atualizado para ${adminUser.email}.`,
    );
  });

  test("revoking the editor role sends the revocation", async () => {
    renderList([editorUser]);

    await userEvent.click(
      screen.getByRole("button", {
        name: `Remover editor de ${editorUser.email}`,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("Remover Editor"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(setRoleClaim).toHaveBeenCalledExactlyOnceWith(
      editorUser.uid,
      "editor",
      false,
    );
  });

  test("an admin cannot revoke their own admin role", async () => {
    renderList([bothUser], bothUser.uid);

    await userEvent.click(
      screen.getByRole("button", { name: `Remover admin de ${bothUser.email}` }),
    );

    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText("Você não pode remover seu próprio status de admin."),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Confirmar" }),
    ).not.toBeInTheDocument();
  });

  // The guard above exists because losing `admin` locks you out of this screen.
  // The editor role is not needed to reach it, so it is not guarded — a
  // decision worth pinning rather than rediscovering.
  test("an admin may revoke their own editor role", async () => {
    renderList([bothUser], bothUser.uid);

    await userEvent.click(
      screen.getByRole("button", {
        name: `Remover editor de ${bothUser.email}`,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(setRoleClaim).toHaveBeenCalledExactlyOnceWith(
      bothUser.uid,
      "editor",
      false,
    );
  });

  // The mirror of the self-revoke guard: it is about *you*, so somebody else's
  // admin badge must stay actionable. A guard that blocked every admin row
  // would look the same from the test above.
  test("an admin may revoke another admin's role", async () => {
    renderList([adminUser], "someone-else");

    await userEvent.click(
      screen.getByRole("button", { name: `Remover admin de ${adminUser.email}` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(setRoleClaim).toHaveBeenCalledExactlyOnceWith(
      adminUser.uid,
      "admin",
      false,
    );
  });

  test("clears the previous error when the dialog is opened again", async () => {
    setRoleClaim.mockResolvedValue({ success: false, error: "Não autorizado" });
    renderList([plainUser]);

    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} editor` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Não autorizado")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} admin` }),
    );

    expect(screen.queryByText("Não autorizado")).not.toBeInTheDocument();
  });

  // Nothing stops an impatient double-click from sending the grant twice
  // except the button going away while the first one is in flight.
  test("locks the confirmation while the change is in flight", async () => {
    let settle: (result: { success: boolean }) => void = () => {};
    setRoleClaim.mockImplementation(
      () => new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderList([plainUser]);

    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} editor` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const confirm = screen.getByRole("button", { name: "Processando..." });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    settle({ success: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setRoleClaim).toHaveBeenCalledOnce();
  });

  // A refusal the server did not explain still has to say something: an empty
  // error box reads as a UI bug rather than a refusal.
  test("falls back to a generic message when the refusal carries no reason", async () => {
    setRoleClaim.mockResolvedValue({ success: false });
    renderList([plainUser]);

    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} editor` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByText("Erro desconhecido")).toBeInTheDocument();
  });

  test("a refused grant keeps the dialog open and shows why", async () => {
    setRoleClaim.mockResolvedValue({ success: false, error: "Não autorizado" });
    renderList([plainUser]);

    await userEvent.click(
      screen.getByRole("button", { name: `Tornar ${plainUser.email} editor` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      within(screen.getByRole("dialog")).getByText("Não autorizado"),
    ).toBeInTheDocument();
  });
});
