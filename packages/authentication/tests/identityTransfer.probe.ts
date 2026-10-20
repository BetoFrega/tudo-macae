import type * as entry from "../identityTransfer";
export async function run(module: typeof entry) {
  const transfer = module.createIdentityTransfer({
    readAuthority: async () => ({ phase: "preparing", revision: 0 }),
    readIdentities: async () => [],
    importIdentities: async () => {},
    activate: async () => true,
  });
  await transfer.prepare([]);
  await transfer.activate([]);
}
