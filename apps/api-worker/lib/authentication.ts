import z from "zod";
import { betterAuth } from "better-auth";
import {
  createAuthMiddleware,
  createAuthEndpoint,
  formCsrfMiddleware,
  APIError,
} from "better-auth/api";
import { createAccountRecovery } from "@tudomacae/authentication/account-recovery";
import { createAuthenticationAttemptLimit } from "@tudomacae/authentication/attempt-limit";
import { readIdentityAccount } from "./db/identityAccounts";
import {
  issuePasswordRecovery,
  completePasswordRecovery,
  readPasswordRecovery,
} from "./db/passwordRecovery";
import { authenticationRateLimitStorage } from "./db/rateLimits";
import type { AuthenticationMail, WorkerDependencies } from "./workerDependencies";
import { admitsHumanChallenge, type HumanChallengeEnv } from "./humanChallenge";

export function authentication(env: HumanChallengeEnv, dependencies: WorkerDependencies & { authenticationDatabase: D1Database }, target?: string) {
  const database = dependencies.authenticationDatabase;
  const limiter = createAuthenticationAttemptLimit(authenticationRateLimitStorage(database, env.BETTER_AUTH_SECRET, Date.now));
  return betterAuth({
    database,
    rateLimit: {
      enabled: true,
      customStorage: {
        consume: (key, rule) => limiter.consume({
          networkKey: key,
          operation: key.slice(key.indexOf("|") + 1),
          ...(target === undefined ? {} : { accountAddress: target }),
          rule,
        }),
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.PUBLIC_APP_ORIGIN,
    basePath: "/api/auth",
    trustedOrigins: [env.PUBLIC_APP_ORIGIN],
    plugins: [
      {
        id: "account-recovery",
        endpoints: {
          resetPassword: createAuthEndpoint(
            "/reset-password",
            {
              method: "POST",
              use: [formCsrfMiddleware],
              body: z.object({ token: z.string(), newPassword: z.string() }),
            },
            async (ctx) => {
              const recovery = createAccountRecovery({
                now: Date.now,
                read: token => readPasswordRecovery(database, token),
                hashPassword: ctx.context.password.hash,
                complete: (proof, hash) =>
                  completePasswordRecovery(database, proof, hash, Date.now()),
              });
              const result = await recovery.reset(
                ctx.body.token,
                ctx.body.newPassword,
              );
              if (!result.success)
                throw new APIError("BAD_REQUEST", {
                  code: "INVALID_TOKEN",
                  message: result.error,
                });
              return ctx.json({ status: true, email: result.email });
            },
          ),
        },
      },
    ],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      maxPasswordLength: 4096,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        if ((await readIdentityAccount(database, user.id))?.disabled !== false)
          return;
        await issuePasswordRecovery(
          database,
          token,
          user.id,
          user.email,
          Date.now(),
        );
        const url = new URL("/minha-conta/acao", env.PUBLIC_APP_ORIGIN);
        url.searchParams.set("mode", "resetPassword");
        url.searchParams.set("token", token);
        const text = `Defina sua senha no Tudo Macaé.\n${url.href}`;
        const mail: AuthenticationMail = {
          to: user.email,
          from: env.EMAIL_FROM,
          subject: "Recupere o acesso ao Tudo Macaé",
          text,
          html: `<p>Defina sua senha no Tudo Macaé.</p><p><a href="${url.href.replaceAll("&", "&amp;")}">Definir senha</a></p>`,
        };
        if (dependencies.sendMail) await dependencies.sendMail(mail, env);
        else await env.EMAIL.send(mail);
      },
    },
    session: {
      freshAge: 0,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 5,
    },
    user: {
      additionalFields: {
        disabled: { type: "boolean", defaultValue: false, input: false },
        migrated: { type: "boolean", defaultValue: false, input: false },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: false,
      cookies: {
        session_token: {
          name: "session",
          attributes: {
            secure: new URL(env.PUBLIC_APP_ORIGIN).protocol === "https:",
          },
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await readIdentityAccount(database, session.userId);
            if (!user || user.disabled) return false;
          },
          after: async (session) => {
            await database.prepare("UPDATE user SET lastSignIn=? WHERE id=?")
              .bind(Date.now(), session.userId)
              .run();
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!(await admitsHumanChallenge(ctx.path, ctx.headers ?? new Headers(), env, dependencies.verifyHumanChallenge, (category, status) => dependencies.reportHumanChallengeUnavailable?.(category, status))))
          throw new APIError("FORBIDDEN", {
            code: "HUMAN_CHALLENGE_FAILED",
            message: "Confirme que você não é um robô e tente novamente.",
          });
        if (
          ctx.path === "/sign-in/email"
          && typeof ctx.body?.email === "string"
        ) {
          const user = await database.prepare(
            "SELECT disabled FROM user WHERE email = ?",
          )
            .bind(ctx.body.email.toLowerCase())
            .first<{ disabled: number }>();
          if (user?.disabled)
            throw new APIError("FORBIDDEN", {
              code: "INVALID_CREDENTIALS",
              message: "Não foi possível entrar.",
            });
        }
        if (ctx.path === "/sign-up/email")
          return { context: { ...ctx, body: { ...ctx.body, name: "" } } };
      }),
    },
    logger: { disabled: true },
  });
}
