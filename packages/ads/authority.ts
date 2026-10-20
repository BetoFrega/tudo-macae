import { AdOperationError } from "./operationError";
import { assertEmailAllowsPublication, assertPublishableProfile } from "./publicationEligibility";
import { hasCompletedPublication } from "./visibility";

interface AdAuthorityRecord { userId: string; advertiserProfileId?: string | undefined; deleting?: boolean | undefined; status?: string | undefined; publicationState?: string | undefined; revision: number }
interface ProfileAuthorityRecord { userId?: unknown; deleting?: unknown; title?: unknown; contacts?: unknown }

/** These decisions use fresh transaction values; persistence owns applying the effects. */
export function createAdAuthority(actor: { id: string; admin: boolean; emailVerified: boolean }) {
  const deny = () => {
    throw new AdOperationError("forbidden", "Anúncio não disponível nesta conta.");
  };
  function owner(userId: unknown, allowAdmin = true) {
    if (userId !== actor.id && !(allowAdmin && actor.admin)) deny();
  }
  function profile(value: ProfileAuthorityRecord | null, userId: unknown, allowAdmin = false) {
    if (!value || value.deleting || (value.userId !== userId && !(allowAdmin && actor.admin))) deny();
  }
  function authorize(ad: AdAuthorityRecord, value: ProfileAuthorityRecord | null, allowAdmin = true) {
    if (ad.deleting) deny();
    if (ad.advertiserProfileId) {
      if (!value || value.deleting) deny();
      owner(value?.userId, allowAdmin);
    }
    else owner(ad.userId, allowAdmin);
  }
  function completed(ad: AdAuthorityRecord) {
    if (!hasCompletedPublication(ad.publicationState === undefined ? {} : { publicationState: ad.publicationState })) throw new AdOperationError("conflict", "Conclua a publicação antes de editar o anúncio.");
  }
  return {
    owner, profile, authorize, completed,
    canListForProfile(value: ProfileAuthorityRecord | null) { return !!value && !value.deleting; },
    administrator() { if (!actor.admin) deny(); },
    create(value: ProfileAuthorityRecord | null) {
      profile(value, actor.id);
      assertEmailAllowsPublication(actor.emailVerified, undefined, "active");
      assertPublishableProfile(value);
    },
    mutate(ad: AdAuthorityRecord, nextStatus: string | undefined) {
      completed(ad);
      assertEmailAllowsPublication(actor.emailVerified, ad.status, nextStatus);
    },
    publish(ad: AdAuthorityRecord, revision: number | undefined) {
      if (ad.publicationState !== "published") {
        if (ad.revision !== revision) throw new AdOperationError("conflict", "Releia a publicação antes de publicar.");
        assertEmailAllowsPublication(actor.emailVerified, undefined, "active");
      }
    },
  };
}
