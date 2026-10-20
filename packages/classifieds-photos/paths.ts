import { isValidPublicImageKey } from "@tudomacae/public-image-delivery/cacheTag";
import { isAdImagePathInDirectory } from "@tudomacae/ads/rawImagePath";

export function createPhotoPathPolicy(digest: (bytes: Uint8Array) => Promise<string>) {
  async function directory(kind: "ad" | "profile", ownerId: string) {
    const prefix = kind === "ad" ? "ad-images" : "profile-photos";
    const direct = `${prefix}/${ownerId}/`;
    if (ownerId !== "_legacy" && isValidPublicImageKey(`${direct}photo.webp`)) return direct;
    return `${prefix}/_legacy/${await digest(new TextEncoder().encode(ownerId))}/`;
  }
  async function owns(record: { ownerKind: "ad" | "profile"; ownerId: string; path: string }) {
    const prefix = await directory(record.ownerKind, record.ownerId);
    if (record.ownerKind === "ad") return isAdImagePathInDirectory(record.ownerId, record.path, prefix);
    if (record.path.startsWith(prefix) && isValidPublicImageKey(record.path)) return true;
    const raw = `profile-photos/${record.ownerId}/`;
    if (!record.path.startsWith(raw) || record.ownerId === "." || record.ownerId === ".." || /[\\\u0000-\u001f\u007f]/u.test(record.ownerId)) return false;
    const relative = record.path.slice(raw.length);
    return (record.ownerId !== "_legacy" || !relative.includes("/")) && isValidPublicImageKey(`profile-photos/historical/${relative}`);
  }
  return { directory, owns };
}
