import { workerVersionHeader } from "@tudomacae/www-origin-routing/contract";

type FetchHandler = { fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Response | Promise<Response> };

/** The router logs which Worker version answered a journey (`packages/www-origin-routing/lib/webWorker.ts`). */
export function withWorkerVersion<Handler extends FetchHandler>(handler: Handler): Handler {
  return {
    ...handler,
    async fetch(request, env, ctx) {
      const response = await handler.fetch(request, env, ctx);
      const metadata = env.CF_VERSION_METADATA;
      const version = metadata && typeof metadata === "object" && "id" in metadata ? metadata.id : undefined;
      if (typeof version !== "string" || !version) return response;
      const headers = new Headers(response.headers);
      headers.set(workerVersionHeader, version);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
