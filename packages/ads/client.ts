export const MAX_TITLE_LENGTH = 140;
export const MIN_TEXT_LENGTH = 10;
export const MAX_TEXT_LENGTH = 1000;
/** Conflict when the publication journey creates a second personal profile; the journey recognizes it to update the type choice. */
export const personalProfileExistsMessage = "Sua conta já tem um perfil pessoal. Escolha “Um negócio” para criar outro perfil.";

export interface PublicationContact {
  number: string;
  isWhatsapp: boolean;
}

export interface PendingAdPublication {
  revision?: number;
  id: string;
  userId: string;
  title: string;
  text: string;
  categoryId: string;
  subcategoryId: string;
  advertiserProfileId?: string | undefined;
  createdAt: number;
  published?: boolean;
  completed?: boolean;
  deleting?: boolean;
  images?: { id: string; path: string; title?: string; description?: string; order: number; url?: string; pending?: boolean; uploadRevision?: number }[];
}

export type PublicationReview = Pick<PendingAdPublication, "title" | "text" | "categoryId" | "subcategoryId" | "advertiserProfileId"> & {
  images: { id: string; title: string; description: string; order: number }[];
  advertiserProfile: { title: string; contacts: PublicationContact[] };
};

export function publicationProfileReviewSnapshot(profile: unknown): PublicationReview["advertiserProfile"] {
  const record = profile && typeof profile === "object" ? profile : {};
  const contacts = "contacts" in record && Array.isArray(record.contacts) ? record.contacts : [];
  return {
    title: "title" in record && typeof record.title === "string" ? record.title.trim() : "",
    contacts: contacts.map((contact: unknown) => ({
      number: contact && typeof contact === "object" && "number" in contact && typeof contact.number === "string" ? contact.number : "",
      isWhatsapp: !!contact && typeof contact === "object" && "isWhatsapp" in contact && contact.isWhatsapp === true,
    })),
  };
}

export function publicationReviewSnapshot(publication: Omit<PublicationReview, "images" | "advertiserProfile"> & {
  images?: { id: string; title?: string; description?: string; order: number }[];
}, profile?: unknown): PublicationReview {
  return {
    title: publication.title.trim(), text: publication.text,
    categoryId: publication.categoryId, subcategoryId: publication.subcategoryId,
    ...(publication.advertiserProfileId ? { advertiserProfileId: publication.advertiserProfileId } : {}),
    images: (publication.images ?? []).map(image => ({ id: image.id, title: image.title ?? "", description: image.description ?? "", order: image.order })),
    advertiserProfile: publicationProfileReviewSnapshot(profile),
  };
}

export type ProfileRequirement = "title" | "contact";

function hasProfileTitle(record: object | undefined): boolean {
  return !!record && "title" in record && typeof record.title === "string" && !!record.title.trim();
}

function isValidProfileContact(contact: unknown): boolean {
  return !!contact
    && typeof contact === "object"
    && "number" in contact
    && typeof contact.number === "string"
    && /^\d{10,11}$/.test(contact.number);
}

export function missingPublishableProfileRequirements(profile: unknown): ProfileRequirement[] {
  const missing: ProfileRequirement[] = [];
  const record = profile && typeof profile === "object" ? profile : undefined;

  if (!hasProfileTitle(record)) {
    missing.push("title");
  }

  const contacts = record && "contacts" in record && Array.isArray(record.contacts)
    ? record.contacts
    : [];
  const hasValidContact = contacts.some(isValidProfileContact);

  if (!hasValidContact) missing.push("contact");
  return missing;
}

export function hasPublishableProfile(profile: unknown): boolean {
  return missingPublishableProfileRequirements(profile).length === 0;
}
