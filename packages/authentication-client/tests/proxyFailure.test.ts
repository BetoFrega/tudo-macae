import { expect, test } from "vitest";
import { createAuthenticationClient } from "../client";

test("only a response-owning proxy forwards compatible unavailable responses quietly", async () => {
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    request: async () => Response.json({ error: "Unavailable" }, {
      status: 503, headers: { "x-authentication-protocol": "1" },
    }),
  });
  await expect(client.request("/api/auth/get-session")).rejects.toThrow("Authentication authority unavailable");
  expect((await client.request("/api/auth/get-session", { forwardUnavailable: true })).status).toBe(503);
});

test("a proxy still refuses incompatible unavailable responses", async () => {
  const client = createAuthenticationClient({
    origin: "https://api.test", publicOrigin: "https://www.test",
    request: async () => new Response(null, { status: 503 }),
  });
  await expect(client.request("/api/auth/get-session", { forwardUnavailable: true })).rejects.toThrow("Authentication protocol incompatible");
});
