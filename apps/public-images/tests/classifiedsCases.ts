import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { startProductionRuntime } from "./runtimeFixture";

const classifiedsOrigin = "https://classifieds.test";
const image = () => new Response(readFileSync(new URL("../../../public/favicon-32x32.png", import.meta.url)), { headers: { "content-type": "image/png" } });

export function registerClassifiedsCases(): void {
  test("production serves Ad photos from the Classifieds origin and warm hits make no outbound request", async () => {
    const outbound: string[] = [];
    const runtime = startProductionRuntime(classifiedsOrigin, (request) => {
      outbound.push(request.url);
      return image();
    }, []);
    try {
      const url = "https://images.tudomacae.com.br/v1/ad/card/750/ad-images%2Fad-1%2Fproduction.webp";
      const cold = await runtime.dispatchFetch(url, { headers: { accept: "image/webp" } });
      expect(cold.status).toBe(200);
      expect(cold.headers.get("x-image-cache")).toBe("miss");
      expect(outbound).toHaveLength(1);
      const source = new URL(outbound[0]!);
      expect(source.origin).toBe(classifiedsOrigin);
      expect(source.pathname).toBe("/api/classifieds/photos/public/ad-images%2Fad-1%2Fproduction.webp");

      const warm = await runtime.dispatchFetch(url, { headers: { accept: "image/webp" } });
      expect(warm.status).toBe(200);
      expect(warm.headers.get("x-image-cache")).toBe("hit");
      expect(outbound).toHaveLength(1);
    }
    finally { await runtime.dispose(); }
  });

  test("production serves the historical Profile alias from the Classifieds origin", async () => {
    const outbound: string[] = [];
    const runtime = startProductionRuntime(classifiedsOrigin, (request) => {
      outbound.push(request.url);
      return image();
    }, []);
    try {
      const response = await runtime.dispatchFetch("https://images.tudomacae.com.br/v1/remaining/profile/avatar/128/profile-photos%2Fp-1%2Falias.webp");
      expect(response.status).toBe(200);
      expect(outbound.map(url => new URL(url).pathname)).toEqual(["/api/classifieds/photos/public/profile-photos%2Fp-1%2Falias.webp"]);
      expect(new URL(outbound[0]!).origin).toBe(classifiedsOrigin);
    }
    finally { await runtime.dispose(); }
  });

  test.each([
    ["Ad", "/v1/ad/card/750/ad-images%2Fad-1%2Fphoto.webp", "/v1/ad/:preset/:width/:key"],
    ["Profile", "/v1/profile/avatar/128/profile-photos%2Fp-1%2Fphoto.webp", "/v1/profile/:preset/:width/:key"],
    ["historical Profile", "/v1/remaining/profile/avatar/128/profile-photos%2Fp-1%2Fphoto.webp", "/v1/profile/:preset/:width/:key"],
  ].flatMap(([name, path, route]) => ["production", "qualification"].map(environment => [name, path, route, environment] as const)))
  ("%s photos fail closed without a Classifieds origin in %s", async (_name, path, route, environment) => {
    const outbound: string[] = [];
    const logs: string[] = [];
    const runtime = startProductionRuntime("", (request) => {
      outbound.push(request.url);
      return image();
    }, logs, environment);
    try {
      const response = await runtime.dispatchFetch(`https://images.tudomacae.com.br${path}`);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const requestId = response.headers.get("x-request-id");
      expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(outbound).toEqual([]);
      // Miniflare delivers structured logs after the response, later under CPU contention.
      const failure = await vi.waitFor(() => {
        const logged = logs.find(log => log.includes("classifieds_origin_missing"));
        expect(logged).toBeDefined();
        return logged;
      });
      expect(failure).toContain(requestId!);
      expect(failure).toContain(route);
    }
    finally { await runtime.dispose(); }
  });
}
