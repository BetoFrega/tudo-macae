import { activityAreasSchema, advertiserIdentityTypeSchema, advertiserProfileContactsSchema } from "./client";

type ProfileCollectionField = "contacts" | "activityAreas";

export function formDataText(
  formData: FormData,
  name: string,
  fallback = "",
  errorLabel = name,
): string {
  const value = formData.get(name);
  if (value === null) return fallback;
  if (typeof value === "string") return value;
  throw new Error(`${errorLabel} inválido`);
}

function collection(formData: FormData, name: ProfileCollectionField): unknown[] | undefined {
  const value = formData.get(name);
  if (value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${name === "contacts" ? "Contatos" : "Áreas de atuação"} inválidos`);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  }
  catch {
    throw new Error(`${name === "contacts" ? "Contatos" : "Áreas de atuação"} inválidos`);
  }
}

export function advertiserProfileFieldsFromFormData(formData: FormData) {
  const contacts = collection(formData, "contacts");
  const activityAreas = collection(formData, "activityAreas");
  return {
    title: formDataText(formData, "title", "", "Título"),
    description: formDataText(formData, "description", "", "Descrição"),
    ...(contacts === undefined ? {} : { contacts: advertiserProfileContactsSchema.parse(contacts) }),
    ...(activityAreas === undefined ? {} : { activityAreas: activityAreasSchema.parse(activityAreas) }),
  };
}

export function identityTypeFromFormData(formData: FormData) {
  if (!formData.has("identityType")) return undefined;
  return advertiserIdentityTypeSchema.parse(formDataText(formData, "identityType", "", "Tipo de identidade"));
}
