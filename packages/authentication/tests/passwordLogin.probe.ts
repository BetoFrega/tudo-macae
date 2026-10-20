import type * as entry from "../passwordLogin";

export async function run(module: typeof entry) {
  const login = module.createPasswordLogin({
    async authenticate() {
      return { status: "authenticated" as const, sessionCredential: "token" };
    },
    async createSession() {
      return { success: true as const, uid: "user" };
    },
  });
  await login.login({ email: "person@example.com", password: "password" });
}
