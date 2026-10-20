import { isValidPublicImageKey } from "@tudomacae/public-image-delivery/cacheTag";

export function ownsRawAdImagePath(adId: string, path: string): boolean {
  if (!adId.trim() || adId.includes("/")) return false;
  const prefix = `ad-images/${adId}/`;
  if (!path.startsWith(prefix)) return false;
  const relative = path.slice(prefix.length);
  if (!relative) return false;
  if (adId !== "_legacy") return true;
  return !relative.includes("/") || (relative.startsWith("pending/") && !relative.slice("pending/".length).includes("/"));
}

function hasUnsafeAdIdSegment(adId: string): boolean {
  return adId === "." || adId === ".." || adId.includes("\\")
    || Array.from(adId).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function isAdImagePathInDirectory(adId: string, path: string, directory: string): boolean {
  if (isValidPublicImageKey(path)) {
    if (path.startsWith(directory) && path !== directory) return true;
    return adId === "_legacy" && ownsRawAdImagePath(adId, path);
  }
  const rawPrefix = `ad-images/${adId}/`;
  if (directory === rawPrefix || !ownsRawAdImagePath(adId, path) || hasUnsafeAdIdSegment(adId)) return false;
  // Historical IDs can differ from their hashed directory; the relative key
  // still obeys the current segment policy before Storage receives the raw path.
  return isValidPublicImageKey(`ad-images/historical/${path.slice(rawPrefix.length)}`);
}
