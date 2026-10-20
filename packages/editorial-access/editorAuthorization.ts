export interface EditorIdentity { name: string; disabled: boolean; editorRole: unknown }

export function isActiveEditor(editor: EditorIdentity | null): editor is EditorIdentity {
  return editor !== null && !editor.disabled && editor.editorRole === true;
}

export type EditorialLiveRole = "admin" | "editor";
export interface EditorialLiveRoleOptions { missingUserIsMissingRole?: boolean }
export interface EditorialRoleAccessDependencies {
  readUser(uid: string, options?: EditorialLiveRoleOptions): Promise<{ disabled: boolean; roles: Record<string, unknown> } | null>;
}
export function createEditorialRoleAccess(dependencies: EditorialRoleAccessDependencies) {
  return {
    async assertRole(uid: string, role: EditorialLiveRole, options: EditorialLiveRoleOptions = {}) {
      const user = await dependencies.readUser(uid, options);
      if (user?.roles[role] !== true) {
        throw new TypeError(role === "editor" ? "O papel atual de Editor é obrigatório." : "O papel atual de Administrador é obrigatório.");
      }
    },
    async hasRole(uid: string, role: EditorialLiveRole) {
      const user = await dependencies.readUser(uid);
      return user !== null && !user.disabled && user.roles[role] === true;
    },
  };
}
