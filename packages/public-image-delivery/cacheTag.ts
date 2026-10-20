import { publicImagePrefixes } from "./contract";
import { parseEditorialImageKey } from "./editorial";

export const publicImageCacheGeneration = "2";

export class InvalidPublicImageKeyError extends Error {}

export function isValidPublicImageKey(key: string): boolean {
  if (key.startsWith("editorial/")) return parseEditorialImageKey(key) !== null;
  return Object.values(publicImagePrefixes).some(prefix => key.startsWith(prefix))
    && /^[A-Za-z0-9._/-]+$/.test(key)
    && !key.split("/").some(segment => !segment || segment === "." || segment === "..");
}

export async function publicImageCacheTag(key: string): Promise<string> {
  if (!isValidPublicImageKey(key)) throw new InvalidPublicImageKeyError("Invalid public image key");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `public-image-${hex}`;
}
