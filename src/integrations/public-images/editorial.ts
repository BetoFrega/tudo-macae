import { editorialImageKey } from "@tudomacae/public-image-delivery/editorial";

export function editorialImageTransformOrigin(): string | undefined {
  const configuredOrigin = process.env.NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN;
  if (!configuredOrigin) return undefined;
  try {
    const origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return undefined;
    return origin.origin;
  }
  catch {
    return undefined;
  }
}

export function editorialLeadImageUrl(media: { id: string; digest?: string | undefined }, fallback: string): string {
  const key = editorialImageKey(media.id, media.digest ?? "");
  const origin = editorialImageTransformOrigin();
  return key && origin ? `${origin}/v1/editorial/hero/1200/${encodeURIComponent(key)}` : fallback;
}

export function editorialListingLeadImageUrl(article: { publicationReceiptId?: string | undefined }, media: { id: string; digest?: string | undefined }, fallback: string): string {
  return article.publicationReceiptId ? editorialLeadImageUrl(media, fallback) : fallback;
}
