import type { PendingAdPublication } from "@tudomacae/ads/client";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { readErrorMessage } from "./responseBody";

type PublicationRecovery = { publication: PendingAdPublication; profiles: AdvertiserProfileData[] };

class RecoveryReadFailure extends Error {}

const RELOAD_MESSAGE = "Não foi possível retomar a publicação. Recarregue a página e tente novamente.";

export async function readPendingPublication(id: string): Promise<PublicationRecovery> {
  try {
    const response = await fetch(`/api/publicacoes-pendentes/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new RecoveryReadFailure(readErrorMessage(data) ?? "Não foi possível retomar a publicação. Tente novamente.");
    }
    if (!isPublicationRecovery(data, id)) throw new RecoveryReadFailure(RELOAD_MESSAGE);
    return data;
  }
  catch (error) {
    if (error instanceof RecoveryReadFailure) throw error;
    throw new RecoveryReadFailure(RELOAD_MESSAGE);
  }
}

function isPublicationRecovery(data: unknown, id: string): data is PublicationRecovery {
  if (!data || typeof data !== "object") return false;
  if (!("publication" in data) || !hasId(data.publication, id)) return false;
  return "profiles" in data && Array.isArray(data.profiles);
}

function hasId(value: unknown, id: string): boolean {
  return !!value && typeof value === "object" && "id" in value && value.id === id;
}
