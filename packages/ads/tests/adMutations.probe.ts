import { strict as assert } from "node:assert";
import type { createAdMutations, AdMutationRecord } from "../adMutations";

export async function run(module: { createAdMutations: typeof createAdMutations }) {
  let record: AdMutationRecord | null = {
    userId: "owner",
    advertiserProfileId: "profile",
  };
  const mutations = module.createAdMutations({
    now: () => 1000,
    store: {
      async transact(_id, decide) {
        await decide({
          async read() { return record; },
          async readRetiredPaths() { return []; },
          async readProfile() {
            return {
              userId: "owner",
              title: "Ana",
              contacts: [{ number: "22999999999" }],
            };
          },
          update(fields) { record = { ...record!, ...fields }; },
        });
      },
    },
  });

  await mutations.update("ad", { status: "active" });
  assert.equal(record?.status, "active");
  await mutations.updateStatus({ id: "ad", status: "paused" });
  assert.equal(record?.status, "paused");
}
