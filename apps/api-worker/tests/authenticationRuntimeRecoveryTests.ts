import { expect, test } from "vitest";
import { start, emails, authenticationDatabase } from "./authenticationRuntimeHarness";

test("recovers an imported account without importing its password and confirms the recipient", async () => {
  const worker = await start(false);
  const { importAuthenticationAccounts } = await import("../migration");
  await importAuthenticationAccounts(await authenticationDatabase(), [
    {
      uid: "existing-owner",
      email: "owner@example.com",
      emailVerified: false,
      disabled: false,
      claims: { editor: true, other: "preserve" },
      createdAt: 1000,
    },
  ]);
  await (
    await authenticationDatabase()
  )
    .prepare(
      "UPDATE authentication_authority SET phase='active' WHERE singleton=1",
    )
    .run();
  expect(emails).toHaveLength(0);
  const requested = await worker.dispatchFetch(
    "http://authentication.test/api/auth/request-password-reset",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({ email: "owner@example.com" }),
    },
  );
  expect(requested.status).toBe(200);
  expect(emails).toHaveLength(1);
  const link = new URL(
    emails[0].text.split("\n").find(line => line.startsWith("http"))!,
  );
  const token = link.searchParams.get("token");
  const reset = await worker.dispatchFetch(
    "http://authentication.test/api/auth/reset-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({ token, newPassword: "abc123" }),
    },
  );
  expect(reset.status).toBe(200);
  const reused = await worker.dispatchFetch(
    "http://authentication.test/api/auth/reset-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({ token, newPassword: "other123" }),
    },
  );
  expect(reused.status).toBe(400);
  // The web adapter maps this code to the "Código inválido ou expirado." message.
  expect(await reused.json()).toMatchObject({ code: "INVALID_TOKEN" });
  const login = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-in/email",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({ email: "owner@example.com", password: "abc123" }),
    },
  );
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .find(value => value.startsWith("session="))
    ?.split(";")[0];
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers: { cookie: cookie! } },
  );
  expect(await session.json()).toMatchObject({
    result: {
      data: {
        status: "valid",
        user: {
          uid: "existing-owner",
          emailVerified: true,
          isEditor: true,
          isAdmin: false,
        },
      },
    },
  });
});

test("rejects password recovery from an untrusted browser origin", async () => {
  const worker = await start();
  const response = await worker.dispatchFetch(
    "http://authentication.test/api/auth/reset-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "https://attacker.test",
      },
      body: JSON.stringify({ token: "invalid", newPassword: "abc123" }),
    },
  );
  expect(response.status).toBe(403);
});

test("a recipient change during password hashing prevents both reset and confirmation", async () => {
  await start(false);
  const database = await authenticationDatabase();
  const { importAuthenticationAccounts, activateAuthenticationAuthority }
    = await import("../migration");
  const records = [
    {
      uid: "racing-owner",
      email: "old@example.com",
      emailVerified: false,
      disabled: false,
      claims: { editor: true },
      createdAt: 1000,
    },
  ];
  await importAuthenticationAccounts(database, records);
  await activateAuthenticationAuthority(database, records);
  const { createAccountRecovery }
    = await import("@tudomacae/authentication/account-recovery");
  const {
    issuePasswordRecovery,
    readPasswordRecovery,
    completePasswordRecovery,
  } = await import("../lib/db/passwordRecovery");
  const token = crypto.randomUUID();
  await database.prepare("INSERT INTO verification (id,identifier,value,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), `reset-password:${token}`, "racing-owner", Date.now() + 3600000, Date.now(), Date.now()).run();
  await issuePasswordRecovery(
    database,
    token,
    "racing-owner",
    "old@example.com",
    Date.now(),
  );
  const recovery = createAccountRecovery({
    now: Date.now,
    read: value => readPasswordRecovery(database, value),
    async hashPassword() {
      await database
        .prepare(
          "UPDATE user SET email='new@example.com' WHERE id='racing-owner'",
        )
        .run();
      return "discarded-password-hash";
    },
    complete: (proof, hash) =>
      completePasswordRecovery(database, proof, hash, Date.now()),
  });
  expect((await recovery.reset(token, "abc123")).success).toBe(false);
  expect(
    await database
      .prepare(
        "SELECT email,emailVerified,claims FROM user WHERE id='racing-owner'",
      )
      .first(),
  ).toEqual({
    email: "new@example.com",
    emailVerified: 0,
    claims: JSON.stringify({ editor: true }),
  });
  expect(
    await database.prepare("SELECT COUNT(*) AS count FROM account").first(),
  ).toEqual({ count: 0 });
});

test("a delayed delivery result cannot overwrite a newer D1 attempt", async () => {
  await start(false);
  const database = await authenticationDatabase();
  const { importAuthenticationAccounts } = await import("../migration");
  await importAuthenticationAccounts(database, [
    {
      uid: "attempt-owner",
      email: "owner@example.com",
      emailVerified: false,
      disabled: false,
      claims: {},
      createdAt: 1000,
    },
  ]);
  const { verificationAttempts } = await import("../lib/db/emailVerification");
  const attempts = verificationAttempts(database);
  await attempts.reserve("attempt-owner", () => ({
    allowed: true,
    nextSendAt: 60000,
  }));
  await attempts.reserve("attempt-owner", () => ({
    allowed: true,
    nextSendAt: 120000,
  }));
  await attempts.finish("attempt-owner", 120000, {
    pendingEmail: "new@example.com",
  });
  await attempts.finish("attempt-owner", 60000, {
    error: "old failure",
    pendingEmail: "old@example.com",
  });
  expect(await attempts.read("attempt-owner")).toEqual({
    nextSendAt: 120000,
    pendingEmail: "new@example.com",
  });
});
