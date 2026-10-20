import { afterEach, expect, test, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createSiteSearchWorker, serveBoundRenderer } from "./index";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "google-test", alg: "RS256" }] });
const account = "runtime@example.iam.gserviceaccount.com";

function environment(search: AiSearchInstance["search"]) {
  return {
    AI_SEARCH: { search } as AiSearchInstance,
    OIDC_AUDIENCE: "https://search.test",
    OIDC_SERVICE_ACCOUNT: account,
    WORKER_VERSION: { id: "version-1" },
  } satisfies Env;
}

async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ email: account, email_verified: true, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "google-test" }).setIssuer("https://accounts.google.com")
    .setAudience("https://search.test").setSubject("123456").setIssuedAt().setExpirationTime("1h")
    .sign(privateKey);
}

async function search(env: Env, body: unknown, bearer?: string) {
  let clock = 0;
  return createSiteSearchWorker({ keys, now: () => (clock += 15) }).fetch(new Request("https://search.test/search", {
    method: "POST",
    headers: { "authorization": `Bearer ${bearer ?? await token()}`, "x-request-id": "trace-1" },
    body: JSON.stringify(body),
  }), env);
}

afterEach(() => vi.restoreAllMocks());

test("retrieves hybrid chunks without generation and returns only key, title and text", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const aiSearch = vi.fn<AiSearchInstance["search"]>().mockResolvedValue({
    search_query: "padaria",
    chunks: [
      { id: "1", type: "text", score: 0.9, text: "Pães", item: { key: "https://www.tudomacae.com.br/negocio/b1/padaria", metadata: { title: "Padaria", description: "x" } } },
      { id: "2", type: "text", score: 0.5, text: "Mais pães", item: { key: "https://www.tudomacae.com.br/negocio/b1/padaria" } },
    ],
  });

  const response = await search(environment(aiSearch), { query: "  padaria  " });
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    durationMs: 15,
    chunks: [
      { key: "https://www.tudomacae.com.br/negocio/b1/padaria", title: "Padaria", text: "Pães" },
      { key: "https://www.tudomacae.com.br/negocio/b1/padaria", text: "Mais pães" },
    ],
  });
  expect(aiSearch).toHaveBeenCalledWith({
    query: "padaria",
    ai_search_options: {
      retrieval: { retrieval_type: "hybrid", max_num_results: 50, return_on_failure: false },
      query_rewrite: { enabled: false },
      reranking: { enabled: false },
    },
  });
});

test("denies requests without the runtime identity before touching AI Search", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const aiSearch = vi.fn<AiSearchInstance["search"]>();

  for (const bearer of ["static-secret", await token({ email: "other@example.iam.gserviceaccount.com" }), await token({ email_verified: false })]) {
    expect((await search(environment(aiSearch), { query: "padaria" }, bearer)).status).toBe(401);
  }
  expect(aiSearch).not.toHaveBeenCalled();
});

test("serves the web renderer binding without a Google token", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const aiSearch = vi.fn<AiSearchInstance["search"]>().mockResolvedValue({ search_query: "padaria", chunks: [] });
  const response = await serveBoundRenderer(new Request("https://search.test/search", {
    method: "POST", body: JSON.stringify({ query: "padaria" }),
  }), environment(aiSearch));
  expect(response.status).toBe(200);
  expect(aiSearch).toHaveBeenCalledOnce();
});

test.each([{}, { query: "" }, { query: 42 }, { query: "x".repeat(201) }])("rejects the invalid query %j", async (body) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const aiSearch = vi.fn<AiSearchInstance["search"]>();

  expect((await search(environment(aiSearch), body)).status).toBe(400);
  expect(aiSearch).not.toHaveBeenCalled();
});

test("distinguishes an exhausted allowance from other provider failures", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const quota = await search(environment(vi.fn().mockRejectedValue(new Error("Daily neurons quota exceeded"))), { query: "padaria" });
  const failure = await search(environment(vi.fn().mockRejectedValue(new Error("index padaria-secreta unavailable"))), { query: "padaria secreta" });

  expect(quota.status).toBe(429);
  expect(failure.status).toBe(502);
  expect(log.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
    expect.objectContaining({ event: "site_search_worker", outcome: "quota", statusClass: "4xx", correlationId: "trace-1", release: "version-1" }),
    expect.objectContaining({ event: "site_search_worker", outcome: "provider-error", statusClass: "5xx", durationMs: 15 }),
  ]);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/padaria|secreta|neurons/u);
});

test("logs results without the query, keys or text", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await search(environment(vi.fn().mockResolvedValue({
    search_query: "oficina",
    chunks: [{ id: "1", type: "text", score: 1, text: "Motos", item: { key: "https://www.tudomacae.com.br/negocio/b2/oficina" } }],
  })), { query: "oficina" });

  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ outcome: "results", chunkCount: 1, statusClass: "2xx" });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/oficina|Motos|negocio/u);
});

test("filters by the declared result types when asked", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const aiSearch = vi.fn<AiSearchInstance["search"]>().mockResolvedValue({ search_query: "forno", chunks: [] });

  expect((await search(environment(aiSearch), { query: "forno", types: ["ad", "business"] })).status).toBe(200);
  expect(aiSearch.mock.calls[0]?.[0]).toMatchObject({
    ai_search_options: { retrieval: { filters: { search_result_type: { $in: ["ad", "business"] } } } },
  });
});

test.each([{ types: "ad" }, { types: ["ad", "admin"] }, { types: [] }])("rejects the invalid types %j", async (extra) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const aiSearch = vi.fn<AiSearchInstance["search"]>();

  expect((await search(environment(aiSearch), { query: "forno", ...extra })).status).toBe(400);
  expect(aiSearch).not.toHaveBeenCalled();
});
