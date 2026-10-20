import { expect, test, vi } from "vitest";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { record, bytes, provider } from "./hostedPhotosRuntimeHarness";

// Production handles are JSRPC stubs; workerd logs "An RPC stub was not disposed properly" when one is collected undisposed.
/** Rejections the operation is expected to raise must be asserted or caught by the caller. */
async function expectReleased(p: ReturnType<typeof provider>, operation: () => Promise<unknown>) {
  const before = p.handles();
  await operation();
  const after = p.handles();
  expect(after.opened).toBeGreaterThan(before.opened);
  expect(after.disposed - before.disposed).toBe(after.opened - before.opened);
}

test("every Hosted image handle is released after reads, deliveries, probes, checks and deletion", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  const stored = { ...record, generation };
  await expectReleased(p, () => objects.read(stored));
  await expectReleased(p, () => objects.deliver!(stored, { width: 640, format: "webp" }));
  await expectReleased(p, () => objects.deliver!(stored, { width: 640, format: "webp" }, true));
  await expectReleased(p, () => objects.head(stored));
  p.items.get(generation)!.metadata.requireSignedURLs = false;
  await expectReleased(p, () => expect(objects.read(stored)).rejects.toMatchObject({ code: "unavailable" }));
  await expectReleased(p, () => expect(objects.head(stored)).rejects.toMatchObject({ code: "unavailable" }));
  p.items.get(generation)!.metadata.draft = true;
  await expectReleased(p, async () => expect(await objects.read(stored)).toBeNull());
  await expectReleased(p, async () => expect(await objects.deliver!(stored, { width: 640, format: "webp" })).toBeNull());
  await expectReleased(p, () => objects.retire(stored));
  expect(p.items.has(generation)).toBe(false);
});

test("a provider failure still releases its handle and surfaces the failure instead of a release error", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  const stored = { ...record, generation };
  const failure = new PhotoError("invalid", "Hosted read failed");
  const image = p.images.image;
  p.images.image = (id: string) => ({ ...image(id), bytes: () => Promise.reject(failure) });
  p.onDispose(() => {
    throw new TypeError("release failed");
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expectReleased(p, () => expect(objects.read(stored)).rejects.toBe(failure));
  expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "classifieds.photos.hosted_image_release", service: "api-worker", environment: "test", release: "fixture", outcome: "failed", errorName: "TypeError" }));
  warn.mockRestore();
  p.reply(() => {
    throw new Error("variant fetch failed");
  });
  await expectReleased(p, () => expect(objects.deliver!(stored, { width: 640, format: "webp" })).rejects.toMatchObject({ code: "unavailable" }));
});

test("a release failure names the capability that composed the adapter", async () => {
  const p = provider();
  const objects = await p.objects("media.hosted_image_release");
  const generation = await objects.create(record, bytes);
  p.onDispose(() => {
    throw new TypeError("release failed");
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expectReleased(p, () => objects.head({ ...record, generation }));
  expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "media.hosted_image_release", service: "api-worker", environment: "test", release: "fixture", outcome: "failed", errorName: "TypeError" }));
  warn.mockRestore();
});
