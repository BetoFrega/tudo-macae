import { describe, expect, test, vi } from "vitest";
import { createAdvertiserIdentityDeletion, type IdentityDeletionSnapshot } from "../identityDeletion";

function fixture(replayed = false) {
  const reportImageCleanupSkipped = vi.fn();
  let snapshot: IdentityDeletionSnapshot = {
    profile: { id: "profile", userId: "owner", title: "Oficina", description: "", revision: 1, createdAt: 1, updatedAt: 1 },
    ads: [{ id: "ad", title: "Reparo", status: "active", categoryId: "services" }],
    catalogItems: [{ id: "offering", name: "Consulta" }],
    evidence: "version-1",
  };
  const deletion = createAdvertiserIdentityDeletion({
    store: {
      async read() { return snapshot; },
      async delete(_input, decide) { return { ...decide(snapshot).result, replayed }; },
    },
    digest: value => value,
    ownsImagePath: () => false,
    now: () => 10,
    reportImageCleanupSkipped,
  });
  return { deletion, reportImageCleanupSkipped, change: (next: Partial<IdentityDeletionSnapshot>) => {
    snapshot = { ...snapshot, ...next };
  } };
}

describe("administrative identity deletion", () => {
  test("returns actionable upload preconditions without deleting content", async () => {
    const { deletion, change, reportImageCleanupSkipped } = fixture();
    change({ ads: [{ id: "ad", title: "Reparo", status: "active", categoryId: "services", pendingImageUploadReservations: [{ path: "upload", expiresAt: 100 }] }] });
    const preview = await deletion.preview({ id: "profile", actorId: "admin" });
    await expect(deletion.delete({ id: "profile", actorId: "admin", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" })).rejects.toMatchObject({
      code: "imageCleanupBlocked", message: "Aguarde o envio das fotos terminar antes de excluir o perfil.",
    });
    expect(reportImageCleanupSkipped).not.toHaveBeenCalled();
  });

  test("reports unsafe legacy photos as a remediation precondition", async () => {
    const { deletion, change } = fixture();
    change({ ads: [{ id: "ad", title: "Reparo", status: "active", categoryId: "services", images: [{ path: "ad-images/ad/legacy" }] }] });
    const preview = await deletion.preview({ id: "profile", actorId: "admin" });
    await expect(deletion.delete({ id: "profile", actorId: "admin", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" })).rejects.toMatchObject({
      code: "imageCleanupBlocked", message: expect.stringContaining("fotos antigas"),
    });
  });

  test.each([false, true])("reports retained unowned paths only for a committed mutation, replayed=%s", async (replayed) => {
    const { deletion, change, reportImageCleanupSkipped } = fixture(replayed);
    change({ ads: [{ id: "ad", title: "Reparo", status: "active", categoryId: "services", images: [{ path: "shared/path" }] }] });
    const preview = await deletion.preview({ id: "profile", actorId: "admin" });
    const result = await deletion.delete({ id: "profile", actorId: "admin", correlationId: "request", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" });
    expect(result.imageCleanupSkippedCount).toBe(1);
    if (replayed) expect(reportImageCleanupSkipped).not.toHaveBeenCalled();
    else expect(reportImageCleanupSkipped).toHaveBeenCalledExactlyOnceWith({ correlationId: "request", count: 1 });
  });

  test("previews owned identities and returns public cache effects for associated content", async () => {
    const { deletion } = fixture();
    const preview = await deletion.preview({ id: "profile", actorId: "admin" });
    expect(preview).toMatchObject({ title: "Oficina", ads: [{ id: "ad", title: "Reparo" }], catalogItems: [{ id: "offering", name: "Consulta" }] });
    const result = await deletion.delete({ id: "profile", actorId: "admin", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" });
    expect(result).toMatchObject({ outcome: "deleted", deletedAds: 1 });
    expect(result.cacheTags).toContain("ads");
    expect(result.cacheTags).toHaveLength(4);
  });

  test("refuses changed snapshot evidence", async () => {
    const { deletion, change } = fixture();
    const preview = await deletion.preview({ id: "profile", actorId: "admin" });
    change({ evidence: "version-2" });
    await expect(deletion.delete({ id: "profile", actorId: "admin", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" })).rejects.toMatchObject({ code: "revisionConflict" });
  });

  test("binds preview to the administrator and checks exact typed title", async () => {
    const { deletion } = fixture();
    const preview = await deletion.preview({ id: "profile", actorId: "admin" });
    const input = { id: "profile", actorId: "admin", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: preview.confirmationToken, idempotencyKey: "delete" };
    await expect(deletion.delete({ ...input, actorId: "another-admin" })).rejects.toMatchObject({ code: "revisionConflict" });
    await expect(deletion.delete({ ...input, confirmedTitle: "Outro perfil" })).rejects.toMatchObject({ code: "revisionConflict" });
    await expect(deletion.delete({ ...input, reason: " " })).rejects.toThrow();
  });

  test("refuses missing and incoherent profiles", async () => {
    const { deletion, change } = fixture();
    change({ profile: null });
    await expect(deletion.preview({ id: "profile", actorId: "admin" })).rejects.toMatchObject({ code: "notFound" });
    change({ profile: { id: "bad", title: "Perfil", description: "", createdAt: 1, updatedAt: 1 } });
    await expect(deletion.preview({ id: "bad", actorId: "admin" })).rejects.toMatchObject({ code: "invalidProfileState" });
  });
});
