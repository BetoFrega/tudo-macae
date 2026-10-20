import { expect, test } from "vitest";
import { createAccountRecovery } from "../accountRecovery";

test("an old recipient cannot reset or confirm the account after its email changed", async () => {
  let savedPassword: string | undefined;
  const recovery = createAccountRecovery({
    now: () => 1000,
    read: async () => ({
      uid: "owner",
      recipient: "old@example.com",
      email: "new@example.com",
      disabled: false,
      migrated: true,
      expiresAt: 2000,
    }),
    hashPassword: async () => "password-hash",
    async complete(_proof, hash) {
      savedPassword = hash;
      return true;
    },
  });
  expect(await recovery.reset("recovery-token", "abc123")).toEqual({
    success: false,
    error: "Link inválido ou vencido. Solicite outro.",
  });
  expect(savedPassword).toBeUndefined();
});
