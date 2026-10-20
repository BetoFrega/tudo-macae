import { responseFailure } from "@tudomacae/editorial-media/client";
import { revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { workerMedia } from "@/packages/media-api";
import { MediaRevisionConflictError } from "@tudomacae/media/errors";
import { updateMedia } from "./updateMedia";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/packages/media-api", async importOriginal => ({ ...await importOriginal<typeof import("@/packages/media-api")>(), workerMedia: vi.fn() }));

const edit = {
  id: "media-1",
  expectedRevision: 3,
  reason: "Crédito identificado na fonte original.",
  form: {
    kind: "article-image" as const,
    alt: "Fachada da Prefeitura de Macaé",
    caption: "Sede da Prefeitura",
    origin: "own-production" as const,
    creator: "Maria Souza",
    credit: "Foto: Maria Souza/Tudo Macaé",
    acquiredAt: "2026-08-20T14:30",
    displayBasis: "own-production" as const,
    provider: "",
    sourceUrl: "",
    license: "",
    permissionReference: "",
  },
};

function signedInAs(isAdmin: boolean, isEditor = false) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "user-1",
    email: "pessoa@example.com", emailVerified: true,
    isAdmin,
    isEditor,
  });
}

const write = vi.fn();

describe("updateMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    write.mockReset().mockResolvedValue({});
    vi.mocked(workerMedia).mockResolvedValue({ write } as never);
  });

  test("uses trusted actor identity and the expected canonical revision", async () => {
    signedInAs(true);
    const { reason: _reason, ...adminEdit } = edit;
    await expect(updateMedia(adminEdit)).resolves.toEqual({ success: true });
    expect(write).toHaveBeenCalledWith("update", {
      id: "media-1",
      expectedRevision: 3,
      metadata: {
        kind: "article-image",
        alt: edit.form.alt,
        caption: edit.form.caption,
        provenance: {
          origin: "own-production",
          creator: "Maria Souza",
          credit: "Foto: Maria Souza/Tudo Macaé",
          displayBasis: "own-production",
          acquiredAt: Date.parse("2026-08-20T17:30:00.000Z"),
        },
      },
    });
    expect(revalidateTag).toHaveBeenCalledWith("media", "max");
    expect(updateTag).toHaveBeenCalledWith("media");
  });

  test("keeps the correction reason mandatory for Editors", async () => {
    signedInAs(false, true);
    const { reason: _reason, ...editorEdit } = edit;
    await expect(updateMedia(editorEdit)).resolves.toEqual({
      success: false,
      error: "Informe o motivo da correção.",
    });
    expect(write).not.toHaveBeenCalled();
  });

  test("records Editor corrections through the revisioned editorial operation", async () => {
    signedInAs(false, true);
    await expect(updateMedia(edit)).resolves.toEqual({ success: true });
    expect(write).toHaveBeenCalledWith("correct", {
      mediaId: "media-1",
      expectedRevision: 3,
      reason: edit.reason,
      metadata: {
        alt: edit.form.alt,
        caption: edit.form.caption,
        provenance: expect.objectContaining({ credit: edit.form.credit }),
      },
    });
  });

  test("refuses a visitor and a non-administrator", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateMedia(edit)).resolves.toMatchObject({ success: false });
    signedInAs(false);
    await expect(updateMedia(edit)).resolves.toMatchObject({ success: false });
    expect(write).not.toHaveBeenCalled();
  });

  test("refuses malformed metadata and immutable file fields", async () => {
    signedInAs(true);
    await expect(updateMedia({
      ...edit,
      form: { ...edit.form, alt: " " },
    })).resolves.toEqual({
      success: false,
      error: "Informe o texto alternativo da imagem.",
    });
    await expect(updateMedia({
      ...edit,
      storagePath: "media/outra.webp",
    } as never)).resolves.toMatchObject({ success: false });
    expect(write).not.toHaveBeenCalled();
  });

  test("returns a stable refusal and logs an unexpected failure once", async () => {
    signedInAs(true);
    write.mockRejectedValue(
      new Error("worker down /private/path?token=secret"),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(updateMedia(edit)).resolves.toEqual({
      success: false,
      error: "Falha ao atualizar a mídia.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledTimes(1);
    const log = JSON.parse(String(errorLog.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(log).toMatchObject({
      event: "media.update.failed",
      service: "nextjs",
      environment: expect.any(String),
      release: expect.any(String),
      route: "server-action:updateMedia",
      executionId: expect.any(String),
      operation: "media.update",
      outcome: "error",
      statusClass: "5xx",
      errorType: "Error",
    });
    expect(JSON.stringify(log)).not.toMatch(/worker down|private\/path|token=secret/);
  });

  test("a Worker refusal reaches the person without an operational log", async () => {
    signedInAs(false, true);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    write.mockRejectedValueOnce(new MediaRevisionConflictError(4));
    await expect(updateMedia(edit)).resolves.toEqual({ success: false, error: "A Mídia mudou desde a revisão esperada." });
    expect(errorLog).not.toHaveBeenCalled();
  });

  test("a failure the Worker already logged is not logged again", async () => {
    signedInAs(false, true);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    write.mockRejectedValueOnce(responseFailure(new Response(null, { status: 500, headers: { "x-media-error-reported": "1" } })));
    await expect(updateMedia(edit)).resolves.toEqual({ success: false, error: "Falha ao atualizar a mídia." });
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
