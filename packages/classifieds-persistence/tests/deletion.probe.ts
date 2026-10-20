import type * as entry from "../deletion";
export async function run(module: typeof entry) {
  const policy = module.createClassifiedsDeletionPolicy();
  policy.audit({ reason: "Solicitado" });
  await policy.plan({ profile: null, version: 0, adCount: 0, catalogItemCount: 0, imageCount: 0, activeReservations: 0, legacyImages: 0, skippedImages: 0 }, 0);
}
