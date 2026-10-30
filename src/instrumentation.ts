import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportRequestError } = await import("./requestErrorDiagnostics");
    reportRequestError(error, request, context);
  }
  catch {
    console.error(JSON.stringify({ severity: "ERROR", event: "next.request.diagnostic-failed" }));
  }
};

/**
 * Fills the local API Worker fixture before the server answers its first
 * request, so `pnpm run dev` lands on a site that looks used instead of an
 * empty database.
 *
 * One call: the package decides whether this environment may be seeded, in
 * which order the collections are written, and what the demo mass contains.
 *
 * The failure is logged rather than thrown, because everything lost when the
 * seed fails is a convenience — the dev server itself still works, and a boot
 * that dies over demo data would be a worse trade.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { registerPosthogTracing } = await import("./posthogTracing");
    await registerPosthogTracing();
  }
  catch {
    console.error(JSON.stringify({ severity: "ERROR", event: "next.tracing.setup-failed" }));
  }

  try {
    const { seedDemoData, seedDemoImages } = await import("@/packages/demo-seed");
    await seedDemoData();
    void seedDemoImages().catch((error) => {
      console.error(
        "Demo image seeding failed — completed images remain available and a later boot can resume.",
        error,
      );
    });
  }
  catch (error) {
    console.error(
      "Demo seeding on startup failed — the app still runs, but it starts empty.",
      error,
    );
  }
}
