import { WorkerEntrypoint } from "cloudflare:workers";
import { serveBoundRenderer } from "./index";

export { default } from "./index";

/** The web Worker's service binding; only Workers that bind it can call it, so it needs no Google identity token. */
export class WebRenderer extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    return serveBoundRenderer(request, this.env);
  }
}
