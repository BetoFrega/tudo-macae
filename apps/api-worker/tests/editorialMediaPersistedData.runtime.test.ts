import { describe, expect, test } from "vitest";
import { call, metadata, ok, prepared, provenance, register, runtime, upload, setupEditorialMediaRuntime } from "./editorialMediaRuntimeHarness";

setupEditorialMediaRuntime();

describe("persisted data", () => {
  // Hand-edited rows stand in for an incompatible import; no Media operation writes them.
  const corrupt = async (kind: string, id: string, edit: string) => (await runtime.getD1Database("EDITORIAL_DB")).prepare(`UPDATE editorial_records SET body = ${edit} WHERE kind = ? AND id = ?`).bind(kind, id).run();

  test("revisions, correction receipts for other Media and intents that no longer parse are failures, not results", async () => {
    const id = await register("Original");
    await ok("update", { id, expectedRevision: 1, metadata: metadata("Revisada"), actorId: "admin" });
    for (const edit of ["json_set(body, '$.mediaId', 'other')", `json_set(body, '$.mediaId', '${id}', '$.metadata', json('null'))`]) expect(await corrupt("mediaRevision", "1", edit).then(() => call("revisions", id))).toMatchObject({ message: "Invalid persisted Media data." });
    const editor = { caller: { channel: "newsroom", editorId: "editor" } };
    const correction = { mediaId: id, expectedRevision: 2, metadata: { alt: "Orla de Macaé", caption: "", provenance }, reason: "Descrição mais precisa", idempotencyKey: "fix" };
    await ok("correct", correction, editor);
    for (const edit of ["json_remove(body, '$.media.storagePath')", "json_set(body, '$.media.storagePath', 'media/Original.webp', '$.targetId', 'other', '$.media.id', 'other')"]) expect(await corrupt("idempotency", "fix", edit).then(() => call("correct", correction, editor))).toMatchObject({ message: "Invalid persisted Media data." });
    const admin = { caller: { channel: "administration", editorId: "admin" } };
    const { correlationId } = await ok("ingestPrepare", upload("key"), admin);
    for (const edit of ["json_remove(body, '$.caller.administratorId')", "json_set(body, '$.caller.administratorId', 'admin', '$.caller.editorId', 'other')"]) {
      await corrupt("ingestionIntent", correlationId, edit);
      for (const [name, input] of [["ingestGet", correlationId], ["ingestPrepare", upload("key")]] as const) expect(await call(name, input, admin)).toMatchObject({ message: "Invalid persisted Media data." });
    }
  });

  test("a finalized reservation without its result is a failure, not a result or a retry", async () => {
    const reservationId = await prepared("op");
    await ok("finalize", { reservationId, idempotencyKey: "op" }, { operationId: "op" });
    await corrupt("uploadReservation", reservationId, "json_remove(body, '$.result')");
    for (const name of ["finalize", "readFinalized"]) expect(await call(name, { reservationId, idempotencyKey: "op" }, { operationId: "op" })).toMatchObject({ message: "Invalid persisted Media data." });
  });

  test("a completed intent without its target, or replayed for another target, is a failure, not a success", async () => {
    const admin = { caller: { channel: "administration", editorId: "admin" } };
    const { correlationId } = await ok("ingestPrepare", upload("target"), admin);
    await corrupt("ingestionIntent", correlationId, "json_remove(body, '$.targetId')");
    expect(await call("ingestGet", correlationId, admin)).toMatchObject({ message: "Invalid persisted Media data." });
    await corrupt("ingestionIntent", correlationId, "json_set(body, '$.targetId', 'other')");
    // The use case answers any unexpected failure as a retryable pending operation.
    expect(await call("ingestPrepare", upload("target"), admin)).toMatchObject({ code: "internalFailure" });
  });
});
