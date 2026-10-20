import { z } from "zod";

import { advertiserProfileFormSchema as formSchema } from "../../client";
import type { AdvertiserIdentityType } from "../../model";

export const profileFormSchema = formSchema.extend({
  contacts: z.array(formSchema.shape.contacts.element.extend({
    number: z.union([z.literal(""), formSchema.shape.contacts.element.shape.number]),
  })).max(3, "Máximo de 3 contatos"),
});
export type FormValues = z.infer<typeof profileFormSchema>;

export function submittedContacts(contacts: FormValues["contacts"]): FormValues["contacts"] {
  return contacts.filter(contact => contact.number.trim() !== "");
}

type ProfileInitialData = {
  title: string;
  description?: string;
  contacts?: { number: string; isWhatsapp: boolean }[];
  activityAreas?: FormValues["activityAreas"];
};
type CreationSource = "catalog" | undefined;

function initialContacts(initialData: ProfileInitialData | undefined, profileId: string | undefined): FormValues["contacts"] {
  return initialData?.contacts?.map(c => ({
    number: c.number,
    isWhatsapp: c.isWhatsapp ?? false,
  })) ?? (profileId ? [] : [{ number: "", isWhatsapp: false }]);
}

export function profileDefaultValues(initialData: ProfileInitialData | undefined, profileId: string | undefined): FormValues {
  return {
    title: initialData?.title || "",
    description: initialData?.description || "",
    contacts: initialContacts(initialData, profileId),
    activityAreas: initialData?.activityAreas ?? [],
  };
}

export type IdentityTypes = { current?: AdvertiserIdentityType; personalAvailable: boolean };

// Catalog creation is always a business, so only the generic creation asks for a type.
export function identityTypeCreationChoice(identityTypes: IdentityTypes | undefined, profileId: string | undefined, creationSource: CreationSource) {
  return { enabled: Boolean(identityTypes) && !profileId && creationSource !== "catalog", personalAvailable: identityTypes?.personalAvailable ?? false };
}

export function profileFormTitle(isEditing: boolean, creationSource: CreationSource) {
  if (isEditing) return "Editar Perfil";
  return creationSource === "catalog" ? "Criar negócio" : "Criar Perfil de Anunciante";
}

function invalidFieldLabel(path: PropertyKey[], creationSource: CreationSource) {
  if (path[0] === "title") return creationSource === "catalog" ? "Nome do negócio" : "Título do Perfil";
  if (path[0] === "description") return "Descrição";
  if (path[0] === "contacts") return typeof path[1] === "number" ? `Número de contato ${path[1] + 1}` : "Contatos";
  return "Áreas de atuação";
}

export function invalidFieldLabels(values: FormValues, creationSource: CreationSource): string[] | null {
  const parsed = profileFormSchema.safeParse(values);
  if (parsed.success) return null;
  const labels = parsed.error.issues.map(issue => invalidFieldLabel(issue.path, creationSource));
  return [...new Set(labels)];
}

export function profileFormData(
  values: FormValues,
  contacts: FormValues["contacts"],
  target: { operationId: string; identityType?: "personal" | "business" } | { expectedRevision: number },
): FormData {
  const formData = new FormData();
  formData.append("title", values.title);
  formData.append("description", values.description);
  formData.append("contacts", JSON.stringify(contacts));
  formData.append("activityAreas", JSON.stringify(values.activityAreas));
  if ("expectedRevision" in target) formData.append("expectedRevision", String(target.expectedRevision));
  else formData.append("operationId", target.operationId);
  if ("identityType" in target && target.identityType) formData.append("identityType", target.identityType);
  return formData;
}
