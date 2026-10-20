import { beforeEach, expect, test, vi } from "vitest";
import { workerMedia } from "@/packages/media-api";
import { PUT } from "./route";

vi.mock("@/packages/media-api", async importOriginal => ({ ...await importOriginal<typeof import("@/packages/media-api")>(), workerMedia: vi.fn() }));

const reservationId = "a".repeat(64);
const context = { params: Promise.resolve({ id: reservationId }) };
const put = (body: Uint8Array<ArrayBuffer>) => new Request(`http://localhost/midia/envios/${reservationId}`, { method: "PUT", headers: { "content-type": "image/png" }, body });

beforeEach(() => {
  vi.clearAllMocks();
});

test("the bytes reach the reservation and only the Worker's status returns", async () => {
  const upload = vi.fn<(id: string, body: ArrayBuffer, type: string) => Promise<Response>>()
    .mockResolvedValue(new Response("{\"error\":\"detail\"}", { status: 409 }));
  vi.mocked(workerMedia).mockResolvedValue({ upload } as never);
  const response = await PUT(put(new Uint8Array([1, 2])), context);
  expect(response.status).toBe(409);
  expect(await response.text()).toBe("");
  expect(upload.mock.calls[0]![0]).toBe(reservationId);
  expect(new Uint8Array(upload.mock.calls[0]![1])).toEqual(new Uint8Array([1, 2]));
  expect(upload.mock.calls[0]![2]).toBe("image/png");
});

test("refuses a body above the upload limit before forwarding it", async () => {
  const upload = vi.fn();
  vi.mocked(workerMedia).mockResolvedValue({ upload } as never);
  expect((await PUT(put(new Uint8Array(1024 * 1024 + 1)), context)).status).toBe(413);
  expect(upload).not.toHaveBeenCalled();
});

test("an unreachable Worker answers a bodiless 503 and is reported", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(workerMedia).mockRejectedValueOnce(new Error("configuration missing"));
  const unconfigured = await PUT(put(new Uint8Array([1])), context);
  vi.mocked(workerMedia).mockResolvedValue({ upload: vi.fn().mockRejectedValue(new Error("timeout")) } as never);
  const noUpload = await PUT(put(new Uint8Array([1])), context);
  for (const response of [unconfigured, noUpload]) {
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
  }
  expect(errorLog).toHaveBeenCalledTimes(2);
  errorLog.mockRestore();
});

test("a body without a declared length is cut at the upload limit while it is read", async () => {
  const upload = vi.fn();
  vi.mocked(workerMedia).mockResolvedValue({ upload } as never);
  const bytes = new Uint8Array(1024 * 1024 + 1);
  const parts = [bytes.subarray(0, 1024), bytes.subarray(1024)];
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const part = parts.shift();
      if (part) controller.enqueue(part);
      else controller.close();
    },
  });
  const request = new Request(`http://localhost/midia/envios/${reservationId}`, { method: "PUT", body: stream, duplex: "half" } as RequestInit);
  expect((await PUT(request, context)).status).toBe(413);
  expect(upload).not.toHaveBeenCalled();
});
