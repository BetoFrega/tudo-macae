import { env } from "cloudflare:workers";
import { routeOutboundFetch } from "./outboundRouting";

// vinext's fetch cache keeps the first fetch it sees; a later patch never reaches it, so app calls
// would skip the service bindings. `vite.vinext.config.ts` keeps this module first.
if (Symbol.for("vinext.fetchCache.originalFetch") in globalThis) throw new Error("Outbound routing loaded after vinext's fetch cache");

globalThis.fetch = routeOutboundFetch(globalThis.fetch.bind(globalThis), env);
