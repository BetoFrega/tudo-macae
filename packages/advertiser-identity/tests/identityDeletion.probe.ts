import { strict as assert } from "node:assert";
import type { createAdvertiserIdentityDeletion } from "../identityDeletion";

export async function run(module: { createAdvertiserIdentityDeletion: typeof createAdvertiserIdentityDeletion }) {
  const snapshot = {
    profile: { id: "profile", userId: "owner", title: "Perfil", description: "", createdAt: 1, updatedAt: 1 },
    ads: [], catalogItems: [], evidence: "version",
  };
  const deletion = module.createAdvertiserIdentityDeletion({
    store: {
      async read() { return snapshot; },
      async delete(_input, decide) { return decide(snapshot).result; },
    },
    digest: value => value, ownsImagePath: () => false, now: () => 1,
    reportImageCleanupSkipped: () => {},
  });
  const preview = await deletion.preview({ id: "profile", actorId: "admin", channel: "administration" });
  const result = await deletion.delete({ id: "profile", actorId: "admin", channel: "administration", reason: "Duplicado", confirmedTitle: "Perfil", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" });
  assert.equal(result.outcome, "deleted");
}
