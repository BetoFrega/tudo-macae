import { expect, test } from "vitest";
import { start, serviceToken, restartRuntime, authenticationDatabase } from "./authenticationRuntimeHarness";

test("atomic throttling survives concurrent calls, forged forwarding headers and Worker recovery", async () => {
  const worker = await start();
  const request = (forwarded: string) => worker.dispatchFetch(
    "http://authentication.test/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json", "origin": "http://authentication.test",
        "cf-connecting-ip": "198.51.100.14", "x-forwarded-for": forwarded,
      },
      body: JSON.stringify({ email: "missing@example.com", password: "abc123" }),
    },
  );
  const attempts = await Promise.all(Array.from({ length: 12 }, (_, i) => request(`203.0.113.${i + 1}`)));
  expect(attempts.filter(response => response.status === 401)).toHaveLength(3);
  const refused = attempts.filter(response => response.status === 429);
  expect(refused).toHaveLength(9);
  expect(Number(refused[0].headers.get("x-retry-after"))).toBeGreaterThan(0);
  expect(refused[0].headers.get("cache-control")).toBe("private, no-store");
  const database = await authenticationDatabase();
  const rows = await database.prepare("SELECT key,count FROM authentication_rate_limit").all<{ key: string; count: number }>();
  expect(rows.results).toHaveLength(2);
  expect(rows.results.every(row => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
  expect(rows.results.map(row => row.count).sort((a, b) => a - b)).toEqual([3, 12]);
  await worker.dispose();
  const runtime = restartRuntime();
  const replay = await runtime.dispatchFetch("http://authentication.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://authentication.test", "cf-connecting-ip": "198.51.100.14" },
    body: JSON.stringify({ email: "missing@example.com", password: "abc123" }),
  });
  expect(replay.status).toBe(429);
  const restored = await authenticationDatabase();
  await restored.prepare("UPDATE authentication_rate_limit SET expiresAt=0").run();
  const afterExpiry = await runtime.dispatchFetch("http://authentication.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://authentication.test", "cf-connecting-ip": "198.51.100.14" },
    body: JSON.stringify({ email: "missing@example.com", password: "abc123" }),
  });
  expect(afterExpiry.status).toBe(401);
});

test("separate accounts behind one proxy retain independent limits while distributed attempts share the account limit", async () => {
  const worker = await start();
  const login = (email: string, ip = "198.51.100.20") => worker.dispatchFetch("http://authentication.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://authentication.test", "cf-connecting-ip": ip },
    body: JSON.stringify({ email, password: "abc123" }),
  });
  for (let i = 0; i < 4; i++)
    expect((await login(`independent-${i}@example.com`)).status).toBe(401);
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => login("target@example.com", `203.0.113.${i + 1}`)));
  expect(attempts.filter(response => response.status === 401)).toHaveLength(3);
  expect(attempts.filter(response => response.status === 429)).toHaveLength(5);
});

test("rotating account addresses cannot bypass the shared network ceiling", async () => {
  const worker = await start();
  const attempts = await Promise.all(Array.from({ length: 101 }, (_, i) => worker.dispatchFetch("http://authentication.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "http://authentication.test", "cf-connecting-ip": "198.51.100.30" },
    body: JSON.stringify({ email: `invalid-${i}`, password: "abc123" }),
  })));
  expect(attempts.filter(response => response.status === 400)).toHaveLength(100);
  expect(attempts.filter(response => response.status === 429)).toHaveLength(1);
});

test("authenticated proxy addresses isolate network limits and reject forged assertions", async () => {
  const worker = await start();
  const bearer = await serviceToken();
  const login = (i: number, clientIp: string, token = bearer) => worker.dispatchFetch("http://authentication.test/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json", "origin": "http://authentication.test",
      "cf-connecting-ip": "198.51.100.40", "x-authentication-client-ip": clientIp,
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ email: `invalid-${i}`, password: "abc123" }),
  });
  const attempts = await Promise.all(Array.from({ length: 101 }, (_, i) => login(i, "203.0.113.40")));
  expect(attempts.filter(response => response.status === 429)).toHaveLength(1);
  expect((await login(102, "203.0.113.41")).status).toBe(400);
  expect((await login(103, "203.0.113.42", "forged")).status).toBe(401);
  expect((await login(104, "203.0.113.42", await serviceToken({ audience: "https://other-api.test" }))).status).toBe(401);
  expect((await login(105, "203.0.113.42", await serviceToken({ email: "other@test.iam.gserviceaccount.com" }))).status).toBe(401);
  expect((await login(106, "arbitrary")).status).toBe(401);
});
