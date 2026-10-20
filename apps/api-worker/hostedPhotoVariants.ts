import { publicImageDeviceSizes, publicImageSizes } from "@tudomacae/public-image-delivery/contract";

const widths = new Set<number>([...publicImageDeviceSizes, ...publicImageSizes]);
export function hostedPhotoVariant(width: number) {
  if (!widths.has(width)) throw new TypeError("Unsupported photo width");
  return `w${Math.min(width, 1920)}`;
}

/** Provision separately; private images must never have an always-public variant. Variants are account-wide, so ids name the transformation, not a consumer. */
export const hostedPhotoVariants = [...new Set([...widths].map(width => Math.min(width, 1920)))].map(width => ({
  id: hostedPhotoVariant(width),
  options: { width, height: 1920, fit: "scale-down" as const, metadata: "none" as const },
  neverRequireSignedURLs: false,
}));
