import { expect, test } from "vitest";
import type { PhotoRecord, PhotoStore, PhotoTransaction } from "@tudomacae/classifieds-photos";
import { publicImageCacheGeneration } from "@tudomacae/public-image-delivery/cacheTag";
import type { PublicImagePurgeTarget } from "@tudomacae/public-image-delivery/purge";
import { createClassifiedsPhotoPurge } from "../lib/classifiedsPhotoPurge";

const path = "ad-images/ad-1/photo.webp";
const workerSource = `https://api.example/api/classifieds/photos/public/${encodeURIComponent(path)}?cache_generation=${publicImageCacheGeneration}`;

function setup(stored: Partial<PhotoRecord> = {}) {
  let record = { path, ownerKind: "ad", status: "retiring", claimToken: "claim", ...stored } as PhotoRecord;
  const store = { transact: async decide => decide({
    photo: async () => record,
    savePhoto: (saved) => { record = saved; },
  } as PhotoTransaction) } as PhotoStore;
  const targets: PublicImagePurgeTarget[] = [];
  const purge = createClassifiedsPhotoPurge({ store, classifiedsOrigin: "https://api.example", wait: async () => {}, verifyVisibility: async () => true,
    adapter: { isConfigured: () => true, purge: async (target) => {
      targets.push(target);
      return { success: true, cause: "provider", retryable: false };
    } } });
  return { purge, targets, current: () => record };
}

test("prepare records only the Classifieds Worker source and verify purges exactly it", async () => {
  const { purge, targets, current } = setup();
  await purge.prepare(current());
  expect(current().purgeSources).toEqual([workerSource]);
  expect(await purge.verify(current())).toEqual({ success: true });
  expect(targets.map(target => [target.layer, target.files])).toEqual([["worker", [workerSource]], ["resizing", [workerSource]]]);
});

test("a retirement already holding sources of another origin purges them as recorded", async () => {
  const recorded = ["https://retired-origin.example/photo.webp?cache_generation=2", workerSource];
  const { purge, targets, current } = setup({ purgeSources: recorded, purgeTag: "public-image-recorded" });
  await purge.prepare(current());
  expect(current().purgeSources).toEqual(recorded);
  expect(await purge.verify(current())).toEqual({ success: true });
  expect(targets.find(target => target.layer === "resizing")).toMatchObject({ tags: ["public-image-recorded"], files: recorded });
});
