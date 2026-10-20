export type PublicImageClass = "ad" | "profile" | "editorial";
export const editorialCacheProbeHeader = "x-editorial-cache-probe";
export const editorialCacheVariantHeader = "x-editorial-cache-variant";
export type PublicImagePreset = "avatar" | "card" | "gallery" | "thumbnail" | "hero";

// Match Next.js's default grid so enabling the canary does not change candidates
// for image consumers outside its explicit component boundary.
export const publicImageDeviceSizes = [
  640,
  750,
  828,
  1080,
  1200,
  1920,
  2048,
  3840,
] as const;
export const publicImageSizes = [32, 48, 64, 96, 128, 256, 384] as const;

export const publicImagePresetWidths = {
  ad: {
    card: publicImageDeviceSizes,
    gallery: [256, 384, ...publicImageDeviceSizes],
    thumbnail: [128, 256],
  },
  profile: { avatar: [48, 64, 96, 128] },
  editorial: { hero: [...publicImageSizes, ...publicImageDeviceSizes] },
} as const;

export const publicImagePrefixes: Record<PublicImageClass, string> = {
  ad: "ad-images/",
  profile: "profile-photos/",
  editorial: "editorial/",
};

export function negotiatedImageFormat(accept: string | null): "avif" | "webp" | "jpeg" {
  if (!accept) return "jpeg";

  const ranges = accept.split(",").map((entry) => {
    const [mediaType, ...parameters] = entry.trim().toLowerCase().split(";");
    const qualityParameter = parameters.find(parameter => parameter.trim().startsWith("q="));
    const parsedQuality = qualityParameter
      ? Number(qualityParameter.trim().slice(2))
      : 1;
    return {
      mediaType,
      quality: Number.isFinite(parsedQuality)
        ? Math.min(1, Math.max(0, parsedQuality))
        : 0,
    };
  });

  function qualityFor(mediaType: string) {
    const exact = ranges.filter(range => range.mediaType === mediaType);
    if (exact.length > 0) return Math.max(...exact.map(range => range.quality));
    const imageWildcard = ranges.filter(range => range.mediaType === "image/*");
    if (imageWildcard.length > 0) {
      return Math.max(...imageWildcard.map(range => range.quality));
    }
    return Math.max(
      0,
      ...ranges.filter(range => range.mediaType === "*/*")
        .map(range => range.quality),
    );
  }

  const candidates = [
    { format: "avif" as const, quality: qualityFor("image/avif") },
    { format: "webp" as const, quality: qualityFor("image/webp") },
    { format: "jpeg" as const, quality: qualityFor("image/jpeg") },
  ];
  candidates.sort((left, right) => right.quality - left.quality);
  const selected = candidates[0]!;
  return selected.quality > 0 ? selected.format : "jpeg";
}
