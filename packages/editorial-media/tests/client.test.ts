import { describe, expect, test, vi } from "vitest";
import { MediaNotFoundError, MediaRevisionConflictError } from "@tudomacae/media/errors";
import { MediaIngestionError } from "@tudomacae/media/ingestionPolicy";
import { createEditorialMediaClient, MediaRequestError, reportedByWorker } from "../client";

const origin = "https://api.tudomacae.test/";
const publicOrigin = "https://tudomacae.test";

function client(respond: (request: Request) => Response | Promise<Response>) {
  const request = vi.fn<typeof fetch>(async (url, init) => respond(new Request(url, init)));
  return { request, media: createEditorialMediaClient({ origin, publicOrigin, request }) };
}
const failure = (status: number, message: string, media?: object) => Response.json({ error: { message, data: { code: "X", ...(media ? { media } : {}) } } }, { status });

describe("Media procedures", () => {
  test("reads travel as a query with the session, writes as a POST from the app origin", async () => {
    const { request, media } = client(() => Response.json({ result: { data: { media: [] } } }));
    expect(await media.read("search", { limit: 5 }, "token value", "request-1")).toEqual({ media: [] });
    await media.write("ingestion.prepare", { size: 1 }, "token value");
    const [read, write] = request.mock.calls.map(([url, init]) => new Request(url, init));
    expect(new URL(read!.url).pathname).toBe("/api/trpc/mediaRead");
    expect(JSON.parse(new URL(read!.url).searchParams.get("input")!)).toEqual({ operation: "search", input: { limit: 5 }, requestId: "request-1" });
    expect(read!.headers.get("cookie")).toBe("session=token%20value");
    expect(write!.method).toBe("POST");
    expect(write!.headers.get("origin")).toBe(publicOrigin);
    expect(await write!.json()).toEqual({ operation: "ingestion.prepare", input: { size: 1 } });
  });

  test("rebuilds the domain error the Worker serialized", async () => {
    const reject = (body: Response) => client(() => body).media.write("correct", {}, "s");
    await expect(reject(failure(409, "A Mídia mudou.", { name: "MediaRevisionConflictError", details: { currentRevision: 4 } }))).rejects.toEqual(new MediaRevisionConflictError(4));
    await expect(reject(failure(404, "x", { name: "MediaNotFoundError", details: {} }))).rejects.toBeInstanceOf(MediaNotFoundError);
    const ingestion = reject(failure(400, "A reserva expirou.", { name: "MediaIngestionError", code: "validationFailed", details: { reservationExpired: true } }));
    await expect(ingestion).rejects.toBeInstanceOf(MediaIngestionError);
    await expect(ingestion).rejects.toMatchObject({ code: "validationFailed", message: "A reserva expirou.", details: { reservationExpired: true } });
    const conflictWithoutRevision = reject(failure(409, "A Mídia mudou.", { name: "MediaRevisionConflictError", details: {} }));
    await expect(conflictWithoutRevision).rejects.toMatchObject({ name: "MediaRequestError", code: "incompatible" });
  });

  test("a failure without a domain error is a request error, never a Media decision", async () => {
    await expect(client(() => failure(403, "Forbidden")).media.read("search", {}, "s")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client(() => failure(502, "gateway")).media.read("search", {}, "s")).rejects.toSatisfy(error => !reportedByWorker(error));
  });

  test("a failure the Worker marked as logged keeps that provenance, with or without a domain error", async () => {
    const marked = (response: Response) => (response.headers.set("x-media-error-reported", "1"), response);
    const plain = client(() => marked(failure(500, "boom"))).media.read("search", {}, "s");
    await expect(plain).rejects.toSatisfy(error => error instanceof MediaRequestError && reportedByWorker(error));
    const domain = client(() => marked(failure(500, "x", { name: "MediaIngestionError", code: "internalFailure", details: {} }))).media.write("ingestion.prepare", {}, "s");
    await expect(domain).rejects.toSatisfy(error => error instanceof MediaIngestionError && reportedByWorker(error));
    const empty = client(() => marked(new Response(null, { status: 503 }))).media.read("search", {}, "s");
    await expect(empty).rejects.toSatisfy(reportedByWorker);
    await expect(client(() => Response.json({ data: 1 })).media.read("search", {}, "s")).rejects.toMatchObject({ code: "incompatible" });
  });

  test("refuses a Worker origin that is not a bare HTTPS origin", () => {
    expect(() => createEditorialMediaClient({ origin: "http://api.tudomacae.test/", publicOrigin })).toThrow(TypeError);
    expect(() => createEditorialMediaClient({ origin: "https://api.tudomacae.test/path", publicOrigin })).toThrow(TypeError);
  });
});

test("uploads forward the bytes and their type to the reservation with the session", async () => {
  const { request, media } = client(() => new Response(null, { status: 204 }));
  expect((await media.upload("a".repeat(64), new Uint8Array([1, 2]).buffer, "image/png", "s")).status).toBe(204);
  const sent = new Request(...request.mock.calls[0]!);
  expect(new URL(sent.url).pathname).toBe(`/api/media/uploads/${"a".repeat(64)}`);
  expect(sent.method).toBe("PUT");
  expect(sent.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await sent.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
});
