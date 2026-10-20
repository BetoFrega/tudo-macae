import type {
  GrantSourcePermissionInput,
  RevokeSourcePermissionInput,
  SourcePermission,
  SourcePermissionRevocation,
  SourcePermissionState,
  SourcePermissionValidityReadInput,
} from "./lib/sourcePermissionTypes";
import {
  sourcePermissionCapabilities,
  type SourcePermissionCapability,
} from "./sourcePermissionCapabilities";

const MAX_EVIDENCE_LENGTH = 2_000;
const MAX_REVOCATION_REASON_LENGTH = 1_000;

function requiredText(
  value: string,
  maximumLength: number,
  message: string,
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new TypeError(message);
  }
  return normalized;
}

function epochMilliseconds(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(message);
  return value;
}

export function validatedSourcePermissionCapability(
  value: string,
): SourcePermissionCapability {
  if (!sourcePermissionCapabilities.includes(
    value as SourcePermissionCapability,
  )) {
    throw new TypeError("Escolha uma capacidade válida para a Fonte.");
  }
  return value as SourcePermissionCapability;
}

export function validatedSourcePermissionGrant(
  input: GrantSourcePermissionInput,
  now: number,
) {
  const sourceId = requiredText(
    input.sourceId,
    500,
    "Escolha uma Fonte válida.",
  );
  const evidence = requiredText(
    input.evidence,
    MAX_EVIDENCE_LENGTH,
    "Informe uma evidência de até 2.000 caracteres.",
  );
  const validFrom = epochMilliseconds(
    input.validFrom,
    "Informe o início da vigência.",
  );
  const expiresAt = epochMilliseconds(
    input.expiresAt,
    "Informe a expiração da permissão.",
  );
  if (expiresAt <= validFrom || expiresAt <= now) {
    throw new TypeError("A expiração deve ser posterior ao início e ao instante atual.");
  }
  return {
    sourceId,
    capability: validatedSourcePermissionCapability(input.capability),
    evidence,
    validFrom,
    expiresAt,
  };
}

export function validatedSourcePermissionRevocation(
  input: RevokeSourcePermissionInput,
) {
  return {
    permissionId: requiredText(
      input.permissionId,
      500,
      "Escolha uma Permissão da fonte válida.",
    ),
    reason: requiredText(
      input.reason,
      MAX_REVOCATION_REASON_LENGTH,
      "Informe um motivo de até 1.000 caracteres.",
    ),
  };
}

export function validatedSourcePermissionValidityRead(
  input: SourcePermissionValidityReadInput,
) {
  return {
    permissionId: requiredText(
      input.permissionId,
      500,
      "Escolha uma Permissão da fonte válida.",
    ),
    capability: validatedSourcePermissionCapability(input.capability),
    requestId: requiredText(
      input.requestId,
      500,
      "Informe a identificação da consulta.",
    ),
  };
}

type PermissionValidity = Pick<
  SourcePermission,
  "capability" | "expiresAt" | "validFrom"
>;

type RevocationValidity = Pick<SourcePermissionRevocation, "revokedAt">;

export function sourcePermissionStateAt(
  permission: Pick<PermissionValidity, "expiresAt" | "validFrom">,
  revocation: RevocationValidity | undefined,
  now: number,
): SourcePermissionState {
  if (revocation && revocation.revokedAt <= now) return "revoked";
  if (now < permission.validFrom) return "scheduled";
  if (now >= permission.expiresAt) return "expired";
  return "valid";
}

export function sourcePermissionIsValidAt(
  permission: PermissionValidity,
  revocation: RevocationValidity | undefined,
  capability: SourcePermissionCapability,
  now: number,
): boolean {
  return permission.capability === capability
    && sourcePermissionStateAt(permission, revocation, now) === "valid";
}
