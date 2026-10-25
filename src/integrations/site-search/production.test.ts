import { afterEach, expect, test, vi } from "vitest";
import { searchSite } from "./production";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("logs one site_search line with the outcome and never the query or its results", async () => {
  // A loopback provider skips the runtime identity, so the provider call is the only fetch.
  vi.stubEnv("SITE_SEARCH_URL", "http://127.0.0.1:4555");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({
    durationMs: 12,
    chunks: [{
      key: "https://www.tudomacae.com.br/negocio/b1/padaria-secreta",
      title: "Padaria Secreta",
      text: "Pães da consulta privada.",
    }],
  })));
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await searchSite("consulta privada", "businesses");

  expect(response).toMatchObject({ outcome: "results", results: [{ title: "Padaria Secreta" }] });
  expect(error).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledOnce();
  const [line] = info.mock.calls[0] as [string];
  expect(JSON.parse(line)).toMatchObject({
    severity: "INFO",
    event: "site_search",
    route: "/busca",
    outcome: "results",
    filter: "businesses",
    resultCount: 1,
    providerDurationMs: 12,
  });
  expect(line).not.toMatch(/consulta|privada|secreta|negocio\//iu);
});
