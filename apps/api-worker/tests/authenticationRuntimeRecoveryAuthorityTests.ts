import { expect, test } from "vitest";
import z from "zod";
import { start, restartRuntime, authenticationDatabase } from "./authenticationRuntimeHarness";

test("recovering the Worker preserves new passwords, roles, attempts and active authority", async () => {
  const worker = await start();
  const headers = {
    "content-type": "application/json",
    "origin": "http://authentication.test",
  };
  const signup = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-up/email",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "after-cut@example.com",
        password: "abc123",
      }),
    },
  );
  const uid = z
    .object({ user: z.object({ id: z.string() }) })
    .parse(await signup.json()).user.id;
  const database = await authenticationDatabase();
  await database
    .prepare("UPDATE user SET claims=? WHERE id=?")
    .bind(JSON.stringify({ editor: true, preserved: "value" }), uid)
    .run();
  const before = await database
    .prepare("SELECT nextSendAt FROM verification_attempt WHERE userId=?")
    .bind(uid)
    .first();
  await worker.dispose();
  const runtime = restartRuntime();
  const login = await runtime.dispatchFetch(
    "http://authentication.test/api/auth/sign-in/email",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "after-cut@example.com",
        password: "abc123",
      }),
    },
  );
  expect(login.status).toBe(200);
  const restored = await authenticationDatabase();
  expect(
    await restored
      .prepare("SELECT phase FROM authentication_authority WHERE singleton=1")
      .first(),
  ).toEqual({ phase: "active" });
  expect(
    await restored
      .prepare("SELECT claims FROM user WHERE id=?")
      .bind(uid)
      .first(),
  ).toEqual({ claims: JSON.stringify({ editor: true, preserved: "value" }) });
  expect(
    await restored
      .prepare("SELECT nextSendAt FROM verification_attempt WHERE userId=?")
      .bind(uid)
      .first(),
  ).toEqual(before);
  await expect(
    restored
      .prepare(
        "UPDATE authentication_authority SET phase='preparing' WHERE singleton=1",
      )
      .run(),
  ).rejects.toThrow();
});

test("a completed reset invalidates every outstanding recovery proof for the account", async () => {
  await start(false);
  const database = await authenticationDatabase();
  const { importAuthenticationAccounts } = await import("../migration");
  await importAuthenticationAccounts(database, [{ uid: "recovery-owner", email: "owner@example.com", emailVerified: false, disabled: false, claims: {}, createdAt: 1000 }]);
  await database.prepare("UPDATE authentication_authority SET phase='active' WHERE singleton=1").run();
  const { issuePasswordRecovery, readPasswordRecovery, completePasswordRecovery } = await import("../lib/db/passwordRecovery");
  for (const token of ["first-disposable-proof", "second-disposable-proof"]) await database.prepare("INSERT INTO verification (id,identifier,value,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), `reset-password:${token}`, "recovery-owner", Date.now() + 3600000, Date.now(), Date.now()).run();
  await issuePasswordRecovery(database, "first-disposable-proof", "recovery-owner", "owner@example.com", Date.now());
  await issuePasswordRecovery(database, "second-disposable-proof", "recovery-owner", "owner@example.com", Date.now());
  const proof = await readPasswordRecovery(database, "first-disposable-proof");
  if (!proof) throw new Error("Fixture proof missing");
  expect(await completePasswordRecovery(database, { ...proof, token: "first-disposable-proof", confirmRecipient: true }, "disposable-hash", Date.now())).toBe(true);
  expect(await readPasswordRecovery(database, "second-disposable-proof")).toBeNull();
  await expect(issuePasswordRecovery(database, "second-disposable-proof", "recovery-owner", "owner@example.com", Date.now())).rejects.toThrow("Recovery proof superseded");
  expect(await completePasswordRecovery(database, { ...proof, token: "second-disposable-proof", confirmRecipient: true }, "replacement-hash", Date.now())).toBe(false);
});

test("a replacement email correction invalidates the previous recipient link", async () => {
  await start(false);
  const database = await authenticationDatabase();
  const { importAuthenticationAccounts } = await import("../migration");
  await importAuthenticationAccounts(database, [{ uid: "correction-owner", email: "original@example.com", emailVerified: false, disabled: false, claims: {}, createdAt: 1000 }]);
  await database.prepare("UPDATE authentication_authority SET phase='active' WHERE singleton=1").run();
  const { issueEmailConfirmation, confirmEmailRecipient } = await import("../lib/db/emailVerification");
  const firstRevision = Date.now() + 60000;
  const latestRevision = firstRevision + 60000;
  await database.prepare("INSERT INTO verification_attempt (userId,nextSendAt) VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET nextSendAt=excluded.nextSendAt").bind("correction-owner", firstRevision).run();
  const first = await issueEmailConfirmation(database, "correction-owner", "original@example.com", "first@example.com", Date.now(), firstRevision);
  await database.prepare("UPDATE verification_attempt SET nextSendAt=? WHERE userId=?").bind(latestRevision, "correction-owner").run();
  const latest = await issueEmailConfirmation(database, "correction-owner", "original@example.com", "latest@example.com", Date.now(), latestRevision);
  await expect(issueEmailConfirmation(database, "correction-owner", "original@example.com", "first@example.com", Date.now(), firstRevision)).rejects.toThrow("Verification reservation superseded");
  await expect(confirmEmailRecipient(database, first, Date.now())).rejects.toThrow("Invalid confirmation");
  expect(await confirmEmailRecipient(database, latest, Date.now())).toEqual({ email: "latest@example.com" });
});
