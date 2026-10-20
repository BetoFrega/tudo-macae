import { publicImageCacheTag } from "./cacheTag";
import type { PurgeResult } from "./purge";

export function createVerifiedPublicImagePurger(dependencies: {
  purgeMany(keys: readonly string[]): Promise<PurgeResult>;
  verifyAbsent(keys: readonly string[]): Promise<boolean>;
  wait(milliseconds: number): Promise<void>;
}) {
  return {
    async purgeMany(keys: readonly string[]): Promise<PurgeResult> {
      const unique = [...new Set(keys)];
      if (!unique.length) return { success: true, attempts: 0, failures: [] };
      let attempts = 0;
      for (let round = 0; round < 3; round++) {
        const purged = await dependencies.purgeMany(unique);
        attempts += purged.attempts;
        if (!purged.success) return { ...purged, attempts };
        const absent = () => dependencies.verifyAbsent(unique).catch(() => false);
        // A second observation catches a late fill between successful probes.
        // This bounded window is not a global fence against future cache writes.
        if (await absent()) {
          await dependencies.wait(1000);
          if (await absent()) return { success: true, attempts, failures: [] };
        }
        if (round < 2) await dependencies.wait(1000);
      }
      return { success: false, attempts, failures: [{ layer: "worker", cause: "verification",
        tags: await Promise.all(unique.map(publicImageCacheTag)) }] };
    },
  };
}
