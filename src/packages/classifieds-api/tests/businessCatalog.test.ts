import { afterEach, beforeEach, expect, test, vi } from "vitest";

const session = vi.hoisted(() => ({ owner: false }));
vi.mock("next/headers.js", () => ({ cookies: vi.fn(() => {
  if (!session.owner) throw new Error("public catalog reads never read the session");
  return { get: (name: string) => name === "session" ? { value: "owner-session" } : undefined };
}) }));
import { assessBusinessUseCase, assessBusinessesUseCase, listBusinessesUseCase } from "..";

const profile = { id: "profile", title: "Negócio", description: "", createdAt: 1, updatedAt: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  session.owner = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureWorker() {
  vi.stubEnv("AUTHENTICATION_API_URL", "http://localhost:8787");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "http://localhost:3000");
}

function workerReturns(data: unknown) {
  const fetch = vi.fn().mockResolvedValue(Response.json({ result: { data } }, { headers: { "x-classifieds-protocol": "1" } }));
  vi.stubGlobal("fetch", fetch);
  return Object.assign(() => {
    const request = new URL(String(fetch.mock.calls[0]![0]));
    return JSON.parse(request.searchParams.get("input")!) as unknown;
  }, { headers: () => new Headers((fetch.mock.calls[0]![1] as RequestInit).headers) });
}

test("serves the Business catalog from the API Worker without a session", async () => {
  configureWorker();
  const sent = workerReturns({ items: [{ id: "new-business" }] });
  expect(await listBusinessesUseCase({ categoryId: "category", cursor: "next" })).toEqual({ items: [{ id: "new-business" }] });
  expect(sent()).toEqual({ operation: "business.list", input: { categoryId: "category", cursor: "next" } });
});

test("assesses owner profiles by id under the owner's session", async () => {
  configureWorker();
  session.owner = true;
  const sent = workerReturns([{ business: null, missing: ["contact"] }]);
  expect(await assessBusinessUseCase(profile)).toEqual({ business: null, missing: ["contact"] });
  expect(sent()).toEqual({ operation: "business.assessOwned", input: { ids: ["profile"] } });
  expect([...sent.headers().values()].join(" ")).toContain("owner-session");
});

test("assesses more than 100 owner profiles in bounded batches", async () => {
  configureWorker();
  session.owner = true;
  const fetch = vi.fn(async (url: string | URL) => {
    const { input } = JSON.parse(new URL(String(url)).searchParams.get("input")!) as { input: { ids: string[] } };
    return Response.json({ result: { data: input.ids.map(id => ({ business: null, missing: [id] })) } }, { headers: { "x-classifieds-protocol": "1" } });
  });
  vi.stubGlobal("fetch", fetch);
  const profiles = Array.from({ length: 150 }, (_, index) => ({ ...profile, id: `p${index}` }));
  const readiness = await assessBusinessesUseCase(profiles);
  expect(readiness.map(item => item.missing[0])).toEqual(profiles.map(item => item.id));
  expect(fetch).toHaveBeenCalledTimes(2);
});
