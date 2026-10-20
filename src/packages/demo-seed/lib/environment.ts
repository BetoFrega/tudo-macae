/**
 * Whether the server that is booting may write the demo mass.
 *
 * `instrumentation.ts` runs in every environment, so the answer is yes only for
 * a local `next dev` beside the loopback API Worker fixture that `npm run dev`
 * starts. `AUTHENTICATION_FIXTURE_CONFIGURATION` is the load-bearing guard: it
 * names that fixture, and every seed write goes through it (`lib/worker.ts`).
 *
 * `NEXT_RUNTIME` also keeps the edge copy of `register()` out.
 */
export function shouldSeedDemoData(env: NodeJS.ProcessEnv): boolean {
  return (
    env.NEXT_RUNTIME === "nodejs"
    && env.NODE_ENV === "development"
    && Boolean(env.AUTHENTICATION_FIXTURE_CONFIGURATION)
  );
}

/** Image work is an explicit local-only opt-in on top of the demo mass guard. */
export function shouldSeedDemoImages(env: NodeJS.ProcessEnv): boolean {
  return shouldSeedDemoData(env) && env.DEMO_SEED_IMAGES === "1";
}
