import { isAdImagePathInDirectory } from "./rawImagePath";
import { createHash } from "node:crypto";
import { isValidPublicImageKey } from "@tudomacae/public-image-delivery/cacheTag";

export function adImageDirectoryPrefix(adId: string): string {
  if (!adId.trim() || adId.includes("/")) throw new Error("Invalid ad id");
  const direct = `ad-images/${adId}/`;
  if (adId !== "_legacy" && isValidPublicImageKey(`${direct}photo.jpg`)) return direct;
  const digest = createHash("sha256").update(adId).digest("hex");
  return `ad-images/_legacy/${digest}/`;
}

export function isAdImagePath(adId: string, path: string): boolean {
  const directory = adImageDirectoryPrefix(adId);
  return isAdImagePathInDirectory(adId, path, directory);
}
