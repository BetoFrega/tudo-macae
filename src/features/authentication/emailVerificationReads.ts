import z from "zod";
import { getCurrentUser } from "./actions/getCurrentUser";
import { readEmailVerification } from "@/integrations/authentication/verification";
import { listPublications, readPublication } from "@/integrations/ads/publication";
import { accountReminder } from "@/features/authentication/accountReminder";
import { AdvertiserProfileAccessError, getUserAdvertiserProfilesUseCase } from "@/packages/classifieds-api";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { verifyAdOwnershipUseCase } from "@/integrations/ads/use-cases/verifyAdOwnershipUseCase";

export interface VerificationContinuation {
  publication?: string | undefined;
  ad?: string | undefined;
}

export function continuationId(value: unknown) {
  const parsed = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function verificationDestination(uid: string, continuation: VerificationContinuation = {}) {
  const id = continuationId(continuation.publication);
  if (id) {
    try {
      const publication = await readPublication(uid, id);
      if (publication && !publication.completed) return `/publicar?publication=${encodeURIComponent(id)}`;
    }
    catch { /* A foreign or missing publication cannot become a continuation. */ }
  }
  const adId = continuationId(continuation.ad);
  if (adId) {
    try {
      await verifyAdOwnershipUseCase({ id: adId, userId: uid });
      return `/anuncio/${encodeURIComponent(adId)}/editar`;
    }
    catch { /* A foreign or missing Ad cannot become a continuation. */ }
  }
  return "/minha-conta/anuncios";
}

export async function readEmailVerificationState(continuation: VerificationContinuation = {}): Promise<(Awaited<ReturnType<typeof readEmailVerification>> & { destination: string }) | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const state = await readEmailVerification();
    return { ...state, destination: await verificationDestination(user.uid, continuation) };
  }
  catch {
    return { uid: user.uid, email: user.email ?? "", emailVerified: user.emailVerified, nextSendAt: 0, destination: "/minha-conta/anuncios", error: "Não foi possível consultar a verificação. Tente novamente." };
  }
}

export async function readAccountReminder(requested?: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!user.emailVerified) {
    const next = await verificationDestination(user.uid, { publication: requested });
    return accountReminder(false, [], [], next.startsWith("/publicar?") ? requested : undefined);
  }
  try {
    const pending = await listPublications(user.uid);
    if (!pending.length) return null;
    const profiles = await getUserAdvertiserProfilesUseCase(user.uid);
    return accountReminder(true, pending, profiles);
  }
  catch (error) {
    if (isForbiddenRead(error)) return null;
    throw error;
  }
}

function isForbiddenRead(error: unknown): boolean {
  return (error instanceof ClassifiedsRequestError && error.code === "forbidden")
    || (error instanceof AdvertiserProfileAccessError && error.reason === "forbidden")
    || (error instanceof AdOperationError && error.code === "forbidden");
}
