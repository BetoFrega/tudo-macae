import { expect, test } from "vitest";
import z from "zod";
import { start, serviceToken, authenticationDatabase } from "./authenticationRuntimeHarness";

test("creates an account with the existing six-character password and reads the same session", async () => {
  const worker = await start();
  const created = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-up/email",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({ email: "new@example.com", password: "abc123" }),
    },
  );
  expect(created.status).toBe(200);
  const value = z
    .object({ user: z.object({ id: z.string() }) })
    .parse(await created.json());
  const cookie = created.headers
    .getSetCookie()
    .find(value => value.startsWith("session="))
    ?.split(";")[0];
  expect(cookie).toBeDefined();
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers: { cookie: cookie! } },
  );
  expect(session.headers.get("cache-control")).toBe("private, no-store");
  expect(await session.json()).toMatchObject({
    result: {
      data: {
        status: "valid",
        user: {
          uid: value.user.id,
          emailVerified: false,
          isAdmin: false,
          isEditor: false,
        },
      },
    },
  });
});

test("the service caller can read identity but cannot grant a role or impersonate a user", async () => {
  const worker = await start(false);
  const { importAuthenticationAccounts } = await import("../migration");
  await importAuthenticationAccounts(await authenticationDatabase(), [
    {
      uid: "editor",
      email: "editor@example.com",
      emailVerified: true,
      disabled: true,
      claims: { editor: true, other: "retained" },
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
  const target = "http://authentication.test/internal/identities/editor";
  expect((await worker.dispatchFetch(target)).status).toBe(401);
  expect(
    (
      await worker.dispatchFetch(target, {
        headers: { authorization: "Bearer pat-untrusted" },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await worker.dispatchFetch(target, {
        headers: {
          authorization: `Bearer ${await serviceToken({ email: "other@test.iam.gserviceaccount.com" })}`,
        },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await worker.dispatchFetch(target, {
        headers: {
          authorization: `Bearer ${await serviceToken({ audience: "https://other-api.test" })}`,
        },
      })
    ).status,
  ).toBe(401);
  const headers = { authorization: `Bearer ${await serviceToken()}` };
  const identity = await worker.dispatchFetch(target, { headers });
  expect(identity.status).toBe(200);
  expect(await identity.json()).toMatchObject({
    uid: "editor",
    disabled: true,
    claims: { editor: true, other: "retained" },
  });
  expect(
    (
      await worker.dispatchFetch(target, {
        method: "PUT",
        headers,
        body: JSON.stringify({ admin: true }),
      })
    ).status,
  ).toBe(405);
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers },
  );
  expect(await session.json()).toMatchObject({
    result: { data: { status: "missing" } },
  });
});

test("disabled accounts cannot log in or retain an existing session", async () => {
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
        email: "disabled@example.com",
        password: "abc123",
      }),
    },
  );
  const user = z
    .object({ user: z.object({ id: z.string() }) })
    .parse(await response.json());
  const cookie = response.headers
    .getSetCookie()
    .find(value => value.startsWith("session="))
    ?.split(";")[0];
  await (
    await authenticationDatabase()
  )
    .prepare("UPDATE user SET disabled = 1 WHERE id = ?")
    .bind(user.user.id)
    .run();
  const login = await worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-in/email",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://authentication.test",
      },
      body: JSON.stringify({
        email: "disabled@example.com",
        password: "abc123",
      }),
    },
  );
  expect(login.status).toBe(403);
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers: { cookie: cookie! } },
  );
  expect(await session.json()).toMatchObject({
    result: { data: { status: "invalid" } },
  });
});

test("role administration keeps unrelated claims and revokes sessions on removal", async () => {
  const worker = await start();
  async function signup(email: string) {
    const response = await worker.dispatchFetch(
      "http://authentication.test/api/auth/sign-up/email",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": "http://authentication.test",
        },
        body: JSON.stringify({ email, password: "abc123" }),
      },
    );
    return {
      uid: z
        .object({ user: z.object({ id: z.string() }) })
        .parse(await response.json()).user.id,
      cookie: response.headers
        .getSetCookie()
        .find(value => value.startsWith("session="))!
        .split(";")[0],
    };
  }
  const admin = await signup("admin@example.com");
  const target = await signup("target@example.com");
  const database = await authenticationDatabase();
  await database
    .prepare("UPDATE user SET claims=? WHERE id=?")
    .bind(JSON.stringify({ admin: true }), admin.uid)
    .run();
  await database
    .prepare("UPDATE user SET claims=? WHERE id=?")
    .bind(JSON.stringify({ editor: true, retained: "yes" }), target.uid)
    .run();
  const mutate = (cookie: string, patch: unknown) =>
    worker.dispatchFetch("http://authentication.test/api/trpc/updateRoles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://authentication.test",
        cookie,
      },
      body: JSON.stringify({ uid: target.uid, patch }),
    });
  expect((await mutate(target.cookie, { admin: true })).status).toBe(403);
  const granted = await Promise.all([
    mutate(admin.cookie, { admin: true }),
    mutate(admin.cookie, { editor: true }),
  ]);
  expect(granted.every(response => response.ok)).toBe(true);
  expect(
    JSON.parse(
      (await database
        .prepare("SELECT claims FROM user WHERE id=?")
        .bind(target.uid)
        .first<{ claims: string }>())!.claims,
    ),
  ).toEqual({ admin: true, editor: true, retained: "yes" });
  expect((await mutate(admin.cookie, { editor: false })).status).toBe(200);
  const session = await worker.dispatchFetch(
    "http://authentication.test/api/trpc/session",
    { headers: { cookie: target.cookie } },
  );
  expect(await session.json()).toMatchObject({
    result: { data: { status: "invalid" } },
  });
  expect(
    (
      await worker.dispatchFetch(
        "http://authentication.test/api/trpc/listUsers",
        { headers: { cookie: admin.cookie } },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await worker.dispatchFetch(
        "http://authentication.test/api/trpc/listUsers",
        { headers: { authorization: `Bearer ${await serviceToken()}` } },
      )
    ).status,
  ).toBe(403);
});
