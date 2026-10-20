"use server";

import z from "zod";
import { getCurrentUser } from "./getCurrentUser";
import {
  requestEmailVerification,
  correctUnverifiedEmail,
  confirmEmailVerification,
} from "@/integrations/authentication/verification";
import {
  continuationId,
  verificationDestination as destination,
  type VerificationContinuation,
} from "../emailVerificationReads";
function continueUrl(continuation: VerificationContinuation = {}) {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) return undefined;
  const target = new URL("/minha-conta/verificar-email", origin);
  if (continuation.publication)
    target.searchParams.set("publication", continuation.publication);
  if (continuation.ad) target.searchParams.set("ad", continuation.ad);
  return target.href;
}
export async function sendEmailVerification(
  continuation: VerificationContinuation = {},
) {
  const user = await getCurrentUser();
  if (!user)
    return {
      status: "error" as const,
      error: "Entre na sua conta para verificar o e-mail.",
    };
  if (user.emailVerified) return { status: "verified" as const };
  try {
    const next = await destination(user.uid, continuation);
    return await requestEmailVerification(
      continueUrl({
        ...(next.startsWith("/publicar?")
          ? { publication: continuationId(continuation.publication) }
          : {}),
        ...(next.startsWith("/anuncio/")
          ? { ad: continuationId(continuation.ad) }
          : {}),
      }),
    );
  }
  catch {
    return {
      status: "error" as const,
      error:
        "Não foi possível enviar o e-mail. Tente novamente ou entre novamente na conta.",
    };
  }
}
export async function correctEmailAddress(
  input: { email: string; password: string },
  continuation: VerificationContinuation = {},
) {
  const parsed = z
    .object({
      email: z.email().max(254),
      password: z.string().min(1).max(4096),
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      status: "error" as const,
      error: "Informe um e-mail válido e a senha atual.",
    };
  const user = await getCurrentUser();
  if (!user)
    return {
      status: "error" as const,
      error: "Entre na sua conta para corrigir o e-mail.",
    };
  try {
    const next = await destination(user.uid, continuation);
    return await correctUnverifiedEmail(
      parsed.data,
      continueUrl({
        ...(next.startsWith("/publicar?")
          ? { publication: continuationId(continuation.publication) }
          : {}),
        ...(next.startsWith("/anuncio/")
          ? { ad: continuationId(continuation.ad) }
          : {}),
      }),
    );
  }
  catch {
    return {
      status: "error" as const,
      error: "Não foi possível corrigir o e-mail. Tente novamente.",
    };
  }
}
export async function applyEmailVerification(code: string) {
  const parsed = z.string().min(1).max(4096).safeParse(code);
  if (!parsed.success)
    return {
      status: "error" as const,
      error: "Link inválido. Solicite outro e-mail de verificação.",
    };
  return confirmEmailVerification(parsed.data);
}
