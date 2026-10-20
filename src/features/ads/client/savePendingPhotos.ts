import type { PendingPhoto } from "@tudomacae/ads/syncPendingPublicationImages";
import { readErrorMessage } from "./responseBody";

export async function savePendingPhotos(publicationId: string, formData: FormData): Promise<{ success: true; images: PendingPhoto[] } | { success: false; error: string }> {
  try {
    const response = await fetch(`/api/publicacoes-pendentes/${encodeURIComponent(publicationId)}/fotos`, { method: "POST", body: formData });
    const data: unknown = await response.json();
    if (response.ok && hasImages(data)) return { success: true, images: data.images };
    const error = readErrorMessage(data);
    if (error !== undefined) return { success: false, error };
  }
  catch { /* Preserve local files for retry after a network failure. */ }
  return { success: false, error: "Não foi possível salvar as fotos. Tente novamente." };
}

function hasImages(data: unknown): data is { images: PendingPhoto[] } {
  return !!data && typeof data === "object" && "images" in data && Array.isArray(data.images);
}
