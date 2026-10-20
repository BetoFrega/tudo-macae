import type * as entry from "../editorAuthorization";
export async function run(module: typeof entry) {
  const access = module.createEditorialRoleAccess({ readUser: async () => ({ disabled: false, roles: { editor: true } }) });
  await access.assertRole("editor", "editor");
  await access.hasRole("editor", "editor");
}
