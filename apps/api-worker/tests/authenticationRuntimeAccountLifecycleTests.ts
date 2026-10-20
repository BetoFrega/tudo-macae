import { expect, test } from "vitest";
import { start, authenticationDatabase } from "./authenticationRuntimeHarness";

test("preparation refuses new writers and activation rejects late imports", async () => {
  const worker = await start(false);
  const body = { email: "owner@example.com", password: "abc123" };
  const signup = () =>
    worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify(body),
    });
  expect((await signup()).status).toBe(503);
  const { importAuthenticationAccounts, activateAuthenticationAuthority }
    = await import("../migration");
  const database = await authenticationDatabase();
  const accounts = [
    {
      uid: "owner",
      email: body.email,
      emailVerified: false,
      disabled: false,
      claims: { editor: true },
      createdAt: 1000,
    },
  ];
  accounts[0] = {
    ...accounts[0],
    verificationAttempt: {
      nextSendAt: 60000,
      pendingEmail: "pending@example.com",
    },
  } as (typeof accounts)[0];
  await importAuthenticationAccounts(database, accounts);
  await importAuthenticationAccounts(database, accounts);
  expect(
    await database.prepare("SELECT COUNT(*) AS count FROM user").first(),
  ).toEqual({ count: 1 });
  await expect(activateAuthenticationAuthority(database, [])).rejects.toThrow(
    "reconciliation",
  );
  await activateAuthenticationAuthority(database, accounts);
  await expect(
    importAuthenticationAccounts(
      database,
      accounts.map(account => ({ ...account, claims: {} })),
    ),
  ).rejects.toThrow("active");
  expect(
    (
      await database
        .prepare("SELECT claims FROM user WHERE id='owner'")
        .first<{ claims: string }>()
    )?.claims,
  ).toBe(JSON.stringify({ editor: true }));
});

test("slow verification delivery returns the created account and session within the caller deadline", async () => {
  const worker = await start();
  const created = await worker.dispatchFetch("http://authentication.test/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://authentication.test" },
    body: JSON.stringify({ email: "delivery-slow@example.com", password: "abc123" }),
    signal: AbortSignal.timeout(4500),
  });
  expect(created.status).toBe(200);
  expect(await created.json()).toMatchObject({ verification: { status: "error" } });
  const cookie = created.headers.getSetCookie().find(value => value.startsWith("session="))?.split(";")[0];
  expect(cookie).toBeDefined();
  const session = await worker.dispatchFetch("http://authentication.test/api/trpc/session", { headers: { cookie: cookie! } });
  expect(await session.json()).toMatchObject({ result: { data: { status: "valid", user: { emailVerified: false } } } });
}, 10000);
