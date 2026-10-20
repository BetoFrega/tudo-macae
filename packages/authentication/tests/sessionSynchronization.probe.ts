import type * as entry from "../sessionSynchronization";

export async function run(module: typeof entry) {
  const synchronizer = module.createSessionSynchronizer({
    async resolve() { return { status: "invalid" }; },
    async clearInvalidCookies() {},
  });
  await synchronizer.synchronize("cookie");
}
