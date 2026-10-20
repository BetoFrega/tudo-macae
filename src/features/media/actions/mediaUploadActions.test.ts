import { beforeEach, expect, test, vi } from "vitest";
import { MediaRequestError, responseFailure } from "@tudomacae/editorial-media/client";
import { workerMedia } from "@/packages/media-api";
import { searchMediaUploadAction, selectExistingMediaAction } from "./mediaUploadActions";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/packages/media-api", async importOriginal => ({ ...await importOriginal<typeof import("@/packages/media-api")>(), workerMedia: vi.fn() }));

const read = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workerMedia).mockResolvedValue({ read } as never);
});

test("the Worker answers and authorizes the session", async () => {
  read.mockResolvedValueOnce({ media: [] }).mockResolvedValueOnce({ id: "media-1" });
  await expect(searchMediaUploadAction({ kind: "article-image", text: "orla", limit: 5 })).resolves.toEqual({ success: true, media: [] });
  await expect(selectExistingMediaAction("media-1")).resolves.toEqual({ success: true, mediaId: "media-1" });
  expect(read.mock.calls).toEqual([["ingestion.search", { kind: "article-image", text: "orla", limit: 5 }], ["get", "media-1"]]);
});

test("a Worker refusal keeps its code, and an unreachable Worker is reported once with a generic answer", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValueOnce(new MediaRequestError("forbidden")).mockRejectedValueOnce(new MediaRequestError("unavailable"));
  await expect(selectExistingMediaAction("media-1")).resolves.toMatchObject({ success: false, code: "forbidden", error: "Você não tem permissão para gerenciar o acervo de mídia." });
  expect(errorLog).not.toHaveBeenCalled();
  await expect(selectExistingMediaAction("media-1")).resolves.toMatchObject({ success: false, code: "internalFailure", error: "Não foi possível concluir a operação de Mídia. Tente novamente." });
  expect(errorLog).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(errorLog.mock.calls[0]![0]))).toMatchObject({ event: "media.action.failed", operation: "media.upload.select", causeCode: "unavailable" });
  errorLog.mockRestore();
});

test("a 5xx the Worker answered is logged there, not again here", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValueOnce(responseFailure(new Response(null, { status: 500, headers: { "x-media-error-reported": "1" } })));
  await expect(selectExistingMediaAction("media-1")).resolves.toMatchObject({ success: false, code: "internalFailure" });
  expect(errorLog).not.toHaveBeenCalled();
  errorLog.mockRestore();
});
