import { expect, test, vi } from "vitest";
import { createClassifiedsClient } from "../client";
import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
import { AdvertiserProfileRevisionConflict } from "@tudomacae/advertiser-identity/profiles";
import { ClassifiedsRequestError, type ClassifiedsReadOperation, type ClassifiedsWriteOperation } from "../protocol";

test.each<ClassifiedsWriteOperation>(["categories.seed", "categories.delete", "subcategories.delete"])("%s can complete beyond the CRUD deadline while stalled calls remain bounded", async (operation) => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
  const request: typeof fetch = async (_input, init) => new Promise((resolve, reject) => {
    setTimeout(() => resolve(Response.json({ result: { data: "done" } }, { headers: { "x-classifieds-protocol": "1" } })), 6500);
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
  });
  const client = createClassifiedsClient({ origin: "https://api.test", publicOrigin: "https://public.test", request });
  try {
    const aggregate = client.write(operation, {});
    await vi.advanceTimersByTimeAsync(6500);
    await expect(aggregate).resolves.toBe("done");
    const crud = client.write("categories.create", {}).catch(error => error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await crud).toMatchObject({ code: "unavailable" });
    const stalled = createClassifiedsClient({ origin: "https://api.test", publicOrigin: "https://public.test", request: async (_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    }) }).write(operation, {}).catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await stalled).toMatchObject({ code: "unavailable" });
  }
  finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

test.each<ClassifiedsReadOperation>(["business.list", "business.sitemap", "business.preview", "business.areas"])("%s scans the Business catalog beyond the CRUD deadline", async (operation) => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
  const request: typeof fetch = async (_input, init) => new Promise((resolve, reject) => {
    setTimeout(() => resolve(Response.json({ result: { data: "done" } }, { headers: { "x-classifieds-protocol": "1" } })), 6500);
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
  });
  try {
    const scan = createClassifiedsClient({ origin: "https://api.test", publicOrigin: "https://public.test", request }).read(operation, null);
    await vi.advanceTimersByTimeAsync(6500);
    await expect(scan).resolves.toBe("done");
  }
  finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

test.each(["1234567890abcdef", "1234567890abcdef-GRU"])("preserves bounded MCP edge correlation %s", async (requestId) => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: { data: [] } }, { headers: { "x-classifieds-protocol": "1" } }));
  const client = createClassifiedsClient({ origin: "https://api.test", publicOrigin: "https://public.test", request });
  await client.read("categories.catalog", null, {}, requestId);
  expect(new Headers(request.mock.calls[0]![1]!.headers).get("x-request-id")).toBe(requestId);
});

test("HTTP errors preserve duplicate evidence and revision conflicts without exposing unknown server messages", async () => {
  const request = vi.fn<typeof fetch>();
  const client = createClassifiedsClient({ origin: "https://api.test", publicOrigin: "https://public.test", request });
  request.mockResolvedValueOnce(Response.json({ error: { message: "Confirme duplicatas", data: { classifieds: { name: "AdvertiserProfileAdministrationError", code: "possibleDuplicate", details: { candidates: [{ id: "existing", title: "Negócio" }], confirmationToken: "proof" } } } } }, { status: 400, headers: { "x-classifieds-protocol": "1" } }));
  const error = await client.write("profiles.admin.create", {}).catch(error => error);
  expect(error).toBeInstanceOf(AdvertiserProfileAdministrationError);
  if (!(error instanceof AdvertiserProfileAdministrationError)) throw error;
  expect(error.details).toMatchObject({ confirmationToken: "proof" });
  request.mockResolvedValueOnce(Response.json({ error: { message: "Conflito", data: { classifieds: { name: "AdvertiserProfileRevisionConflict", details: { currentRevision: 4 } } } } }, { status: 409, headers: { "x-classifieds-protocol": "1" } }));
  await expect(client.write("profiles.update", {})).rejects.toMatchObject({ currentRevision: 4 });
  expect(new AdvertiserProfileRevisionConflict(4).currentRevision).toBe(4);
  request.mockResolvedValueOnce(Response.json({ error: { message: "private-provider-details", data: {} } }, { status: 503, headers: { "x-classifieds-protocol": "1" } }));
  await expect(client.read("profiles.public", { id: "id" })).rejects.toBeInstanceOf(ClassifiedsRequestError);
  request.mockResolvedValueOnce(Response.json({ error: { message: "private-provider-details", data: {} } }, { status: 503, headers: { "x-classifieds-protocol": "1", "x-classifieds-error-reported": "1" } }));
  await expect(client.read("profiles.public", { id: "id" })).rejects.toMatchObject({ code: "unavailable", serverReportedFailure: true });
  const options = request.mock.calls[0]![1]!;
  expect(options).toMatchObject({ method: "POST", redirect: "manual", cache: "no-store" });
});
