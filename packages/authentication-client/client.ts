import { createAuthenticationDiagnostics, type AuthenticationDiagnosticEvent } from "@tudomacae/authentication/diagnostics";
import z from "zod";
import type { SessionResolution } from "@tudomacae/authentication/session";
import {
  applyRequestCredentials, authorityHeaders, authorityRequestInit, correlateRequest, exchangeFailure, readDiagnosticContext,
  receiveAuthorityResponse, reportExchangeSuccess, verifyRemoteCorrelation, type ExchangeAttempt, type ExchangeOptions,
} from "./lib/exchange";
export const identityAccountSchema = z.object({
  uid: z.string(),
  email: z.string().optional(),
  emailVerified: z.boolean(),
  disabled: z.boolean(),
  displayName: z.string().optional(),
  claims: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  lastSignIn: z.number().optional(),
});
export type IdentityAccount = z.infer<typeof identityAccountSchema>;
const sessionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing") }),
  z.object({ status: z.literal("invalid") }),
  z.object({
    status: z.literal("valid"),
    user: z.object({
      uid: z.string(),
      email: z.string().optional(),
      emailVerified: z.boolean(),
      isAdmin: z.boolean(),
      isEditor: z.boolean(),
    }),
  }),
]);
export function createAuthenticationClient(configuration: {
  origin: string;
  publicOrigin: string;
  request?: typeof fetch;
  allowLocal?: boolean;
  runtimeIdentityToken?: (audience: string) => Promise<string>;
  diagnostics?: {
    context?: () => { requestId?: string; traceparent?: string; correlationId?: string };
    environment?: string;
    release?: string;
    write: (event: AuthenticationDiagnosticEvent) => void;
  };
}) {
  const origin = new URL(configuration.origin);
  const publicOrigin = new URL(configuration.publicOrigin);
  if (
    (origin.protocol !== "https:"
      && !(
        configuration.allowLocal
        && origin.protocol === "http:"
        && ["localhost", "127.0.0.1", "authentication.test"].includes(
          origin.hostname,
        )
      ))
      || origin.username
      || origin.password
      || origin.pathname !== "/"
      || origin.search
      || origin.hash
  )
    throw new Error("Invalid authentication authority configuration");
  async function attachRuntimeIdentity(headers: Headers, diagnostics: ReturnType<typeof createAuthenticationDiagnostics>) {
    if (headers.has("authorization") || !configuration.runtimeIdentityToken) return;
    try {
      headers.set("authorization", `Bearer ${await configuration.runtimeIdentityToken(origin.origin)}`);
    }
    catch {
      diagnostics.loseCorrelation("identity_unavailable");
    }
  }
  async function exchange<T>(
    path: string,
    options: ExchangeOptions,
    receive: (response: Response) => Promise<T>,
  ): Promise<T> {
    const headers = authorityHeaders(options.headers, publicOrigin);
    const { requestId, correlationId, traceparent } = correlateRequest(headers, readDiagnosticContext(configuration.diagnostics));
    const diagnostics = createAuthenticationDiagnostics({
      service: "next-authentication-client", requestId, traceparent, path, correlationId,
      environment: configuration.diagnostics?.environment,
      release: configuration.diagnostics?.release,
      now: () => performance.now(),
      write: event => configuration.diagnostics?.write(event),
    });
    applyRequestCredentials(headers, options);
    const attempt: ExchangeAttempt = { refused: false };
    try {
      const value = await diagnostics.run("transport", async () => {
        const signal = AbortSignal.timeout(5000);
        await attachRuntimeIdentity(headers, diagnostics);
        signal.throwIfAborted();
        const response = await (configuration.request ?? fetch)(new URL(path, origin), authorityRequestInit(options, headers, signal));
        attempt.response = response;
        if (headers.has("authorization") || configuration.runtimeIdentityToken)
          verifyRemoteCorrelation(response, correlationId, diagnostics);
        return await receiveAuthorityResponse(response, options, attempt, receive);
      });
      reportExchangeSuccess(diagnostics, attempt);
      return value;
    }
    catch (error) {
      const failure = exchangeFailure(error, diagnostics, attempt);
      throw Object.assign(failure, { authenticationRequestId: requestId, authenticationCorrelationId: correlationId });
    }
  }
  function request(path: string, options: Parameters<typeof exchange>[1] = {}) {
    return exchange(path, options, async response => response);
  }
  async function decodedProcedure<T>(name: string, input: unknown, credential: string | undefined, mutation: boolean, decode: (value: unknown) => T) {
    const path = `/api/trpc/${name}`;
    return exchange(mutation ? path : `${path}?input=${encodeURIComponent(JSON.stringify(input ?? null))}`, {
      ...(credential ? { credential } : {}), ...(mutation ? { body: input } : {}),
    }, async (response) => {
      if (!response.ok) throw new Error("Authentication operation refused");
      const value = z.object({ result: z.object({ data: z.unknown() }) }).parse(await response.json());
      return decode(value.result.data);
    });
  }
  function procedure(name: string, input: unknown, credential?: string, mutation = false) {
    return decodedProcedure(name, input, credential, mutation, value => value);
  }
  return {
    request,
    procedure,
    async session(credential?: string): Promise<SessionResolution> {
      if (!credential) return { status: "missing" };
      const value = await decodedProcedure("session", null, credential, false, value => sessionSchema.parse(value));
      return value.status === "valid"
        ? { ...value, user: { ...value.user, email: value.user.email } }
        : value;
    },
    async identity(
      uid: string,
      identityToken: (audience: string) => Promise<string>,
    ): Promise<IdentityAccount | null> {
      const bearer = await identityToken(origin.origin);
      return exchange(`/internal/identities/${encodeURIComponent(uid)}`, { bearer }, async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Identity reader unauthorized");
        return identityAccountSchema.parse(await response.json());
      });
    },
    sessionCredential(response: Response) {
      const match = response.headers
        .get("set-cookie")
        ?.match(/(?:^|,\s*)session=([^;,]*)/);
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    },
  };
}
