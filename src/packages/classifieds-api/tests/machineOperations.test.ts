import { afterEach, expect, test, vi } from "vitest";

vi.mock("@tudomacae/authentication-client/server", () => ({ serviceIdentityToken: async () => "disposable-service-token" }));
vi.mock("next/headers.js", () => ({ cookies: async () => ({ get: () => ({ value: "disposable-session" }) }) }));
import { offeringCatalog } from "../offerings";
import { createClassifiedsMachineOperations } from "../index";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("identity operations use the Worker with server identity and preserve opaque confirmation", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "http://authentication.test");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.tudomacae.com.br");
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push(new Request(url, init));
    return Response.json({ result: { data: { worker: true } } }, { headers: { "x-classifieds-protocol": "1" } });
  });
  const operations = createClassifiedsMachineOperations({ actorId: "admin", correlationId: "1234567890abcdef-GRU" });
  const input = { id: "profile", actorId: "admin", channel: "mcp" as const };
  await expect(operations.previewAdvertiserIdentityDeletionUseCase(input)).resolves.toEqual({ worker: true });
  const removal = { ...input, reason: "Remoção", confirmedTitle: "Perfil", idempotencyKey: "delete", confirmationToken: "proof" };
  await expect(operations.deleteAdvertiserIdentityUseCase(removal)).resolves.toEqual({ worker: true });
  expect(requests.map(request => request.headers.get("x-classifieds-actor"))).toEqual(["admin", "admin"]);
  expect(requests[0]?.headers.get("x-request-id")).toBe("1234567890abcdef-GRU");
  expect(await requests[1]?.json()).toEqual({ operation: "profiles.identity.delete", input: removal });
});

test("the offering catalog preserves request correlation and omits administrative sources from operational logs", async () => {
  vi.stubEnv("AUTHENTICATION_API_URL", "http://authentication.test");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.tudomacae.com.br");
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  let requestId: string | null = null;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    requestId = new Headers(init.headers).get("x-request-id");
    return Response.json({ result: { data: { revision: 1, enabled: false, items: [] } } }, { headers: { "x-classifieds-protocol": "1" } });
  });
  await offeringCatalog.saveItem({ businessId: "profile", expectedRevision: 0, actor: { id: "owner", admin: true }, item: { name: "Consulta", price: { mode: "on_request" }, sourceUrl: "https://private-source.test" } });
  expect(logs.mock.calls).toHaveLength(1);
  const event = JSON.parse(String(logs.mock.calls[0]?.[0]));
  expect(event).toMatchObject({ event: "business_offering_catalog_operation", operation: "save", requestId, correlationId: requestId, outcome: "success" });
  expect(JSON.stringify(event)).not.toContain("private-source.test");
  expect(JSON.stringify(event)).not.toContain("Consulta");
});
