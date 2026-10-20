// The app's tsconfig omits the Workers runtime types; only the web Worker modules import the binding env.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
  export class DurableObject {
    constructor(ctx: unknown, env: unknown);
  }
}
