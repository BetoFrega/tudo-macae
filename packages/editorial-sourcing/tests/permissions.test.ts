import { expect, test } from "vitest";
import { firstPartyEditorialCaller } from "@tudomacae/editorial-access/caller";
import { createSourcePermissions } from "../permissions";

test("a removed Editor role cannot confirm a permission and grant validity uses the supplied clock", async () => {
  let role = true;
  let writes = 0;
  const permission = { id: "permission", sourceId: "source", capability: "monitoring" as const, evidence: "Autorização escrita", validFrom: 100, expiresAt: 200, confirmedByEditorId: "editor", confirmedAt: 100, createdAt: 100, state: "valid" as const };
  const permissions = createSourcePermissions({
    now: () => 100,
    assertLiveEditor: async () => {
      if (!role) throw new TypeError("O papel atual de Editor é obrigatório.");
    },
    grant: async () => {
      writes += 1;
      return { permission, correlationId: "granted" };
    },
    revoke: async () => ({ status: "alreadyRevoked", permission }),
    list: async () => [permission],
    hasValid: async () => true,
    readValidity: async (_caller, input) => ({ valid: true, requestId: input.requestId }),
  });
  const input = { sourceId: "source", capability: "monitoring" as const, evidence: "Autorização escrita", validFrom: 100, expiresAt: 200 };
  const caller = firstPartyEditorialCaller("editor");
  await expect(permissions.grant(caller, input)).resolves.toEqual({ permission, correlationId: "granted" });
  await expect(permissions.grant(caller, { ...input, expiresAt: 100 })).rejects.toThrow("expiração");
  role = false;
  await expect(permissions.grant(caller, input)).rejects.toThrow("papel atual de Editor");
  expect(writes).toBe(1);
});
