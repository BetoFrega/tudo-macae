import type { SourcePermissionCapability } from "../sourcePermissionCapabilities";

export type { SourcePermissionCapability } from "../sourcePermissionCapabilities";

export type SourcePermissionState
  = "scheduled" | "valid" | "expired" | "revoked";

export interface SourcePermissionRevocation {
  permissionId: string;
  reason: string;
  revokedByEditorId: string;
  revokedAt: number;
}

export interface SourcePermission {
  id: string;
  sourceId: string;
  capability: SourcePermissionCapability;
  evidence: string;
  validFrom: number;
  expiresAt: number;
  confirmedByEditorId: string;
  confirmedAt: number;
  createdAt: number;
  state: SourcePermissionState;
  revocation?: SourcePermissionRevocation;
}

export interface GrantSourcePermissionInput {
  sourceId: string;
  capability: SourcePermissionCapability;
  evidence: string;
  validFrom: number;
  expiresAt: number;
}

export interface GrantSourcePermissionResult {
  permission: SourcePermission;
  correlationId: string;
}

export interface RevokeSourcePermissionInput {
  permissionId: string;
  reason: string;
}

export type RevokeSourcePermissionResult
  = | {
    status: "revoked";
    permission: SourcePermission;
    correlationId: string;
  }
  | { status: "alreadyRevoked";
    permission: SourcePermission; };

export interface SourcePermissionValidityReadInput {
  permissionId: string;
  capability: SourcePermissionCapability;
  requestId: string;
}

export interface SourcePermissionValidityReadResult {
  valid: boolean;
  requestId: string;
}
