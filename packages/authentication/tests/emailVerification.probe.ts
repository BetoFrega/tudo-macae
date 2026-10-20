import type * as entry from "../emailVerification";
export async function run(module: typeof entry) {
  const verification = module.createEmailVerification({
    now: () => 1000,
    provider: {
      async readAccount(uid) { return { uid, email: "a@example.com", emailVerified: false }; },
      async send() {},
      async correct() {},
      async confirm() { return { email: "a@example.com" }; },
    },
    attempts: { async read() { return { nextSendAt: 0 }; },
      async reserve() { return { allowed: true, nextSendAt: 61000 }; },
      async finish() {} },
  });
  await verification.read("user");
  await verification.send("user");
  await verification.correct("user", { email: "b@example.com", password: "password" });
  await verification.confirm("code");
}
