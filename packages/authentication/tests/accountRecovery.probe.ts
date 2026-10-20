import type * as entry from "../accountRecovery";
export async function run(module: typeof entry) {
  const recovery = module.createAccountRecovery({
    now: () => 0,
    read: async () => ({
      uid: "owner",
      email: "owner@example.com",
      recipient: "owner@example.com",
      migrated: true,
      disabled: false,
      expiresAt: 1000,
    }),
    hashPassword: async () => "disposable",
    complete: async () => true,
  });
  await recovery.reset("token", "abc123");
}
