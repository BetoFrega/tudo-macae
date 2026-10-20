import assert from "node:assert/strict";
import type { createAdUpdate } from "../adUpdate";

export async function run(module: { createAdUpdate: typeof createAdUpdate }) {
  const calls: string[] = [];
  const edit = module.createAdUpdate({
    read: async () => ({ images: [{ id: "photo", path: "ad-images/ad/photo.webp", order: 0 }] }),
    update: async (_id, fields) => {
      assert.deepEqual(fields.cancelImagePaths, ["ad-images/ad/photo.webp"]);
      calls.push("update");
    },
    pendingCleanup: async () => ["ad-images/ad/photo.webp"],
    remove: async () => { calls.push("remove"); },
    acknowledge: async () => { calls.push("acknowledge"); },
    correlationId: () => "operation",
    jobId: () => "job",
    report: () => { throw new Error("Unexpected cleanup failure"); },
  });
  assert.deepEqual(await edit.update({ id: "ad", categoryId: "cat", subcategoryId: "sub", title: "Bicicleta", text: "Bicicleta em bom estado", images: [], observedImageIds: ["photo"] }), { slug: "bicicleta" });
  assert.deepEqual(calls, ["update", "remove", "acknowledge"]);
}
