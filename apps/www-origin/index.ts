import { createWwwOriginRouter } from "@tudomacae/www-origin-routing/router";
import { createRoutingTelemetry } from "./adapters/analytics";

const routers = new WeakMap<Env, ReturnType<typeof createWwwOriginRouter>>();

function originRouter(env: Env) {
  const existing = routers.get(env);
  if (existing) return existing;
  const router = createWwwOriginRouter({
    fetchWebWorker: forwarded => env.WEB_WORKER.fetch(forwarded),
    edgeCache: caches.default,
    log: createRoutingTelemetry({
      release: env.CF_VERSION_METADATA.id,
      environment: env.WORKERS_ENVIRONMENT,
      log: message => console.log(message),
      writeDataPoint: point => env.WWW_ORIGIN_SIGNALS.writeDataPoint(point),
    }),
  });
  routers.set(env, router);
  return router;
}

export default {
  fetch(request, env, context) {
    return originRouter(env).fetch(request, context);
  },
} satisfies ExportedHandler<Env>;
