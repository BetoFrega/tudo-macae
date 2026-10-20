import { vi } from "vitest";
import {
  createWwwOriginRouter,
  type WwwOriginLogEvent,
} from "@tudomacae/www-origin-routing/router";

export const browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36";
export const workerVersion = "0123abcd-0000-4000-8000-000000000000";

/** A response the Web application rendered, stamped like `web-worker/workerVersion.ts` does. */
export function webApplication(body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-terms-worker-version", workerVersion);
  return new Response(body, { ...init, headers });
}

export function harness(web?: (request: Request) => Promise<Response>) {
  const fetchWebWorker = vi.fn(web ?? (async (request: Request) => webApplication(`worker ${new URL(request.url).pathname}`, {
    headers: { "content-type": "text/html" },
  })));
  const log = vi.fn<(event: WwwOriginLogEvent) => void>();
  return { fetchWebWorker, log, router: createWwwOriginRouter({ fetchWebWorker, log }) };
}

export function visit(path: string, headers: Record<string, string> = {}, init: RequestInit = {}) {
  return new Request(`https://www.tudomacae.com.br${path}`, {
    ...init,
    headers: { "user-agent": browser, "accept": "text/html,application/xhtml+xml", ...headers },
  });
}
