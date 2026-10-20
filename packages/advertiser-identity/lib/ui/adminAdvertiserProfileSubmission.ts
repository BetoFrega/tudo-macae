import type { UseFormSetError } from "react-hook-form";

import { adminClaimableAdvertiserProfileFormSchema } from "../../client";
import type { ActivityArea } from "../../model";
import type { AdminAdvertiserProfileFormValues as FormValues } from "./adminAdvertiserProfileEditorForm";
import type { AdminCommands } from "./context";

export interface AdminProfileInitialData {
  title: string;
  description?: string;
  photoURL?: string;
  contacts?: { number: string; isWhatsapp: boolean }[];
  activityAreas?: ActivityArea[];
  sourceUrl?: string;
  claimable?: boolean;
  revision?: number;
}

export type AdminProfileFormMode = "edit" | "create-claimable";

export function adminProfileDefaultValues(initialData: AdminProfileInitialData): FormValues {
  return {
    title: initialData.title || "",
    description: initialData.description || "",
    contacts:
      initialData.contacts?.map(c => ({
        number: c.number,
        isWhatsapp: c.isWhatsapp ?? false,
      })) ?? [],
    activityAreas: initialData.activityAreas ?? [],
    sourceUrl: initialData.sourceUrl ?? "",
  };
}

export function parseClaimableValues(
  values: FormValues,
  setError: UseFormSetError<FormValues>,
): FormValues | null {
  const result = adminClaimableAdvertiserProfileFormSchema.safeParse(values);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in values) {
      setError(field as keyof FormValues, { message: issue.message });
    }
  }
  return null;
}

export function adminProfileFormData(values: FormValues, options: {
  isClaimable: boolean;
  idempotencyKey: string;
  revision: number | undefined;
  verifySource: boolean;
  duplicateConfirmationToken: string | undefined;
}): FormData {
  const formData = new FormData();
  formData.append("title", values.title);
  if (values.description) {
    formData.append("description", values.description);
  }
  formData.append("contacts", JSON.stringify(values.contacts));
  formData.append("activityAreas", JSON.stringify(values.activityAreas));
  if (options.isClaimable) formData.append("sourceUrl", values.sourceUrl ?? "");
  formData.append("idempotencyKey", options.idempotencyKey);
  if (options.revision) formData.append("expectedRevision", String(options.revision));
  if (options.verifySource) formData.append("verifySource", "true");
  if (options.duplicateConfirmationToken) {
    formData.append("duplicateConfirmationToken", options.duplicateConfirmationToken);
  }
  return formData;
}

export type AdminProfileSaveResult
  = | { saved: true; profileId: string; revision: number }
    | { saved: false; duplicates: { id: string; title: string }[]; confirmationToken: string };

export async function saveAdminProfile(
  commands: Pick<AdminCommands, "adminCreateClaimableAdvertiserProfile" | "adminUpdateAdvertiserProfile">,
  mode: AdminProfileFormMode,
  profileId: string | undefined,
  formData: FormData,
): Promise<AdminProfileSaveResult> {
  if (mode === "create-claimable") {
    const result = await commands.adminCreateClaimableAdvertiserProfile(formData);
    if (!result.success) {
      return { saved: false, duplicates: result.duplicates, confirmationToken: result.confirmationToken };
    }
    return { saved: true, profileId: result.profileId, revision: result.revision };
  }
  const result = await commands.adminUpdateAdvertiserProfile(profileId!, formData);
  return { saved: true, profileId: profileId!, revision: result.revision };
}
