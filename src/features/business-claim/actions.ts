"use server";

import { revalidatePath } from "next/cache";
import { BusinessClaimError } from "@tudomacae/advertiser-identity/businessClaim";
import type { BusinessClaimFormState, BusinessClaimReviewState } from "./formState";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { businessClaimVisible } from "@/integrations/advertiser-identity/businessClaimVisibility";
import { businessClaims } from "@/packages/classifieds-api/businessClaims";

const unavailable = "Não foi possível enviar agora. Tente novamente em alguns minutos.";

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

type ClaimFailure = Extract<BusinessClaimFormState, { status: "error" }>;

function failure(error: unknown): ClaimFailure {
  if (error instanceof BusinessClaimError) return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  return { status: "error", message: unavailable, fieldErrors: {} };
}

/** The account comes from the session; the Worker records its verified e-mail with the claim. */
export async function submitBusinessClaim(businessId: string, _previous: BusinessClaimFormState, form: FormData): Promise<BusinessClaimFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Entre na sua conta para pedir esta página.", fieldErrors: {} };
  if (!await businessClaimVisible()) return { status: "error", message: unavailable, fieldErrors: {} };
  try {
    await businessClaims.submit({
      businessId, operationId: text(form, "operationId"),
      responsibleName: text(form, "responsibleName"), cnpj: text(form, "cnpj"), note: text(form, "note"),
    });
  }
  catch (error) {
    return failure(error);
  }
  revalidatePath("/negocio/[id]/[slug]/reivindicar", "page");
  return { status: "submitted" };
}

/** Only administrators review; the Worker rechecks the role and the claim's revision. */
export async function reviewBusinessClaim(_previous: BusinessClaimReviewState, form: FormData): Promise<BusinessClaimReviewState> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { status: "error", message: "Você não pode fazer esta operação.", fieldErrors: {} };
  const outcome = text(form, "outcome");
  try {
    await businessClaims.review({
      businessId: text(form, "businessId"), claimId: text(form, "claimId"),
      expectedRevision: Number(text(form, "expectedRevision")), operationId: text(form, "operationId"),
      outcome, verification: text(form, "verification") || undefined, reason: text(form, "reason") || undefined,
    });
  }
  catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/reivindicacoes");
  revalidatePath("/negocio/[id]/[slug]", "page");
  return { status: "reviewed", outcome: outcome === "approved" ? "approved" : "rejected" };
}
