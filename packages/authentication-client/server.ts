import { requestCorrelationContextKey } from "@tudomacae/www-origin-routing/correlation";
import { requestCorrelationId } from "@tudomacae/www-origin-routing/contract";
import { context, trace } from "@opentelemetry/api";
import { createAuthenticationClient, type IdentityAccount } from "./client";
import { createRuntimeIdentityReader } from "./runtime-identity";
const runtimeIdentity = createRuntimeIdentityReader({ fetch: (...args) => fetch(...args) });
export class IdentityAccountMissing extends Error {
  readonly code = "identity/account-not-found";
  constructor() {
    super("Identity account missing");
  }
}
export function configuredAuthenticationClient() {
  if (!process.env.AUTHENTICATION_API_URL || !process.env.PUBLIC_APP_ORIGIN)
    throw new Error("Authentication authority configuration missing");
  return createAuthenticationClient({
    origin: process.env.AUTHENTICATION_API_URL,
    publicOrigin: process.env.PUBLIC_APP_ORIGIN,
    ...((process.env.K_SERVICE || process.env.AUTHENTICATION_TEST_SERVICE_TOKEN)
      ? { runtimeIdentityToken: cachedServiceIdentityToken }
      : {}),
    diagnostics: {
      context() {
        const span = trace.getSpanContext(context.active());
        const value = context.active().getValue(requestCorrelationContextKey);
        const correlationId = requestCorrelationId(typeof value === "string" ? value : undefined);
        return { ...(correlationId ? { correlationId } : {}), ...(span ? { traceparent: `00-${span.traceId}-${span.spanId}-${(span.traceFlags & 1) ? "01" : "00"}` } : {}) };
      },
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "unknown",
      release: process.env.SOURCE_SHA ?? process.env.K_REVISION ?? "unknown",
      write(event) {
        if (process.env.AUTHENTICATION_DIAGNOSTICS_ENABLED !== "true") return;
        const failed = event.outcome === "failed" || event.outcome === "degraded";
        const severity = failed ? "ERROR" : "INFO";
        const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
        const record = { severity, ...event,
          ...(event.traceId && project && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(project)
            ? { "logging.googleapis.com/trace": `projects/${project}/traces/${event.traceId}` }
            : {}),
        };
        if (failed) console.error(JSON.stringify(record));
        else console.log(JSON.stringify(record));
      },
    },
    allowLocal:
      process.env.NEXT_PUBLIC_APP_ENV === "test"
      || process.env.NODE_ENV === "development",
  });
}
/** The e2e build and `next dev` reach the loopback API Worker fixture, which signs no runtime identity. */
function presentsFixtureToken(audience: string) {
  return (process.env.NEXT_PUBLIC_APP_ENV === "test" || process.env.NODE_ENV === "development")
    && Boolean(process.env.AUTHENTICATION_TEST_SERVICE_TOKEN)
    && ["localhost", "127.0.0.1"].includes(new URL(audience).hostname);
}
export async function serviceIdentityToken(audience: string) {
  if (presentsFixtureToken(audience))
    return process.env.AUTHENTICATION_TEST_SERVICE_TOKEN!;
  return runtimeIdentity.read(audience);
}
async function cachedServiceIdentityToken(audience: string) {
  if (presentsFixtureToken(audience))
    return process.env.AUTHENTICATION_TEST_SERVICE_TOKEN!;
  const token = runtimeIdentity.cached(audience);
  if (!token) throw new Error("Runtime identity unavailable");
  return token;
}
async function readBetterAuthIdentity(uid: string): Promise<IdentityAccount> {
  const account = await configuredAuthenticationClient().identity(
    uid,
    serviceIdentityToken,
  );
  if (!account) throw new IdentityAccountMissing();
  return account;
}
export async function readAuthenticationIdentity(
  uid: string,
): Promise<IdentityAccount> {
  return readBetterAuthIdentity(uid);
}
