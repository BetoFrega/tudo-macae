import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { createPhotoPathPolicy } from "../paths";
const paths = createPhotoPathPolicy(async bytes => createHash("sha256").update(bytes).digest("hex"));

test.each(["ad", "profile"] as const)("%s preserves safe legacy paths without crossing owners or the reserved hash namespace", async (ownerKind) => {
  const prefix = ownerKind === "ad" ? "ad-images" : "profile-photos";
  const ownerId = "negócio 1";
  const directory = await paths.directory(ownerKind, ownerId);
  expect(await paths.owns({ ownerKind, ownerId, path: `${directory}photo.png` })).toBe(true);
  expect(await paths.owns({ ownerKind, ownerId, path: `${prefix}/${ownerId}/photo.png` })).toBe(true);
  expect(await paths.owns({ ownerKind, ownerId: "another", path: `${directory}photo.png` })).toBe(false);
  expect(await paths.owns({ ownerKind, ownerId, path: `${prefix}/${ownerId}/../another/photo.png` })).toBe(false);
  expect(await paths.owns({ ownerKind, ownerId: "_legacy", path: `${directory}photo.png` })).toBe(false);
  expect(await paths.owns({ ownerKind, ownerId: "_legacy", path: `${prefix}/_legacy/photo.png` })).toBe(true);
});
