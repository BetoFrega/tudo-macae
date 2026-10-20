import type * as entry from "../permissions";
import { firstPartyEditorialCaller, mcpEditorialCaller } from "@tudomacae/editorial-access/caller";
export async function run(module: typeof entry) {
  const caller = firstPartyEditorialCaller("editor");
  const mcp = mcpEditorialCaller({ editorId: "editor", editorialClientId: "client" });
  const source = { id: "source", name: "Local", url: "https://example.com", canonicalUrl: "https://example.com", auxiliaryUrls: [], revision: 1, createdAt: 1, updatedAt: 1 };
  const input = { sourceId: source.id, capability: "monitoring" as const, evidence: "Written authorization", validFrom: 1, expiresAt: 100 };
  const permission = { ...input, id: "permission", confirmedByEditorId: "editor", confirmedAt: 1, createdAt: 1, state: "valid" as const };
  const permissions = module.createSourcePermissions({ now: () => 1, assertLiveEditor: async () => {}, grant: async () => ({ permission, correlationId: "granted" }), revoke: async () => ({ status: "alreadyRevoked", permission }), list: async () => [permission], hasValid: async () => true, readValidity: async (_caller, input) => ({ valid: true, requestId: input.requestId }) });
  await permissions.grant(caller, input);
  await permissions.revoke(caller, { permissionId: permission.id, reason: "Revoked" });
  await permissions.list(source.id);
  await permissions.hasValid(permission.id, "monitoring");
  await permissions.readValidity(mcp, { permissionId: permission.id, capability: "monitoring", requestId: "read" });
}
