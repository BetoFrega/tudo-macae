import { firstPartyCallerDetails, mcpEditorialReadCallerDetails, type EditorialCaller, type FirstPartyEditorialCallerDetails, type McpEditorialReadCallerDetails } from "@tudomacae/editorial-access/caller";
import { validatedSourcePermissionCapability, validatedSourcePermissionGrant, validatedSourcePermissionRevocation, validatedSourcePermissionValidityRead } from "./sourcePermissionPolicy";
import type { GrantSourcePermissionInput, GrantSourcePermissionResult, RevokeSourcePermissionInput, RevokeSourcePermissionResult, SourcePermission, SourcePermissionCapability, SourcePermissionValidityReadInput, SourcePermissionValidityReadResult } from "./lib/sourcePermissionTypes";
export type { GrantSourcePermissionInput, GrantSourcePermissionResult, RevokeSourcePermissionInput, RevokeSourcePermissionResult, SourcePermission, SourcePermissionCapability, SourcePermissionRevocation, SourcePermissionState, SourcePermissionValidityReadInput, SourcePermissionValidityReadResult } from "./lib/sourcePermissionTypes";
export { sourcePermissionCapabilities } from "./sourcePermissionCapabilities";

export interface SourcePermissionDependencies {
  now(): number;
  assertLiveEditor(uid: string): Promise<void>;
  grant(caller: FirstPartyEditorialCallerDetails, input: GrantSourcePermissionInput, now: number): Promise<GrantSourcePermissionResult>;
  revoke(caller: FirstPartyEditorialCallerDetails, input: RevokeSourcePermissionInput, now: number): Promise<RevokeSourcePermissionResult>;
  list(sourceId: string, now: number): Promise<SourcePermission[]>;
  hasValid(permissionId: string, capability: SourcePermissionCapability, now: number): Promise<boolean>;
  readValidity(caller: McpEditorialReadCallerDetails, input: SourcePermissionValidityReadInput, now: number): Promise<SourcePermissionValidityReadResult>;
}
export function createSourcePermissions(dependencies: SourcePermissionDependencies) {
  return {
    async grant(caller: EditorialCaller, input: GrantSourcePermissionInput) {
      const details = firstPartyCallerDetails(caller);
      await dependencies.assertLiveEditor(details.editorId);
      const now = dependencies.now();
      return dependencies.grant(details, validatedSourcePermissionGrant(input, now), now);
    },
    async revoke(caller: EditorialCaller, input: RevokeSourcePermissionInput) {
      const details = firstPartyCallerDetails(caller);
      await dependencies.assertLiveEditor(details.editorId);
      return dependencies.revoke(details, validatedSourcePermissionRevocation(input), dependencies.now());
    },
    async list(sourceId: string) {
      const normalized = sourceId.trim();
      if (!normalized) throw new TypeError("Escolha uma Fonte válida.");
      return dependencies.list(normalized, dependencies.now());
    },
    async hasValid(permissionId: string, capability: SourcePermissionCapability) {
      const normalized = permissionId.trim();
      if (!normalized) return Promise.resolve(false);
      return dependencies.hasValid(normalized, validatedSourcePermissionCapability(capability), dependencies.now());
    },
    async readValidity(caller: EditorialCaller, input: SourcePermissionValidityReadInput) {
      return dependencies.readValidity(mcpEditorialReadCallerDetails(caller), validatedSourcePermissionValidityRead(input), dependencies.now());
    },
  };
}
