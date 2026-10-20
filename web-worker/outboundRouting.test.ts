import { expect, test, vi } from "vitest";
import { createRuntimeIdentityReader } from "@tudomacae/authentication-client/runtime-identity";
import { bindingIdentityToken, routeOutboundFetch } from "./outboundRouting";

const metadata = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

function setup() {
  const original = vi.fn<typeof fetch>().mockResolvedValue(new Response("network"));
  const api = { fetch: vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(new Response("api")) };
  const routed = routeOutboundFetch(original, {
    AUTHENTICATION_API_URL: "https://api.example",
    SITE_SEARCH_URL: "https://search.example",
    API: api,
  });
  return { original, api, routed };
}

test("sends calls to a bound origin through its binding without the marker token", async () => {
  const { original, api, routed } = setup();
  const token = await (await routed(`${metadata}?audience=https%3A%2F%2Fapi.example&format=full`)).text();
  expect(token).toBe(bindingIdentityToken);

  await routed("https://api.example/api/trpc/session", {
    headers: { "authorization": `Bearer ${token}`, "x-request-id": "r1" },
  });
  const request = api.fetch.mock.calls[0]![0];
  expect(request.url).toBe("https://api.example/api/trpc/session");
  expect(request.headers.has("authorization")).toBe(false);
  expect(request.headers.get("x-request-id")).toBe("r1");
  expect(original).not.toHaveBeenCalled();
});

test("leaves unbound origins and their identity requests on the network", async () => {
  const { original, api, routed } = setup();
  await routed(`${metadata}?audience=https%3A%2F%2Fsearch.example&format=full`);
  await routed("https://search.example/search", { method: "POST" });
  await routed(new URL("https://elsewhere.example/"));
  expect(original).toHaveBeenCalledTimes(3);
  expect(api.fetch).not.toHaveBeenCalled();
});

test("keeps a real bearer token on a bound call", async () => {
  const { api, routed } = setup();
  await routed(new Request("https://api.example/x", { headers: { authorization: "Bearer user-supplied" } }));
  expect(api.fetch.mock.calls[0]![0].headers.get("authorization")).toBe("Bearer user-supplied");
});

test("answers the runtime identity reader with a token it accepts", async () => {
  const { original, routed } = setup();
  const reader = createRuntimeIdentityReader({ fetch: routed });
  await expect(reader.read("https://api.example")).resolves.toBe(bindingIdentityToken);
  expect(original).not.toHaveBeenCalled();
});
