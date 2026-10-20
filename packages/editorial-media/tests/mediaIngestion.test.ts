import { describe, expect, test } from "vitest";
import {
  createEditorialMediaIngestion,
  type EditorialMediaIngestionDependencies,
  type MediaIngestionIntent,
} from "../mediaIngestion";
import { firstPartyEditorialCaller, mcpEditorialReadCaller } from "@tudomacae/editorial-access/caller";
import { MediaIngestionError } from "@tudomacae/media/ingestionPolicy";

const operationId = "a".repeat(64);
const reservationId = "b".repeat(64);

function uploadInput() {
  return {
    idempotencyKey: "prepare-key",
    size: 100,
    contentType: "image/png" as const,
    metadata: {
      kind: "article-image" as const,
      alt: "Praia de Imbetiba ao amanhecer",
      caption: "",
      provenance: {
        origin: "own-production" as const,
        creator: "Equipe Tudo Macaé",
        credit: "Foto: Equipe Tudo Macaé",
        displayBasis: "own-production" as const,
        acquiredAt: 1,
      },
    },
  };
}

function controlledDependencies({
  role = "editor",
  permission = true,
  prepareFailure,
}: {
  role?: "editor" | "none";
  permission?: boolean;
  prepareFailure?: Error;
} = {}) {
  const intents = new Map<string, MediaIngestionIntent>();
  const searches: Array<{ channel: string; requestId?: string }> = [];
  let prepareAttempts = 0;
  const dependencies: EditorialMediaIngestionDependencies = {
    async authorize() {
      if (role === "none") {
        throw new MediaIngestionError("forbidden", "Você não tem permissão para gerenciar o acervo de mídia.");
      }
    },
    async hasMediaUsePermission() { return permission; },
    async begin(caller, input, operation) {
      const id = operation === "prepare" ? operationId : "b".repeat(64);
      const existing = intents.get(id);
      if (existing) return { id: existing.id, ownerId: existing.ownerId };
      intents.set(id, {
        id,
        ownerId: "owner-1",
        caller,
        input,
        operation,
        status: "pending",
        createdAt: 1,
      });
      return { id, ownerId: "owner-1" };
    },
    async complete(id) {
      const intent = intents.get(id)!;
      intents.set(id, { ...intent, status: "completed" });
    },
    async read(_caller, id) {
      const intent = intents.get(id);
      if (!intent) throw new MediaIngestionError("notFound", "A operação de Mídia não existe.");
      return intent;
    },
    async recordFailure(id, errorCode) {
      const intent = intents.get(id)!;
      intents.set(id, { ...intent, status: errorCode === "internalFailure" ? "pending" : "failed", errorCode });
    },
    async prepare() {
      prepareAttempts += 1;
      if (prepareFailure && prepareAttempts === 1) throw prepareFailure;
      return {
        reservationId,
        expiresAt: 600_001,
        upload: { url: "https://upload.test/reservation", method: "PUT", headers: {} },
      };
    },
    async readFinalized() { return null; },
    async metadata() { return uploadInput().metadata; },
    async finalize() { return { status: "created", mediaId: "media-1", digest: "digest-1" }; },
    async search() {
      return {
        media: [{
          id: "media-1", kind: "article-image" as const, status: "staged" as const,
          alt: "Praia de Imbetiba ao amanhecer", caption: "", mimeType: "image/webp",
          provenance: uploadInput().metadata.provenance, storagePath: "private/media-1",
          revision: 1, createdAt: 1, updatedAt: 1,
        }],
      };
    },
    async recordSearch(caller, requestId) {
      searches.push({ channel: caller.channel, ...(requestId ? { requestId } : {}) });
    },
  };
  return { dependencies, intents, searches };
}

describe("editorial media ingestion factory", () => {
  test("prepares and reconciles the original intent with correlation", async () => {
    const controlled = controlledDependencies();
    const ingestion = createEditorialMediaIngestion(controlled.dependencies);
    const caller = firstPartyEditorialCaller("editor-1");

    const prepared = await ingestion.prepare(caller, uploadInput());
    expect(prepared).toMatchObject({ reservationId, correlationId: operationId });
    const finalized = await ingestion.finalize(caller, {
      reservationId,
      idempotencyKey: "finalize-key",
    });
    expect(finalized).toMatchObject({ status: "created", mediaId: "media-1", correlationId: "b".repeat(64) });
    expect(await ingestion.reconcile(caller, operationId)).toEqual(prepared);
    await expect(ingestion.get(caller, operationId)).resolves.toMatchObject({
      id: operationId, operation: "prepare", status: "completed",
    });
  });

  test("rejects live role and source-permission denials without beginning an intent", async () => {
    const forbidden = controlledDependencies({ role: "none" });
    await expect(createEditorialMediaIngestion(forbidden.dependencies)
      .prepare(firstPartyEditorialCaller("editor-1"), uploadInput()))
      .rejects.toMatchObject({ code: "forbidden" });
    expect(forbidden.intents).toEqual(new Map());

    const permissionDenied = controlledDependencies({ permission: false });
    const input = {
      ...uploadInput(),
      metadata: {
        kind: "article-image" as const,
        alt: "Praia de Imbetiba ao amanhecer",
        caption: "",
        provenance: {
          origin: "third-party" as const, provider: "Arquivo Municipal", creator: "Fotógrafa",
          credit: "Foto: Fotógrafa", acquiredAt: 1, displayBasis: "permission" as const,
          permissionReference: "permission-1",
        },
      },
    };
    await expect(createEditorialMediaIngestion(permissionDenied.dependencies)
      .prepare(firstPartyEditorialCaller("editor-1"), input))
      .rejects.toMatchObject({ code: "forbidden" });
  });

  test("keeps unexpected failure pending and retries through the same intent", async () => {
    const controlled = controlledDependencies({ prepareFailure: new Error("provider unavailable") });
    const ingestion = createEditorialMediaIngestion(controlled.dependencies);
    const caller = firstPartyEditorialCaller("editor-1");

    await expect(ingestion.prepare(caller, uploadInput())).rejects.toMatchObject({
      code: "internalFailure", details: { operationId },
    });
    await expect(ingestion.get(caller, operationId)).resolves.toMatchObject({
      status: "pending", errorCode: "internalFailure",
    });
    await expect(ingestion.reconcile(caller, operationId)).resolves.toMatchObject({
      reservationId, correlationId: operationId,
    });
  });

  test("validates input and sanitizes MCP searches while recording only that channel", async () => {
    const controlled = controlledDependencies();
    const ingestion = createEditorialMediaIngestion(controlled.dependencies);
    await expect(ingestion.prepare(firstPartyEditorialCaller("editor-1"), { ...uploadInput(), size: 0 }))
      .rejects.toMatchObject({ code: "validationFailed" });

    const mcp = mcpEditorialReadCaller({ editorId: "editor-1", editorialClientId: "client-1" });
    const page = await ingestion.search(mcp, { text: "Imbetiba" }, "request-1");
    expect(page.media[0]).not.toHaveProperty("storagePath");
    expect(controlled.searches).toEqual([{ channel: "mcp", requestId: "request-1" }]);

    await ingestion.search(firstPartyEditorialCaller("editor-1"), { text: "Imbetiba" });
    expect(controlled.searches).toHaveLength(1);
  });
});
