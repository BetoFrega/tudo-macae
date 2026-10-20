import { expect, test } from "vitest";
import { createEditorialRoleAccess, isActiveEditor } from "../editorAuthorization";

test("rechecks active authority after role removal without relying on a cached claim", async () => {
  let editor = true;
  const access = createEditorialRoleAccess({ readUser: async () => ({ disabled: false, roles: { editor, admin: true } }) });
  await expect(access.hasRole("user", "editor")).resolves.toBe(true);
  editor = false;
  await expect(access.hasRole("user", "editor")).resolves.toBe(false);
  await expect(access.assertRole("user", "editor")).rejects.toThrow("O papel atual de Editor é obrigatório.");
  await expect(access.hasRole("user", "admin")).resolves.toBe(true);
  expect(isActiveEditor({ name: "Editor", disabled: true, editorRole: true })).toBe(false);
});

test("preserves assert and active-check compatibility for disabled accounts and missing users", async () => {
  const access = createEditorialRoleAccess({ readUser: async () => ({ disabled: true, roles: { editor: true } }) });
  await expect(access.hasRole("user", "editor")).resolves.toBe(false);
  await expect(access.assertRole("user", "editor")).resolves.toBeUndefined();
  const missing = createEditorialRoleAccess({ readUser: async () => null });
  await expect(missing.assertRole("missing", "admin", { missingUserIsMissingRole: true })).rejects.toThrow("O papel atual de Administrador é obrigatório.");
});
