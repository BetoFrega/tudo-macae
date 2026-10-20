import { afterEach, expect, test, vi } from "vitest";
import { readBrowserSession, readBrowserSessionAfterMutation, ReportedSessionFailure, SessionSynchronizationFailure } from "./readBrowserSession";

const fetchSession = vi.fn<typeof fetch>();
const currentUser = { uid: "u1", emailVerified: true, isAdmin: true, isEditor: false };
afterEach(() => vi.unstubAllGlobals());

test("reads fresh session data without a body or Server Action identifier", async () => {
  vi.stubGlobal("fetch", fetchSession);
  fetchSession.mockResolvedValueOnce(Response.json(currentUser));
  expect(await readBrowserSession("operation-1")).toEqual(currentUser);
  expect(fetchSession).toHaveBeenLastCalledWith("/api/autenticacao/sessao", {
    method: "GET", credentials: "same-origin", cache: "no-store",
    headers: { "x-session-operation-id": "operation-1" },
  });
});
test("reports an absent session as null", async () => {
  vi.stubGlobal("fetch", fetchSession);
  fetchSession.mockResolvedValueOnce(Response.json(null));
  expect(await readBrowserSession("operation-2")).toBeNull();
});
test.each([[503, "1", true], [503, null, false], [502, "1", false]])("recognizes only explicitly server-reported failures (%s, %s)", async (status, marker, reported) => {
  vi.stubGlobal("fetch", fetchSession);
  fetchSession.mockResolvedValueOnce(new Response(null, { status, headers: marker ? { "x-session-error-reported": marker } : {} }));
  const failure = await readBrowserSession("operation-4").catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof ReportedSessionFailure).toBe(reported);
});
test.each([
  ["http_status", 503, () => Response.json({ error: "private" }, { status: 503 })],
  ["http_status", 401, () => new Response(null, { status: 401 })],
  ["response_decode", 200, () => new Response("[")],
  ["invalid_response", 200, () => Response.json({ uid: "u1" })],
  ["invalid_response", 200, () => Response.json({ ...currentUser, email: 1 })],
])("classifies a %s failure with HTTP status %s instead of publishing a session", async (category, httpStatus, response) => {
  vi.stubGlobal("fetch", fetchSession);
  fetchSession.mockResolvedValueOnce(response());
  const failure = await readBrowserSession("operation-3").catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SessionSynchronizationFailure);
  expect(failure).toMatchObject({ category, httpStatus });
});
test("classifies a rejected request as a transport failure without an HTTP status", async () => {
  vi.stubGlobal("fetch", fetchSession);
  const cause = new TypeError("Failed to fetch");
  fetchSession.mockRejectedValueOnce(cause);
  const failure = await readBrowserSessionAfterMutation("operation-5").catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SessionSynchronizationFailure);
  expect(failure).toMatchObject({ category: "transport", httpStatus: undefined, cause });
});
test.each([
  new TypeError("private network failure"),
  new DOMException("private cancellation", "AbortError"),
])("classifies a failed response body as transport and retains the HTTP status (%s)", async (cause) => {
  vi.stubGlobal("fetch", fetchSession);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{\"uid\":"));
      controller.error(cause);
    },
  });
  fetchSession.mockResolvedValueOnce(new Response(body, { status: 200 }));
  const failure = await readBrowserSession("operation-6").catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SessionSynchronizationFailure);
  expect(failure).toMatchObject({ category: "transport", httpStatus: 200, cause });
});
