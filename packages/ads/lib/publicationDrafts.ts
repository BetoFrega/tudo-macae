import { AdOperationError } from "../operationError";
import { hasPublishableProfile, personalProfileExistsMessage, publicationReviewSnapshot, publicationProfileReviewSnapshot, type PublicationReview, type PendingAdPublication } from "../client";
import type { PublicationActivityArea, PublicationDraftDependencies, PublicationDraftTransaction, PublicationProfileRecord, PublicationRecord } from "../publicationDrafts";
import { pendingPublicationInput, publicationIdentifier, type PendingPublicationInput, publicationProfileInput, type PublicationProfileInput } from "./publicationInput";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { hasPendingPublication } from "../visibility";

function owned(record: PublicationRecord, userId: string, authorityMode: "legacy" | "identity"): PendingAdPublication {
  if (!(authorityMode === "identity" && record.advertiserProfileId) && record.userId !== userId) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
  if (!["pending", "publishing", "published", "deleting"].includes(record.publicationState ?? "")) throw new AdOperationError("conflict", "Este anúncio não tem uma publicação pendente.");
  return {
    id: record.id, userId: record.userId, title: record.title, text: record.text,
    categoryId: record.categoryId, subcategoryId: record.subcategoryId,
    ...(record.advertiserProfileId ? { advertiserProfileId: record.advertiserProfileId } : {}),
    createdAt: record.createdAt, ...(record.revision ? { revision: record.revision } : {}),
    images: record.images,
    published: record.publicationState === "publishing" || record.publicationState === "published",
    completed: record.publicationState === "published",
    ...(record.publicationState === "deleting" ? { deleting: true } : {}),
  };
}

const deletingMessage = "Esta publicação está sendo excluída. Tente concluir a exclusão em Meus anúncios.";

function assertNotDeleting(publication: PendingAdPublication) {
  if (publication.deleting) throw new AdOperationError("conflict", deletingMessage);
}

async function assertDraftProfileOwner(transaction: PublicationDraftTransaction, profileId: string | undefined, ownerId: string) {
  if (!profileId) return;
  if ((await transaction.readProfile(profileId))?.userId !== ownerId) {
    throw new AdOperationError("conflict", "Perfil não encontrado nesta conta.");
  }
}

function draftPublication(parsed: PendingPublicationInput, ownerId: string, existing: PendingAdPublication | undefined, record: PublicationRecord | null, createdAt: () => number) {
  const { advertiserProfileId, ...fields } = parsed;
  return {
    ...fields, ...(advertiserProfileId ? { advertiserProfileId } : {}),
    userId: existing ? (record?.userId ?? ownerId) : ownerId, createdAt: existing?.createdAt ?? createdAt(),
  };
}

function pendingImageState(record: PublicationRecord | null) {
  return {
    ...(record?.pendingImageCleanupPaths?.length ? { pendingImageCleanupPaths: record.pendingImageCleanupPaths } : {}),
    ...(record?.pendingImageCleanupClaims?.length ? { pendingImageCleanupClaims: record.pendingImageCleanupClaims } : {}),
    ...(record?.pendingImageUploadReservations?.length ? { pendingImageUploadReservations: record.pendingImageUploadReservations } : {}),
  };
}

function assertSelectableProfile(profile: PublicationProfileRecord | null, requestedProfileId: string | undefined, ownerId: string) {
  if ((profile && profile.userId !== ownerId) || (requestedProfileId && !profile)) throw new AdOperationError("conflict", "Perfil não encontrado nesta conta.");
}

/** Matches the profile limit in `activityAreasSchema` of advertiser-identity; a larger value lets this write exceed it. */
const maxActivityAreas = 3;

/**
 * The area comes from the stored publication, never from the client. It is skipped when already declared, when the
 * profile is full, or when the taxonomy cannot confirm it is active.
 */
async function declaredActivityAreas(transaction: PublicationDraftTransaction, parsed: PublicationProfileInput, publication: PendingAdPublication, profile: PublicationProfileRecord | null) {
  if (!parsed.declareActivityArea || !publication.categoryId || !publication.subcategoryId) return undefined;
  const area: PublicationActivityArea = { categoryId: publication.categoryId, subcategoryId: publication.subcategoryId };
  const current = profile?.activityAreas ?? [];
  if (current.length >= maxActivityAreas || current.some(item => item.categoryId === area.categoryId && item.subcategoryId === area.subcategoryId)) return undefined;
  if (!(await transaction.isActivityAreaActive?.(area))) return undefined;
  return [...current, area];
}

function profileWrite(parsed: PublicationProfileInput, ownerId: string, profile: PublicationProfileRecord | null, updatedAt: number, activityAreas: PublicationActivityArea[] | undefined) {
  return {
    userId: ownerId, title: parsed.title, contacts: parsed.contacts, updatedAt,
    revision: profile ? (profile.revision ?? 1) + 1 : 1,
    ...(!profile ? { description: "", createdAt: updatedAt } : {}),
    ...(!profile && parsed.identityType ? { identityType: parsed.identityType } : {}),
    ...(activityAreas ? { activityAreas } : {}),
  };
}

async function assertIdentityTypeAvailable(transaction: PublicationDraftTransaction, parsed: PublicationProfileInput, ownerId: string, profile: PublicationProfileRecord | null) {
  if (profile || !parsed.identityType) return;
  if (!transaction.personalProfileOf) throw new AdOperationError("conflict", "Tipo de identidade indisponível nesta composição.");
  if (parsed.identityType === "personal" && await transaction.personalProfileOf(ownerId) !== null) {
    throw new AdOperationError("conflict", personalProfileExistsMessage);
  }
}

function assertDraftReviewed(publication: PendingAdPublication, reviewed: PublicationReview | undefined) {
  if (reviewed && JSON.stringify(publicationReviewSnapshot(publication)) !== JSON.stringify(publicationReviewSnapshot(reviewed))) {
    throw new AdOperationError("conflict", "Este rascunho foi alterado em outra aba. Confira o conteúdo atualizado antes de publicar.");
  }
}

function assertProfileReviewed(profile: PublicationProfileRecord, reviewed: PublicationReview | undefined) {
  if (reviewed && JSON.stringify(publicationProfileReviewSnapshot(profile)) !== JSON.stringify(publicationProfileReviewSnapshot(reviewed.advertiserProfile))) {
    throw new AdOperationError("conflict", "O perfil foi alterado em outra aba. Confira os dados atualizados de quem anuncia antes de publicar.");
  }
}

function alreadyPublishedResult(record: PublicationRecord, publication: PendingAdPublication, id: string) {
  if (record.publicationState === "published" && record.status !== "active") throw new AdOperationError("conflict", "Este anúncio foi pausado. Use Meus anúncios para reativá-lo.");
  return { adId: id, slug: String(record.slug), categoryId: publication.categoryId, subcategoryId: publication.subcategoryId, advertiserProfileId: publication.advertiserProfileId! };
}

function assertImagesSettled(record: PublicationRecord) {
  if (record.pendingImageUploadReservations?.length) throw new AdOperationError("conflict", "Aguarde o envio das fotos terminar antes de publicar.");
  if (record.pendingImageCleanupPaths?.length || record.pendingImageCleanupClaims?.length) throw new AdOperationError("conflict", "A limpeza das fotos ainda não terminou. Tente publicar novamente.");
}

export function buildPublicationDrafts({ store, now, authorityMode = "legacy" }: PublicationDraftDependencies) {
  /** `created` is true only for the call whose transaction wrote a profile that did not exist. */
  async function saveProfileOutcome(userId: string, input: PublicationProfileInput) {
    const ownerId = publicationIdentifier.parse(userId);
    const parsed = publicationProfileInput.parse(input);
    return store.transact(parsed.publicationId, async (transaction) => {
      const record = await transaction.read();
      if (!record) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
      const publication = owned(record, ownerId, authorityMode);
      if (publication.published) throw new AdOperationError("conflict", "Este anúncio já foi publicado.");
      assertNotDeleting(publication);
      const profileId = parsed.profileId ?? publication.advertiserProfileId ?? `publication-${parsed.publicationId}`;
      const profile = await transaction.readProfile(profileId);
      assertSelectableProfile(profile, parsed.profileId, ownerId);
      await assertIdentityTypeAvailable(transaction, parsed, ownerId, profile);
      const activityAreas = await declaredActivityAreas(transaction, parsed, publication, profile);
      transaction.saveProfile(profileId, profileWrite(parsed, ownerId, profile, now(), activityAreas));
      return { profileId, created: !profile };
    });
  }
  return {
    async save(userId: string, input: PendingPublicationInput) {
      const ownerId = publicationIdentifier.parse(userId);
      const parsed = pendingPublicationInput.parse(input);
      return store.transact(parsed.id, async (transaction) => {
        const record = await transaction.read();
        const existing = record ? owned(record, ownerId, authorityMode) : undefined;
        if (existing?.published) return existing;
        if (existing) assertNotDeleting(existing);
        await assertDraftProfileOwner(transaction, parsed.advertiserProfileId, ownerId);
        const publication = draftPublication(parsed, ownerId, existing, record, now);
        transaction.save({
          ...publication, status: "paused", publicationState: "pending",
          slug: slugify(parsed.title), images: record?.images ?? [], ...pendingImageState(record),
        });
        return publication;
      });
    },
    async saveProfile(userId: string, input: PublicationProfileInput) {
      return (await saveProfileOutcome(userId, input)).profileId;
    },
    saveProfileOutcome,
    async publish(userId: string, id: string, reviewed?: PublicationReview) {
      const ownerId = publicationIdentifier.parse(userId);
      return store.transact(publicationIdentifier.parse(id), async (transaction) => {
        const record = await transaction.read();
        if (!record) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
        const publication = owned(record, ownerId, authorityMode);
        assertNotDeleting(publication);
        assertDraftReviewed(publication, reviewed);
        if (publication.published) return alreadyPublishedResult(record, publication, id);
        assertImagesSettled(record);
        if (!publication.advertiserProfileId) throw new AdOperationError("conflict", "Complete o perfil antes de publicar.");
        const profile = await transaction.readProfile(publication.advertiserProfileId);
        if (profile?.userId !== ownerId || !hasPublishableProfile(profile)) throw new AdOperationError("conflict", "Complete o nome e um contato do perfil antes de publicar.");
        assertProfileReviewed(profile, reviewed);
        const slug = slugify(publication.title);
        transaction.updatePublication({ slug, status: "paused", publicationState: "publishing", updatedAt: now() });
        return { adId: id, slug, categoryId: publication.categoryId, subcategoryId: publication.subcategoryId, advertiserProfileId: publication.advertiserProfileId };
      });
    },
    /** Resolves true only for the call that moved the publication to `published`; a repeated completion resolves false. */
    async complete(userId: string, id: string, reviewed?: PublicationReview) {
      const ownerId = publicationIdentifier.parse(userId);
      return store.transact(publicationIdentifier.parse(id), async (transaction) => {
        const record = await transaction.read();
        if (!record) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
        const publication = owned(record, ownerId, authorityMode);
        if (!publication.published) throw new AdOperationError("conflict", "A publicação ainda não foi concluída.");
        if (record.publicationState === "published") return false;
        if (publication.advertiserProfileId) {
          const profile = await transaction.readProfile(publication.advertiserProfileId);
          if (profile?.userId !== ownerId) throw new AdOperationError("conflict", "Perfil não encontrado nesta conta.");
          if (!hasPublishableProfile(profile)) throw new AdOperationError("conflict", "Complete o nome e um contato do perfil antes de publicar.");
          assertProfileReviewed(profile, reviewed);
        }
        transaction.updatePublication({ publicationState: "published", status: "active" });
        return true;
      });
    },
    async returnToPending(userId: string, id: string) {
      const ownerId = publicationIdentifier.parse(userId);
      await store.transact(publicationIdentifier.parse(id), async (transaction) => {
        const record = await transaction.read();
        if (!record) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
        owned(record, ownerId, authorityMode);
        if (record.publicationState === "publishing") {
          transaction.updatePublication({ publicationState: "pending", status: "paused", updatedAt: now() });
        }
      });
    },
    async startDelete(userId: string, id: string) {
      const ownerId = publicationIdentifier.parse(userId);
      await store.transact(publicationIdentifier.parse(id), async (transaction) => {
        const record = await transaction.read();
        if (!record) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
        const publication = owned(record, ownerId, authorityMode);
        if (publication.completed) throw new AdOperationError("conflict", "Use a exclusão do anúncio publicado.");
        if (record.pendingImageUploadReservations?.length) throw new AdOperationError("conflict", "Aguarde o envio das fotos terminar antes de excluir.");
        if (!publication.deleting) transaction.updatePublication({ publicationState: "deleting" });
      });
    },
    async delete(userId: string, id: string) {
      const ownerId = publicationIdentifier.parse(userId);
      await store.transact(publicationIdentifier.parse(id), async (transaction) => {
        const record = await transaction.read();
        if (!record) throw new AdOperationError("conflict", "Publicação não encontrada nesta conta.");
        const publication = owned(record, ownerId, authorityMode);
        if (publication.published) throw new AdOperationError("conflict", "Use a exclusão do anúncio publicado.");
        if (!publication.deleting) throw new AdOperationError("conflict", "Inicie a exclusão da publicação antes de remover o registro.");
        transaction.deletePublication();
      });
    },
    async read(userId: string, id: string) {
      const ownerId = publicationIdentifier.parse(userId);
      const record = await store.read(publicationIdentifier.parse(id));
      return record ? owned(record, ownerId, authorityMode) : null;
    },
    async list(userId: string) {
      const ownerId = publicationIdentifier.parse(userId);
      const records = await store.list(ownerId);
      return records.filter(hasPendingPublication).map(record => owned(record, ownerId, authorityMode));
    },
  };
}
