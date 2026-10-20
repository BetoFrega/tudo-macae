import { PhotoError, PhotoPurgeError, type PhotoDependencies, type PhotoRecord, type PhotoStore } from "@tudomacae/classifieds-photos";
import { publicImageCacheTag, publicImageCacheGeneration, isValidPublicImageKey } from "@tudomacae/public-image-delivery/cacheTag";
import { createHash } from "node:crypto";
import { classifiedsImageSourceUrl } from "@tudomacae/public-image-delivery/source";
import { createPublicImagePurger, type PublicImagePurgeAdapter } from "@tudomacae/public-image-delivery/purge";

export function createClassifiedsPhotoPurge(input: {
  store: PhotoStore; adapter: PublicImagePurgeAdapter; classifiedsOrigin: string;
  verifyVisibility(record: PhotoRecord): Promise<boolean>; wait(ms: number): Promise<void>;
}): PhotoDependencies["purge"] {
  const cacheKey = (record: PhotoRecord) => isValidPublicImageKey(record.path)
    ? record.path
    : `${record.ownerKind === "ad" ? "ad-images" : "profile-photos"}/_legacy/${createHash("sha256").update(record.path).digest("hex")}/source`;
  return {
    async prepare(record) {
      const original = classifiedsImageSourceUrl(record.path, input.classifiedsOrigin);
      if (!original) throw new PhotoPurgeError([{ layer: "resizing", cause: "configuration" }]);
      const url = new URL(original);
      url.searchParams.set("cache_generation", publicImageCacheGeneration);
      // Raw legacy keys bypass Worker caching. Their source URLs still require
      // both purge layers; a safe alias supplies the shared retry protocol's tag.
      const tag = await publicImageCacheTag(cacheKey(record));
      await input.store.transact(async (tx) => {
        const live = await tx.photo(record.path);
        if (!live || live.status !== "retiring" || live.claimToken !== record.claimToken) throw new PhotoError("conflict", "A limpeza mudou antes da purga.");
        if (!live.purgeSources) tx.savePhoto({ ...live, purgeTag: tag, purgeSources: [url.href] });
      });
    },
    async verify(record) {
      const live = await input.store.transact(tx => tx.photo(record.path));
      if (!live?.purgeSources || !live.purgeTag || live.claimToken !== record.claimToken) return { success: false, failures: [{ layer: "metadata", cause: "conflict" }] };
      // The adapter purges the sources recorded by `prepare`, whichever origin they name.
      const purger = createPublicImagePurger({ classifiedsOrigin: input.classifiedsOrigin, wait: input.wait,
        adapter: { isConfigured: () => input.adapter.isConfigured(), purge: (target, signal) => input.adapter.purge({ ...target, tags: [live.purgeTag!], files: live.purgeSources! }, signal) } });
      const result = await purger.purge(cacheKey(record));
      if (!result.success) return { success: false, failures: result.failures.map(({ layer, cause }) => ({ layer, cause })) };
      try {
        return await input.verifyVisibility(record) ? { success: true } : { success: false, failures: [{ layer: "visibility", cause: "verification" }] };
      }
      catch { return { success: false, failures: [{ layer: "visibility", cause: "transport" }] }; }
    },
  };
}
