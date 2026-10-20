import type * as entry from "../accountAccess";
export async function run(module: typeof entry) {
  const account = module.createAccountAccess({
    signUp: async () => ({
      status: "created",
      sessionCredential: "token",
      verificationCredential: "refresh",
    }),
    issueSession: async () => ({ success: true, uid: "user" }),
    sendVerification: async () => ({ status: "verified" }),
    requestPasswordReset: async () => true,
    resetPassword: async () => ({ success: true, email: "ana@example.com" }),
  });
  await account.register({
    email: "ana@example.com",
    password: "Password123!",
  });
  await account.requestPasswordResetEmail({ email: "ana@example.com" });
  await account.resetPassword("code", "Password123!");
}
