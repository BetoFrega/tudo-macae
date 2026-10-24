import { isClassifiedsPhotoRoute, serveClassifiedsPhoto } from "./classifiedsPhotoHttp";
import { workerEmailVerification } from "./emailVerification";
import { readIdentityAccount } from "./db/identityAccounts";
import z from "zod";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { classifiedsReadInput, classifiedsWriteInput } from "@tudomacae/classifieds-client/protocol";
import { mediaReadInput, mediaWriteInput } from "@tudomacae/editorial-media/protocol";
import { blogReadInput, blogWriteInput } from "@tudomacae/editorial-blog/protocol";
import { MediaIngestionError } from "@tudomacae/media/ingestionPolicy";
import { classifiedsActor, classifiedsContext } from "./classifiedsHttp";
import { authentication } from "./authentication";
import { readBoundedBody, rejectRequest, requestBodyLimit, trustForwardedAddress } from "./apiRequestAdmission";
import { isMediaRoute, mediaContext, serveMedia } from "./mediaHttp";
import { blogContext } from "./blogHttp";
import { isClassifiedsCanonicalRoute, serveClassifiedsCanonical } from "./classifiedsCanonical";
import type { ArticleIndexWriter } from "./editorialBlogSynchronization";
import { router } from "./trpcRouter";
import { blogPublicContext } from "./blogPublicHttp";
import { isEditorialImageRoute, serveEditorialImage } from "./editorialImageHttp";
import type { WorkerDependencies } from "./workerDependencies";

type RequestDependencies = WorkerDependencies & { verifyRuntimeIdentity(): Promise<boolean>; authenticationDatabase: D1Database };
type Authentication = ReturnType<typeof authentication>;

async function serveIdentityLookup(request: Request, path: string, dependencies: RequestDependencies) {
  if (!(await dependencies.verifyRuntimeIdentity()))
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  if (request.method !== "GET")
    return new Response(null, {
      status: 405,
      headers: { "cache-control": "private, no-store", "allow": "GET" },
    });
  let uid;
  try {
    uid = decodeURIComponent(path.slice("/internal/identities/".length));
  }
  catch {
    return new Response(null, { status: 400 });
  }
  if (!uid || uid.length > 128 || uid.includes("/"))
    return new Response(null, { status: 400 });
  const identity = await readIdentityAccount(dependencies.authenticationDatabase, uid);
  return Response.json(identity ?? { error: "Account missing" }, {
    status: identity ? 200 : 404,
    headers: { "cache-control": "private, no-store" },
  });
}

const credentialPaths = new Set([
  "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/request-password-reset",
]);

async function credentialEmail(request: Request, path: string) {
  if (request.method !== "POST" || !credentialPaths.has(path)) return undefined;
  const credentials = z.object({ email: z.string().max(320) }).safeParse(await request.clone().json().catch(() => null));
  return credentials.success ? credentials.data.email : undefined;
}

function servePhoto(request: Request, env: Env, dependencies: RequestDependencies, auth: Authentication) {
  return serveClassifiedsPhoto({ request, photos: dependencies.classifiedsPhotos!(env),
    render: dependencies.classifiedsPhotoRenderer?.(env),
    actor: () => classifiedsActor({ request, env, accounts: dependencies.authenticationDatabase, verifyRuntimeIdentity: dependencies.verifyRuntimeIdentity, session: () => auth.api.getSession({ headers: request.headers }) }),
    report: (error, operation) => dependencies.reportClassifiedsFailure?.(error, operation) });
}

function mediaDependencies(request: Request, env: Env, dependencies: RequestDependencies, auth: Authentication) {
  const service = dependencies.editorialMedia?.(env);
  return { ...(service ? { service } : {}), accounts: dependencies.authenticationDatabase, session: () => auth.api.getSession({ headers: request.headers }) };
}

function classifiedsFailureOperation(input: unknown) {
  const operation = classifiedsReadInput.safeParse(input);
  if (operation.success) return operation.data.operation;
  const mutation = classifiedsWriteInput.safeParse(input);
  return mutation.success ? mutation.data.operation : undefined;
}

function reportMediaFailure(dependencies: RequestDependencies, path: string, input: unknown, cause: unknown) {
  const operation = (path === "mediaRead" ? mediaReadInput : mediaWriteInput).safeParse(input);
  // Ingestion failures carry their intent id, a digest that names no person.
  const operationId = cause instanceof MediaIngestionError ? z.string().regex(/^[a-f0-9]{64}$/).safeParse(cause.details.operationId) : undefined;
  dependencies.reportMediaFailure?.(operation.success ? operation.data.operation : undefined, operationId?.success ? operationId.data : undefined);
}

/** Each capability reports its own internal failures; account procedures stay in authentication diagnostics. */
function reportProcedureFailure(dependencies: RequestDependencies, path: string | undefined, input: unknown, error: { cause?: unknown }) {
  const reporters: Record<string, () => void> = {
    mediaRead: () => reportMediaFailure(dependencies, "mediaRead", input, error.cause),
    mediaWrite: () => reportMediaFailure(dependencies, "mediaWrite", input, error.cause),
    blogRead: () => dependencies.reportBlogFailure?.(blogReadInput.safeParse(input).data?.operation),
    blogWrite: () => {
      const write = blogWriteInput.safeParse(input).data;
      dependencies.reportBlogFailure?.(write?.operation, write?.correlationId);
    },
    classifiedsRead: () => dependencies.reportClassifiedsFailure?.(error.cause ?? error, classifiedsFailureOperation(input)),
    classifiedsWrite: () => dependencies.reportClassifiedsFailure?.(error.cause ?? error, classifiedsFailureOperation(input)),
  };
  if (path && Object.hasOwn(reporters, path)) reporters[path]!();
}

function serveTrpc(request: Request, env: Env, dependencies: RequestDependencies, auth: Authentication) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router,
    onError({ error, path, input }) {
      if (error.code === "INTERNAL_SERVER_ERROR") reportProcedureFailure(dependencies, path, input, error);
    },
    createContext: () => ({
      auth,
      request,
      authenticationDatabase: dependencies.authenticationDatabase,
      env,
      media: () => mediaContext(mediaDependencies(request, env, dependencies, auth)),
      blogPublic: () => blogPublicContext({ service: dependencies.editorialMedia?.(env), accounts: dependencies.authenticationDatabase }),
      blog: () => blogContext({ ...mediaDependencies(request, env, dependencies, auth),
        // Deployments without PUBLIC_ARTICLE_INDEX_SERVICE drop the binding, so the declared type overstates its presence.
        ...(env.ARTICLE_INDEX ? { index: env.ARTICLE_INDEX as unknown as ArticleIndexWriter } : {}),
        ...(dependencies.editorialImagePurge ? { purge: dependencies.editorialImagePurge(env) } : {}),
        context: { environment: env.WORKERS_ENVIRONMENT, release: env.CF_VERSION_METADATA?.id ?? "unknown" } }),
      classifieds: () => classifiedsContext({ request, env, accounts: dependencies.authenticationDatabase, persistence: dependencies.classifiedsPersistence?.(env), verifyRuntimeIdentity: dependencies.verifyRuntimeIdentity, qualification: dependencies.classifiedsQualification, photoUrl: dependencies.classifiedsPhotoUrl, offeringFlag: dependencies.classifiedsOfferingFlag?.(env), photos: dependencies.classifiedsPhotos?.(env), canonicalCache: colocationCache(), session: () => auth.api.getSession({ headers: request.headers }) }),
      sendMail: mail =>
        dependencies.sendMail
          ? dependencies.sendMail(mail, env)
          : env.EMAIL.send(mail).then(() => undefined),
    }),
  });
}

async function withSignUpVerification(request: Request, env: Env, path: string, dependencies: RequestDependencies, auth: Authentication, response: Response) {
  if (path !== "/api/auth/sign-up/email" || request.method !== "POST" || !response.ok) return response;
  const account = z
    .object({ user: z.object({ id: z.string() }) })
    .passthrough()
    .parse(await response.clone().json());
  const headers = new Headers(request.headers);
  headers.set(
    "cookie",
    response.headers
      .getSetCookie()
      .map(value => value.split(";")[0])
      .join("; "),
  );
  const verification = workerEmailVerification({
    database: dependencies.authenticationDatabase,
    publicOrigin: env.PUBLIC_APP_ORIGIN,
    headers,
    uid: account.user.id,
    verifyPassword: password =>
      auth.api.verifyPassword({ headers, body: { password } }),
    send: mail =>
      dependencies.sendMail
        ? dependencies.sendMail(
            { ...mail, from: env.EMAIL_FROM },
            env,
          )
        : env.EMAIL.send({ ...mail, from: env.EMAIL_FROM }).then(
            () => undefined,
          ),
  });
  let delivery;
  try {
    delivery = await verification.send(account.user.id);
  }
  catch {
    delivery = {
      status: "error",
      error: "Sua conta foi criada. Solicite novamente a verificação.",
    };
  }
  return Response.json(
    { ...account, verification: delivery },
    { status: response.status, headers: response.headers },
  );
}

async function routeResponse(request: Request, env: Env, path: string, dependencies: RequestDependencies, auth: Authentication) {
  if (path.startsWith("/api/auth/")) return auth.handler(request);
  if (path.startsWith("/api/trpc/")) return serveTrpc(request, env, dependencies, auth);
  if (isMediaRoute(path)) return serveMedia(request, path, mediaDependencies(request, env, dependencies, auth));
  if (isEditorialImageRoute(path)) return serveEditorialImage(request, path, { service: dependencies.editorialMedia?.(env), report: stage => dependencies.reportEditorialImageFailure?.(stage) });
  return new Response(null, { status: 404 });
}

/** This tsconfig loads the DOM lib, whose `CacheStorage` lacks the Workers runtime `default` colo cache. */
const colocationCache = () => (globalThis.caches as (CacheStorage & { readonly default?: Cache }) | undefined)?.default;

/** Canonical lookups answer before admission: they carry no session and change nothing. */
function serveCanonicalRead(request: Request, env: Env, path: string, dependencies: RequestDependencies) {
  if (isClassifiedsCanonicalRoute(path))
    return serveClassifiedsCanonical(request, path, { persistence: dependencies.classifiedsPersistence?.(env), qualification: dependencies.classifiedsQualification, cache: colocationCache() });
  return undefined;
}

export async function serveApiRequest(
  request: Request,
  env: Env,
  workerDependencies: Omit<RequestDependencies, "authenticationDatabase">,
): Promise<Response> {
  const requestDependencies: RequestDependencies = { ...workerDependencies, authenticationDatabase: env.AUTHENTICATION_DB };
  const path = new URL(request.url).pathname;
  const photoRequest = isClassifiedsPhotoRoute(path);
  const canonical = serveCanonicalRead(request, env, path, requestDependencies);
  if (canonical) return canonical;
  const rejection = await rejectRequest(request, env, path, photoRequest, requestDependencies);
  if (rejection) return rejection;
  const buffered = await readBoundedBody(request, requestBodyLimit(path, photoRequest));
  if (!buffered) return new Response(null, { status: 413 });
  requestDependencies.diagnostics?.start("handler");
  if (path.startsWith("/internal/identities/")) return serveIdentityLookup(buffered, path, requestDependencies);
  const trusted = await trustForwardedAddress(buffered, () => requestDependencies.verifyRuntimeIdentity());
  if (!trusted) return new Response(null, { status: 401 });
  const auth = authentication(env, requestDependencies, await credentialEmail(trusted, path));
  if (photoRequest) return servePhoto(trusted, env, requestDependencies, auth);
  const response = await withSignUpVerification(trusted, env, path, requestDependencies, auth,
    await routeResponse(trusted, env, path, requestDependencies, auth));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
