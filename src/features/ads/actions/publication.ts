"use server";

import { AdOperationError } from "@tudomacae/ads/operationError";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { assertEmailAllowsPublication } from "@tudomacae/ads/publicationEligibility";
import type { PublicationReview } from "@tudomacae/ads/client";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adListingTags } from "@tudomacae/ads";
import { pendingPublicationTransitions } from "../../../integrations/ads/pendingPublicationTransitions";
import {
  savePublication, readPublication,
  savePublicationProfile as persistProfile,
  pendingPublicationInput, publicationProfileInput, publicationReviewInput,
  type PendingPublicationInput, type PublicationProfileInput,
} from "@/integrations/ads/publication";

async function account() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta para continuar.");
  return user.uid;
}
const identityTypeRequiredMessage = "Escolha se este perfil é pessoal ou de um negócio.";
function failure(error: unknown) {
  return { success: false as const, error: error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente." };
}
export async function savePendingPublication(input: PendingPublicationInput) {
  try {
    const publication = await savePublication(await account(), pendingPublicationInput.parse(input));
    revalidatePath("/minha-conta/anuncios");
    return { success: true as const, publication };
  }
  catch (error) { return failure(error); }
}
export async function getPendingPublication(id: string) {
  const publication = await readPublication(await account(), id);
  if (!publication || publication.deleting) return null;
  const images = (publication.images ?? []).map(image => ({
    ...image,
    url: `/api/publicacoes-pendentes/${encodeURIComponent(id)}/fotos/${encodeURIComponent(image.id)}`,
  }));
  return { ...publication, images };
}
const expectedFailurePrefixes = [
  "Entre na sua conta",
  "Confirme seu e-mail",
  "Publicação não encontrada",
  "Este anúncio foi pausado",
  "Complete o perfil",
  "Complete o nome",
  "Use a exclusão do anúncio publicado",
  "Aguarde o envio das fotos",
  "Este rascunho foi alterado em outra aba",
  "O perfil foi alterado em outra aba",
];
const expectedFailureMessages = new Set([
  "A publicação ainda não foi concluída.",
  "Esta publicação está sendo excluída. Tente concluir a exclusão em Meus anúncios.",
  "A limpeza das fotos ainda não terminou. Tente publicar novamente.",
]);
function isExpectedFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof AdOperationError || error.name === "ZodError") return true;
  if (error instanceof PhotoError && error.code !== "unavailable") return true;
  return expectedFailureMessages.has(error.message) || expectedFailurePrefixes.some(prefix => error.message.startsWith(prefix));
}
function logMutationFailure(event: string, outcome: string, operation: "publish" | "delete", operationId: string, error: unknown) {
  console.error(JSON.stringify({
    event, service: process.env.K_SERVICE ?? "next",
    environment: process.env.NODE_ENV, release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome, operation, operationId,
    route: "server-action:ads.pending-publication", cause: error instanceof Error ? error.name : "UnknownError",
  }));
}
const photoUnavailableMessage = "A foto salva não está disponível. Remova ou substitua a foto e tente publicar novamente.";
/** Publishing reports a linked photo without a stored object as `PhotoError("unavailable")`; the journey sends the advertiser back to the photos. */
function isPhotoUnavailable(operation: "publish" | "delete", error: unknown) {
  return operation === "publish" && error instanceof PhotoError && error.code === "unavailable";
}
function mutationFailure(operation: "publish" | "delete", error: unknown, operationId: string) {
  if (isPhotoUnavailable(operation, error)) {
    logMutationFailure("ads.pending_publication.linked_photo_missing", "media_missing", operation, operationId, error);
    return { success: false as const, error: photoUnavailableMessage, photoUnavailable: true };
  }
  if (isExpectedFailure(error)) return { ...failure(error), photoUnavailable: false };
  logMutationFailure("ads.pending_publication.mutation_failed", "unexpected_failure", operation, operationId, error);
  return { success: false as const, error: `Não foi possível concluir esta etapa. Tente novamente. Código: ${operationId}`, photoUnavailable: false };
}
/** A new profile needs an explicit identity type so the account keeps at most one personal profile. */
function profileWithIdentityType({ identityType, ...fields }: PublicationProfileInput) {
  if (!identityType && !fields.profileId) throw new AdOperationError("conflict", identityTypeRequiredMessage);
  return identityType ? { ...fields, identityType } : fields;
}
export async function savePublicationProfile(input: PublicationProfileInput) {
  try {
    const profileId = await persistProfile(await account(), profileWithIdentityType(publicationProfileInput.parse(input)));
    updateTag(`advertiser-profile-${profileId}`);
    revalidatePath("/minha-conta/perfis");
    revalidatePath("/minha-conta/anuncios");
    return { success: true as const, profileId };
  }
  catch (error) { return failure(error); }
}
export async function publishPendingPublication(id: string, reviewed: PublicationReview) {
  const operationId = crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Entre na sua conta para continuar.");
    assertEmailAllowsPublication(user.emailVerified, undefined, "active");
    const userId = user.uid;
    const result = await pendingPublicationTransitions.publish(userId, id, publicationReviewInput.parse(reviewed));
    for (const tag of adListingTags(result)) updateTag(tag);
    updateTag(`ads-by-profile-${result.advertiserProfileId}`);
    updateTag(`ad-${result.adId}`);
    revalidatePath("/");
    revalidatePath("/minha-conta/anuncios");
    return { success: true as const, adId: result.adId, slug: result.slug };
  }
  catch (error) {
    let publication = null;
    try {
      publication = await readPublication(await account(), id);
    }
    catch { /* Inaccessible publications cannot supply recovery state. */ }
    return { ...mutationFailure("publish", error, operationId), publication };
  }
}
export async function deletePendingPublication(id: string) {
  const operationId = crypto.randomUUID();
  try {
    await pendingPublicationTransitions.delete(await account(), id);
    revalidatePath("/minha-conta/anuncios");
    return { success: true as const };
  }
  catch (error) { return mutationFailure("delete", error, operationId); }
}
