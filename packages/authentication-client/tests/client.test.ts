import { expect, test } from "vitest";
import { createAuthenticationClient } from "../client";

test("an unavailable new authority fails closed instead of supplying a legacy session", async () => {
  const client = createAuthenticationClient({
    origin: "https://api.example.com",
    publicOrigin: "https://www.example.com",
    request: async () => new Response(null, { status: 503 }),
  });
  await expect(client.session("signed-session")).rejects.toThrow(
    "Authentication authority unavailable",
  );
});

test("the controlled boundary propagates correlation and rejects incompatible responses", async () => {
  const correlation = crypto.randomUUID();
  const observed: Headers[] = [];
  const client = createAuthenticationClient({
    origin: "https://api.example.com",
    publicOrigin: "https://www.example.com",
    request: async (_url, options) => {
      observed.push(new Headers(options?.headers));
      return new Response(null, {
        headers: { "x-authentication-protocol": "2" },
      });
    },
  });
  await expect(
    client.request("/api/auth/get-session", {
      headers: new Headers({ "x-request-id": correlation }),
    }),
  ).rejects.toThrow("protocol incompatible");
  expect(observed[0].get("x-request-id")).toBe(correlation);
  expect(observed[0].get("x-authentication-protocol")).toBe("1");
});

test("the remote boundary forwards only its session cookie", async () => {
  let forwarded: string | null = null;
  const client = createAuthenticationClient({ origin: "https://api.example.com", publicOrigin: "https://www.example.com", request: async (_url, options) => {
    forwarded = new Headers(options?.headers).get("cookie");
    return new Response(null, { headers: { "x-authentication-protocol": "1" } });
  } });
  await client.request("/api/auth/get-session", { headers: new Headers({ cookie: "analytics=unrelated; verification-refresh=old-provider-credential; session=current-credential; preferences=unrelated" }) });
  expect(forwarded).toBe("session=current-credential");
});
