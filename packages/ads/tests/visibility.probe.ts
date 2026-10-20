import { strict as assert } from "node:assert";
import type { createAdVisibility } from "../visibility";

export async function run(module: { createAdVisibility: typeof createAdVisibility }) {
  const visibility = module.createAdVisibility();
  assert.equal(await visibility.adStatus({}), "paused");
  assert.equal(await visibility.hasCompletedPublication({}), true);
  assert.equal(await visibility.hasPendingPublication({ publicationState: "pending" }), true);
  assert.equal(await visibility.canDiscoverAd({ status: "active" }), true);
  assert.deepEqual(await visibility.visibleAdImages([{ id: "a", path: "p", order: 0, pending: true }]), []);
}
