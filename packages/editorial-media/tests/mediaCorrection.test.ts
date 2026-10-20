// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { Media } from "@tudomacae/media/model";
import {
  createMediaCorrection,
  type MediaCorrectionDependencies,
  type MediaCorrectionTransaction,
} from "../mediaCorrection";

const current: Media = {
  id: "media-1",
  kind: "article-image",
  status: "active",
  revision: 1,
  storagePath: "media/original.webp",
  mimeType: "image/webp",
  alt: "Prefeitura",
  caption: "",
  provenance: {
    origin: "own-production",
    displayBasis: "own-production",
    creator: "Ana",
    credit: "Foto: Ana",
    acquiredAt: 1,
  },
  createdAt: 1,
  updatedAt: 1,
};
const input = {
  mediaId: current.id,
  expectedRevision: 1,
  metadata: {
    alt: "Prefeitura de Macaé",
    caption: "Sede administrativa",
    provenance: current.provenance,
  },
  reason: "Descrição mais precisa",
  idempotencyKey: "request-1",
};
const caller = {
  editorId: "editor-1",
  editorialClientId: "client-1",
  channel: "mcp" as const,
};

describe("canonical Media metadata correction", () => {
  test("applies one revision and records one attributed activity", async () => {
    const savedReceipts: unknown[] = [];
    const transaction: MediaCorrectionTransaction = {
      read: async () => ({ media: current }),
      revise: async correction => ({
        status: "updated",
        media: {
          ...current,
          ...correction.metadata,
          revision: 2,
          updatedAt: 2,
        },
      }),
      saveIdempotency: receipt => savedReceipts.push(receipt),
      recordActivity: vi.fn(() => "correlation-1"),
    };
    const dependencies: MediaCorrectionDependencies = {
      now: () => 2,
      fingerprint: () => "fingerprint-1",
      transact: async (_caller, _input, decide) => decide(transaction),
    };

    const result = await createMediaCorrection(dependencies).correct(caller, input);

    expect(result).toMatchObject({
      status: "updated",
      media: {
        id: current.id,
        alt: "Prefeitura de Macaé",
        revision: 2,
        storagePath: current.storagePath,
        mimeType: current.mimeType,
        status: current.status,
      },
      correlationId: "correlation-1",
    });
    expect(transaction.recordActivity).toHaveBeenCalledWith(
      "media.correctionApplied",
      current.id,
      2,
      input.reason,
    );
    expect(savedReceipts).toEqual([{
      operation: "media.correctionApplied",
      fingerprint: "fingerprint-1",
      correlationId: "correlation-1",
      media: expect.objectContaining({ id: current.id, revision: 2 }),
    }]);
  });

  test("replays the original result without another revision or activity", async () => {
    const revise = vi.fn<MediaCorrectionTransaction["revise"]>();
    const recordActivity = vi.fn<MediaCorrectionTransaction["recordActivity"]>();
    const dependencies: MediaCorrectionDependencies = {
      now: () => 3,
      fingerprint: () => "fingerprint-1",
      transact: async (_caller, _input, decide) => decide({
        read: async () => ({
          media: null,
          previous: {
            operation: "media.correctionApplied",
            fingerprint: "fingerprint-1",
            correlationId: "correlation-1",
            media: { ...current, ...input.metadata, revision: 2 },
          },
        }),
        revise,
        saveIdempotency: vi.fn(),
        recordActivity,
      }),
    };

    await expect(createMediaCorrection(dependencies).correct(caller, input))
      .resolves.toMatchObject({
        status: "replayed",
        media: { id: current.id, revision: 2 },
        correlationId: "correlation-1",
      });
    expect(revise).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  test("refuses reuse of an idempotency key with different content", async () => {
    const dependencies: MediaCorrectionDependencies = {
      now: () => 3,
      fingerprint: () => "new-fingerprint",
      transact: async (_caller, _input, decide) => decide({
        read: async () => ({
          media: current,
          previous: {
            operation: "media.correctionApplied",
            fingerprint: "original-fingerprint",
            correlationId: "correlation-1",
            media: current,
          },
        }),
        revise: vi.fn(),
        saveIdempotency: vi.fn(),
        recordActivity: vi.fn(),
      }),
    };

    await expect(createMediaCorrection(dependencies).correct(caller, input))
      .resolves.toEqual({ status: "conflict", code: "idempotency_conflict" });
  });

  test.each([
    {
      name: "missing Media",
      media: null,
      revision: { status: "not-found" as const },
      expected: { status: "not-found" },
    },
    {
      name: "stale revision",
      media: { ...current, revision: 2 },
      revision: { status: "conflict" as const, currentRevision: 2 },
      expected: { status: "conflict", code: "revision_conflict", currentRevision: 2 },
    },
  ])("returns $name without recording effects", async ({ media, revision, expected }) => {
    const saveIdempotency = vi.fn();
    const recordActivity = vi.fn<MediaCorrectionTransaction["recordActivity"]>();
    const dependencies: MediaCorrectionDependencies = {
      now: () => 3,
      fingerprint: () => "fingerprint-1",
      transact: async (_caller, _input, decide) => decide({
        read: async () => ({ media }),
        revise: async () => revision,
        saveIdempotency,
        recordActivity,
      }),
    };

    await expect(createMediaCorrection(dependencies).correct(caller, input))
      .resolves.toEqual(expected);
    expect(saveIdempotency).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  test("allows the adapter to supply retry safety when the public key is omitted", async () => {
    const saveIdempotency = vi.fn();
    const dependencies: MediaCorrectionDependencies = {
      now: () => 2,
      fingerprint: () => "fingerprint-1",
      transact: async (_caller, _input, decide) => decide({
        read: async () => ({ media: current }),
        revise: async correction => ({
          status: "updated",
          media: { ...current, ...correction.metadata, revision: 2 },
        }),
        saveIdempotency,
        recordActivity: () => "correlation-1",
      }),
    };

    await expect(createMediaCorrection(dependencies).correct(caller, {
      ...input,
      idempotencyKey: undefined,
    })).resolves.toMatchObject({ status: "updated", media: { revision: 2 } });
    expect(saveIdempotency).not.toHaveBeenCalled();
  });
});
