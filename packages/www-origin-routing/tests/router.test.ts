import { describe, expect, test } from "vitest";
import { harness, visit, webApplication, workerVersion } from "./routerFixture";

describe("www is served by the Web Worker", () => {
  test("documents, resources, writes and actions of any build keep method, body and cookies", async () => {
    const { router, fetchWebWorker, log } = harness(async request => webApplication(`${request.method} ${await request.text()}`));
    const requests = [
      visit("/noticias", { cookie: "session=a" }),
      visit("/favicon.ico", { accept: "image/*" }),
      visit("/api/navegacao-publica", { accept: "application/json" }),
      visit("/_next/static/chunks/old.js", { accept: "*/*" }),
      visit("/anuncio/1/carro", { "x-rsc-action": "abc123#createAd" }, { method: "POST", body: "[]" }),
      visit("/anuncio/1/carro", { "next-action": "7f".repeat(21) }, { method: "POST", body: "[1]" }),
      visit("/api/autenticacao/sessao", {}, { method: "DELETE" }),
    ];
    const bodies = [];
    for (const request of requests) {
      const response = await router.fetch(request);
      expect(response.headers.get("x-www-origin")).toBe("terms-workers");
      bodies.push(await response.text());
    }
    expect(bodies[5]).toBe("POST [1]");
    expect(fetchWebWorker).toHaveBeenCalledTimes(requests.length);
    const forwarded = fetchWebWorker.mock.calls.map(([request]) => request);
    expect(forwarded[0]!.headers.get("cookie")).toBe("session=a");
    expect(log.mock.calls.map(([event]) => event.requestClass)).toEqual(["document", "other", "other", "asset", "action", "action", "other"]);
    expect(log.mock.calls.every(([event]) => event.outcome === "success" && event.selectedOrigin === "terms-workers")).toBe(true);
  });

  test("the application's status and Cache-Control pass through, unstamped public files included", async () => {
    const { router, log } = harness(async request => new URL(request.url).pathname === "/favicon.ico"
      ? new Response("icon", { headers: { "cache-control": "public, max-age=0, must-revalidate" } })
      : webApplication(null, { status: 404, headers: { "cache-control": "private, no-store" } }));
    const icon = await router.fetch(visit("/favicon.ico"));
    expect(await icon.text()).toBe("icon");
    expect(icon.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const missing = await router.fetch(visit("/pagina-que-nao-existe"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    expect(log.mock.calls.at(-1)![0]).toMatchObject({ outcome: "success", statusClass: "4xx", termsWorkerVersion: workerVersion });
  });

  test("an application 5xx is a failure, and a lost write answers 502 without a retry", async () => {
    const { router, fetchWebWorker, log } = harness(async () => webApplication(null, { status: 503 }));
    expect((await router.fetch(visit("/noticias"))).status).toBe(503);
    expect(log.mock.calls.at(-1)![0]).toMatchObject({ failure: "terms-worker-unavailable", outcome: "failure", statusClass: "5xx" });
    fetchWebWorker.mockRejectedValue(new Error("Bearer secret; private content"));
    const lost = await router.fetch(visit("/anuncio/1/carro", { "x-rsc-action": "abc#save", "cf-ray": "8f1e2d3c4b5a6978-GRU" }, { method: "POST", body: "private-content" }));
    expect(lost.status).toBe(502);
    expect(lost.headers.get("cache-control")).toBe("no-store");
    expect(lost.headers.get("x-correlation-id")).toBe("8f1e2d3c4b5a6978-GRU");
    expect(fetchWebWorker).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.at(-1)![0]).toEqual({
      failure: "terms-worker-unavailable", outcome: "failure", requestClass: "action",
      requestId: "8f1e2d3c4b5a6978-GRU", selectedOrigin: "terms-workers", statusClass: "5xx", uncertainWrite: true,
    });
    await router.fetch(visit("/noticias"));
    expect(log.mock.calls.at(-1)![0].uncertainWrite).toBeUndefined();
  });

  test("versioned assets of a release the Worker no longer holds answer 502", async () => {
    const { router, fetchWebWorker, log } = harness(async () => new Response("javascript"));
    const assetPath = `/_terms-workers/${"a".repeat(40)}/_next/static/chunks/abc.js`;
    expect((await router.fetch(visit(assetPath))).headers.get("x-www-origin")).toBe("terms-workers");
    fetchWebWorker.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await router.fetch(visit(assetPath))).status).toBe(502);
    fetchWebWorker.mockRejectedValueOnce(new Error("network"));
    expect((await router.fetch(visit(assetPath))).status).toBe(502);
    expect(log.mock.calls.at(-1)![0]).toMatchObject({ outcome: "failure", failure: "terms-worker-unavailable", requestClass: "asset" });
  });

  test("the first infrastructure boundary owns a correlation ID even without a Cloudflare ray", async () => {
    const { fetchWebWorker, log, router } = harness();
    const response = await router.fetch(visit("/", { "x-www-request-id": "ffffffff-0000-4000-8000-000000000001" }));
    const rootId = fetchWebWorker.mock.calls[0]![0].headers.get("x-www-request-id");
    expect(rootId).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u);
    expect(rootId).not.toBe("ffffffff-0000-4000-8000-000000000001");
    expect(fetchWebWorker.mock.calls[0]![0].headers.get("x-correlation-id")).toBe(rootId);
    expect(response.headers.get("x-correlation-id")).toBe(rootId);
    expect(log.mock.calls[0]![0]).toMatchObject({ requestId: rootId });
  });
});

describe("other hosts never reach the application", () => {
  test("the retired machine host answers 404 at the edge without storage", async () => {
    const { router, fetchWebWorker, log } = harness();
    for (const request of [
      new Request("https://mcp.tudomacae.com.br/mcp", { method: "POST", headers: { authorization: "Bearer session" }, body: "{}" }),
      new Request("https://mcp.tudomacae.com.br/tools/v1"),
      new Request("https://mcp.tudomacae.com.br/sessions/v1", { method: "DELETE" }),
    ]) {
      const response = await router.fetch(request);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-www-origin")).toBe("edge");
    }
    expect(fetchWebWorker).not.toHaveBeenCalled();
    expect(log.mock.calls.every(([event]) => event.requestClass === "editorial" && event.statusClass === "4xx")).toBe(true);
  });

  test("an unknown host, or the workers.dev host, answers 404", async () => {
    const { router, fetchWebWorker } = harness();
    expect((await router.fetch(new Request("https://tudomacae.com.br/"))).status).toBe(404);
    expect((await router.fetch(new Request("https://tudo-macae-www-origin-production.frega.workers.dev/noticias"))).status).toBe(404);
    expect(fetchWebWorker).not.toHaveBeenCalled();
  });
});
