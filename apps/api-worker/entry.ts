import { WorkerEntrypoint } from "cloudflare:workers";
import { createApiWorker } from "./index";
import { createProductionClassifiedsDependencies } from "./production";

export { default } from "./index";

/**
 * The web Worker's service binding. Only Workers whose configuration binds this
 * entrypoint can call it, so it stands in for the Google identity token that
 * Cloud Run presents to the default handler.
 */
export class WebRenderer extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    const loopback: typeof fetch = (input, init) => this.ctx.exports.default.fetch(input, init);
    return createApiWorker({ ...createProductionClassifiedsDependencies(this.env, fetch, loopback), boundRenderer: true })
      .fetch(request, this.env, this.ctx);
  }
}
