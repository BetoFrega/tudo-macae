import { describe, expect, test } from "vitest";
import type { GrantSourcePermissionInput } from "@tudomacae/editorial-sourcing/permissions";
import { sourcePermissionCapabilities } from "@tudomacae/editorial-sourcing/sourcePermissionCapabilities";
import {
  sourcePermissionIsValidAt,
  sourcePermissionStateAt,
  validatedSourcePermissionGrant,
  validatedSourcePermissionRevocation,
  validatedSourcePermissionValidityRead,
} from "../sourcePermissionPolicy";

const now = Date.parse("2026-08-30T15:00:00.000Z");

describe("Source Permission policy", () => {
  test("normalizes a grant for every independent capability", () => {
    for (const capability of sourcePermissionCapabilities) {
      expect(validatedSourcePermissionGrant({
        sourceId: " source-1 ",
        capability,
        evidence: " Autorização escrita. ",
        validFrom: now,
        expiresAt: now + 1,
      }, now)).toEqual({
        sourceId: "source-1",
        capability,
        evidence: "Autorização escrita.",
        validFrom: now,
        expiresAt: now + 1,
      });
    }
    expect(validatedSourcePermissionGrant({
      sourceId: "s".repeat(500),
      capability: "monitoring",
      evidence: "e".repeat(2_000),
      validFrom: 0,
      expiresAt: now + 1,
    }, now)).toMatchObject({
      sourceId: "s".repeat(500),
      evidence: "e".repeat(2_000),
      validFrom: 0,
    });
  });

  test.each([
    [{ sourceId: " " }, "Escolha uma Fonte válida."],
    [{ sourceId: "a".repeat(501) }, "Escolha uma Fonte válida."],
    [{ capability: "other" }, "Escolha uma capacidade válida"],
    [{ evidence: " " }, "Informe uma evidência"],
    [{ evidence: "a".repeat(2_001) }, "Informe uma evidência"],
    [{ validFrom: Number.NaN }, "Informe o início"],
    [{ validFrom: -1 }, "Informe o início"],
    [{ expiresAt: Number.MAX_SAFE_INTEGER + 1 }, "Informe a expiração"],
    [{ expiresAt: now }, "posterior ao início e ao instante atual"],
  ])("rejects an invalid grant field", (overrides, message) => {
    const input: GrantSourcePermissionInput = {
      sourceId: "source-1",
      capability: "monitoring",
      evidence: "Autorização escrita.",
      validFrom: now,
      expiresAt: now + 1,
    };
    Object.assign(input, overrides);
    expect(() => validatedSourcePermissionGrant(input, now)).toThrow(message);
  });

  test.each([
    { validFrom: now + 2, expiresAt: now + 1 },
    { validFrom: now + 1, expiresAt: now + 1 },
    { validFrom: now - 2, expiresAt: now - 1 },
    { validFrom: now - 1, expiresAt: now },
  ])("rejects each invalid expiry relationship independently", (overrides) => {
    expect(() => validatedSourcePermissionGrant({
      sourceId: "source-1",
      capability: "monitoring",
      evidence: "Autorização escrita.",
      ...overrides,
    }, now)).toThrow("posterior ao início e ao instante atual");
  });

  test("normalizes and bounds revocation and proportional-read inputs", () => {
    expect(validatedSourcePermissionRevocation({
      permissionId: " permission-1 ",
      reason: " Retirada pela Fonte. ",
    })).toEqual({
      permissionId: "permission-1",
      reason: "Retirada pela Fonte.",
    });
    expect(validatedSourcePermissionValidityRead({
      permissionId: " permission-1 ",
      capability: "mediaUse",
      requestId: " request-1 ",
    })).toEqual({
      permissionId: "permission-1",
      capability: "mediaUse",
      requestId: "request-1",
    });
    expect(() => validatedSourcePermissionRevocation({
      permissionId: " ",
      reason: "Retirada.",
    })).toThrow("Escolha uma Permissão da fonte válida.");
    expect(() => validatedSourcePermissionRevocation({
      permissionId: "permission-1",
      reason: "a".repeat(1_001),
    })).toThrow("Informe um motivo");
    expect(validatedSourcePermissionRevocation({
      permissionId: "p".repeat(500),
      reason: "r".repeat(1_000),
    })).toEqual({
      permissionId: "p".repeat(500),
      reason: "r".repeat(1_000),
    });
    expect(() => validatedSourcePermissionValidityRead({
      permissionId: " ",
      capability: "monitoring",
      requestId: "request-1",
    })).toThrow("Escolha uma Permissão da fonte válida.");
    expect(() => validatedSourcePermissionValidityRead({
      permissionId: "permission-1",
      capability: "monitoring",
      requestId: " ",
    })).toThrow("Informe a identificação");
  });

  test("derives scheduled, valid, expired and revoked boundaries", () => {
    const permission = {
      capability: "monitoring" as const,
      validFrom: now + 1,
      expiresAt: now + 3,
    };

    expect(sourcePermissionStateAt(permission, undefined, now)).toBe("scheduled");
    expect(sourcePermissionStateAt(permission, undefined, now + 1)).toBe("valid");
    expect(sourcePermissionStateAt(
      permission,
      { revokedAt: now + 2 },
      now + 1,
    )).toBe("valid");
    expect(sourcePermissionStateAt(permission, undefined, now + 3)).toBe("expired");
    expect(sourcePermissionStateAt(
      permission,
      { revokedAt: now + 2 },
      now + 2,
    )).toBe("revoked");
    expect(sourcePermissionIsValidAt(
      permission,
      undefined,
      "monitoring",
      now + 1,
    )).toBe(true);
    expect(sourcePermissionIsValidAt(
      permission,
      undefined,
      "reproduction",
      now + 1,
    )).toBe(false);
    expect(sourcePermissionIsValidAt(
      permission,
      undefined,
      "monitoring",
      now + 3,
    )).toBe(false);
  });
});
