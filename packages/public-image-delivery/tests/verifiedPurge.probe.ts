import type * as entry from "../verifiedPurge";
export async function run(module: typeof entry) {
  const purger = module.createVerifiedPublicImagePurger({
    purgeMany: async () => ({ success: true, attempts: 0, failures: [] }),
    verifyAbsent: async () => true, wait: async () => {},
  });
  if (!(await purger.purgeMany([`editorial/photo/${"a".repeat(64)}`])).success) throw Error("Verified purge failed");
}
