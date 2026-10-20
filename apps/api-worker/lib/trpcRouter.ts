import z from "zod";
import { initTRPC, TRPCError } from "@trpc/server";
import { roleChangeError } from "@tudomacae/authentication/claims";
import { classifiedsReadInput, classifiedsWriteInput } from "@tudomacae/classifieds-client/protocol";
import { classifiedsContext, classifiedsProcedure, classifiedsError } from "./classifiedsHttp";
import { mediaReadInput, mediaWriteInput } from "@tudomacae/editorial-media/protocol";
import { mediaContext, mediaError, mediaProcedure, mediaUnavailableMessage } from "./mediaHttp";
import { blogReadInput, blogWriteInput } from "@tudomacae/editorial-blog/protocol";
import { blogContext, blogError, blogProcedure, blogUnavailableMessage } from "./blogHttp";
import { blogPublicReadInput } from "@tudomacae/editorial-blog/publicProtocol";
import { blogPublicUnavailableMessage, type blogPublicContext } from "./blogPublicHttp";
import { readIdentityAccount, identityAccount, type IdentityRow } from "./db/identityAccounts";
import { updateIdentityRoles } from "./db/roles";
import { workerEmailVerification } from "./emailVerification";
import type { authentication } from "./authentication";
import type { AuthenticationMail } from "./workerDependencies";

/** Internal failures name the capability that failed and nothing else; Media procedures are not account access. */
function internalMessage(error: TRPCError, path: string | undefined, message: string) {
  if (error.code !== "INTERNAL_SERVER_ERROR") return message;
  if (path === "mediaRead" || path === "mediaWrite") return mediaUnavailableMessage;
  if (path === "blogPublicRead") return blogPublicUnavailableMessage;
  return path === "blogRead" || path === "blogWrite" ? blogUnavailableMessage : "Não foi possível acessar sua conta.";
}

const t = initTRPC
  .context<{
  auth: ReturnType<typeof authentication>;
  request: Request;
  authenticationDatabase: D1Database;
  env: Env;
  classifieds(): ReturnType<typeof classifiedsContext>;
  media(): ReturnType<typeof mediaContext>;
  blog(): ReturnType<typeof blogContext>;
  blogPublic(): ReturnType<typeof blogPublicContext>;
  sendMail(mail: AuthenticationMail): Promise<void>;
}>()
  .create({
    isDev: false,
    errorFormatter: ({ shape, error, path }) => ({
      ...shape,
      data: { ...shape.data, ...(classifiedsError(error.cause) ? { classifieds: classifiedsError(error.cause) } : {}), ...(mediaError(error.cause) ? { media: mediaError(error.cause) } : {}), ...(blogError(error.cause) ? { blog: blogError(error.cause) } : {}) },
      message: internalMessage(error, path, shape.message),
    }),
  });
async function verificationContext(
  ctx: {
    auth: ReturnType<typeof authentication>;
    request: Request;
    authenticationDatabase: D1Database;
    env: Env;
    sendMail(mail: AuthenticationMail): Promise<void>;
  },
  requireSession = true,
) {
  const session = await ctx.auth.api.getSession({
    headers: ctx.request.headers,
  });
  const uid = session?.user.id;
  if (
    requireSession
    && (!uid || (await readIdentityAccount(ctx.authenticationDatabase, uid))?.disabled !== false)
  )
    throw new TRPCError({ code: "FORBIDDEN" });
  return {
    uid,
    service: workerEmailVerification({
      database: ctx.authenticationDatabase,
      publicOrigin: ctx.env.PUBLIC_APP_ORIGIN,
      headers: ctx.request.headers,
      ...(uid ? { uid } : {}),
      verifyPassword: password =>
        ctx.auth.api.verifyPassword({
          headers: ctx.request.headers,
          body: { password },
        }),
      send: mail => ctx.sendMail({ ...mail, from: ctx.env.EMAIL_FROM }),
    }),
  };
}
async function administrator(ctx: {
  auth: ReturnType<typeof authentication>;
  request: Request;
  authenticationDatabase: D1Database;
}) {
  const session = await ctx.auth.api.getSession({
    headers: ctx.request.headers,
  });
  const account = session
    ? await readIdentityAccount(ctx.authenticationDatabase, session.user.id)
    : null;
  if (!account || account.disabled || account.claims.admin !== true)
    throw new TRPCError({ code: "FORBIDDEN" });
  return account.uid;
}
export const router = t.router({
  classifiedsRead: t.procedure.input(classifiedsReadInput).query(({ ctx, input }) => classifiedsProcedure(async () => (await ctx.classifieds()).read(input.operation, input.input))),
  mediaRead: t.procedure.input(mediaReadInput).query(({ ctx, input }) => mediaProcedure(async () => (await (await ctx.media()).read(input.operation, input.input, input.requestId)) ?? null)),
  blogPublicRead: t.procedure.input(blogPublicReadInput).query(async ({ ctx, input }) => (await ctx.blogPublic()).read(input)),
  mediaWrite: t.procedure.input(mediaWriteInput).mutation(({ ctx, input }) => mediaProcedure(async () => (await (await ctx.media()).write(input.operation, input.input)) ?? null)),
  blogRead: t.procedure.input(blogReadInput).query(({ ctx, input }) => blogProcedure(async () => (await (await ctx.blog()).read(input.operation, input.input)) ?? null)),
  blogWrite: t.procedure.input(blogWriteInput).mutation(({ ctx, input }) => blogProcedure(async () => (await (await ctx.blog()).write(input.operation, input.input, input.correlationId)) ?? null)),
  classifiedsWrite: t.procedure.input(classifiedsWriteInput).mutation(({ ctx, input }) => classifiedsProcedure(async () => (await (await ctx.classifieds()).write(input.operation, input.input)) ?? null)),
  updateRoles: t.procedure
    .input(
      z.object({
        uid: z.string().min(1).max(128),
        patch: z
          .object({
            admin: z.boolean().optional(),
            editor: z.boolean().optional(),
          })
          .strict(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = await administrator(ctx);
      const refusal = roleChangeError(
        { uid: actor, isAdmin: true },
        input.uid,
        input.patch,
      );
      if (refusal)
        throw new TRPCError({ code: "BAD_REQUEST", message: refusal });
      await updateIdentityRoles(ctx.authenticationDatabase, actor, input.uid, input.patch);
      return { success: true };
    }),
  listUsers: t.procedure
    .input(z.object({ pageToken: z.string().max(128).optional() }).nullish())
    .query(async ({ ctx, input }) => {
      await administrator(ctx);
      const rows = await ctx.authenticationDatabase
        .prepare(
          "SELECT id,name,email,emailVerified,disabled,claims,createdAt,lastSignIn FROM user WHERE id>? ORDER BY id LIMIT 1001",
        )
        .bind(input?.pageToken ?? "")
        .all<IdentityRow>();
      const users = rows.results.slice(0, 1000).map((row) => {
        const account = identityAccount(row);
        return {
          uid: account.uid,
          email: account.email,
          displayName: account.displayName,
          createdAt: new Date(account.createdAt).toISOString(),
          lastSignIn:
            account.lastSignIn === undefined
              ? undefined
              : new Date(account.lastSignIn).toISOString(),
          isAdmin: account.claims.admin === true,
          isEditor: account.claims.editor === true,
        };
      });
      return {
        users,
        ...(rows.results.length > 1000
          ? { nextPageToken: rows.results[999].id }
          : {}),
      };
    }),
  readVerification: t.procedure.query(async ({ ctx }) => {
    const value = await verificationContext(ctx);
    return value.service.read(value.uid!);
  }),
  sendVerification: t.procedure
    .input(z.object({ continueUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const value = await verificationContext(ctx);
      return value.service.send(value.uid!, input.continueUrl);
    }),
  correctEmail: t.procedure
    .input(
      z.object({
        email: z.string(),
        password: z.string(),
        continueUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = await verificationContext(ctx);
      return value.service.correct(value.uid!, input, input.continueUrl);
    }),
  confirmEmail: t.procedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const value = await verificationContext(ctx, false);
      return value.service.confirm(input.code);
    }),
  session: t.procedure.query(async ({ ctx }) => {
    const session = await ctx.auth.api.getSession({
      headers: ctx.request.headers,
    });
    if (!session)
      return {
        status: /(?:^|;\s*)session=/.test(
          ctx.request.headers.get("cookie") ?? "",
        )
          ? ("invalid" as const)
          : ("missing" as const),
      };
    const user = await ctx.authenticationDatabase
      .prepare("SELECT disabled, claims FROM user WHERE id = ?")
      .bind(session.user.id)
      .first<{ disabled: number; claims: string }>();
    if (!user || user.disabled) return { status: "invalid" as const };
    const claims = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(user.claims));
    return {
      status: "valid" as const,
      user: {
        uid: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        isAdmin: claims.admin === true,
        isEditor: claims.editor === true,
      },
    };
  }),
});
