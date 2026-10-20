import { expect, test } from "vitest";
import { start, emails, authenticationDatabase, unexpectedOutboundRequests } from "./authenticationRuntimeHarness";

test("concurrent verification requests share the cooldown and correction requires a password", async () => {
  const worker = await start();
  const created = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-up/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({
        email: "mistyped@example.com",
        password: "abc123",
      }),
    },
  );
  const cookie = created.headers
    .getSetCookie()
    .find(value => value.startsWith("session="))
    ?.split(";")[0];
  emails.length = 0;
  await (
    await authenticationDatabase()
  )
    .prepare("UPDATE verification_attempt SET nextSendAt=0")
    .run();
  const headers = {
    "content-type": "application/json",
    "origin": "http://authentication.test",
    "cookie": cookie!,
  };
  const invoke = (name: string, input: unknown) =>
    worker.dispatchFetch(`http://authentication.test/api/trpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  const first = await Promise.all([
    invoke("sendVerification", {}),
    invoke("sendVerification", {}),
  ]);
  expect(first.every(response => response.ok)).toBe(true);
  expect(emails).toHaveLength(1);
  const outcomes = await Promise.all(first.map(response => response.json()));
  expect(outcomes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        result: { data: expect.objectContaining({ status: "sent" }) },
      }),
      expect.objectContaining({
        result: { data: expect.objectContaining({ status: "error" }) },
      }),
    ]),
  );
  const database = await authenticationDatabase();
  await database.prepare("UPDATE verification_attempt SET nextSendAt=0").run();
  const refused = await invoke("correctEmail", {
    email: "correct@example.com",
    password: "wrong",
  });
  expect(await refused.json()).toMatchObject({
    result: { data: { status: "error" } },
  });
  expect(emails).toHaveLength(1);
  await database.prepare("UPDATE verification_attempt SET nextSendAt=0").run();
  const corrected = await invoke("correctEmail", {
    email: "correct@example.com",
    password: "abc123",
  });
  expect(await corrected.json()).toMatchObject({
    result: { data: { status: "sent", pendingEmail: "correct@example.com" } },
  });
  expect(emails.at(-1)?.to).toBe("correct@example.com");
  const link = new URL(
    emails
      .at(-1)!
      .text.split("\n")
      .find(line => line.startsWith("http"))!,
  );
  const token = link.searchParams.get("token");
  const confirmed = await invoke("confirmEmail", { code: token });
  expect(await confirmed.json()).toMatchObject({
    result: { data: { status: "confirmed", email: "correct@example.com" } },
  });
  expect(
    await (await invoke("confirmEmail", { code: token })).json(),
  ).toMatchObject({ result: { data: { status: "error" } } });
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers },
  );
  expect(await session.json()).toMatchObject({
    result: {
      data: { user: { email: "correct@example.com", emailVerified: true } },
    },
  });
});

test("verification delivery failure preserves the new account and signed session", async () => {
  const worker = await start();
  const created = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-up/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({
        email: "delivery-failed@example.com",
        password: "abc123",
      }),
    },
  );
  expect(created.status).toBe(200);
  expect(await created.json()).toMatchObject({
    verification: { status: "error" },
  });
  const cookie = created.headers
    .getSetCookie()
    .find(value => value.startsWith("session="))
    ?.split(";")[0];
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers: { cookie: cookie! } },
  );
  expect(await session.json()).toMatchObject({
    result: { data: { status: "valid", user: { emailVerified: false } } },
  });
});

test("an active durable authority admits authentication without any outbound request", async () => {
  const worker = await start();
  const response = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-up/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({
        email: "admitted@example.com",
        password: "abc123",
      }),
    },
  );
  expect(response.status).toBe(200);
  expect(unexpectedOutboundRequests).toEqual([]);
});
