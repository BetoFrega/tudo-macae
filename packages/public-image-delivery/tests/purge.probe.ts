import type * as entry from "../purge";

export async function run(module: typeof entry) {
  const purger = module.createPublicImagePurger({
    adapter: { isConfigured: () => true, purge: async () => ({ success: true, cause: "provider", retryable: false }) },
    classifiedsOrigin: "https://classifieds.invalid",
    wait: async () => {},
  });
  if (!(await purger.purge("ad-images/ad/image.webp")).success) throw new Error("Purge failed");
  if (!(await purger.purgeMany(["profile-photos/profile/image.webp"])).success) throw new Error("Batch purge failed");
}
