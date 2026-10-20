import { expect, test } from "vitest";
import { z } from "zod";
import { now, runtime, gates, call, startRuntime, readRecord, readRecords, upload, photo, capability, draft, account } from "./photosRuntimeHarness";
test("D1 drafts resume without duplication, profile association commits together and publication replays", async () => {
  const saved = await capability("publications.save", draft);
  expect(saved.error).toBeUndefined();
  expect((await capability("publications.save", draft)).value).toEqual(saved.value);
  expect((await capability("publications.profile", { publicationId: draft.id, title: "Beto", contacts: [{ number: "22999998888", isWhatsapp: true }] })).value).toBe(`publication-${draft.id}`);
  const first = await capability("publications.publish", { id: draft.id });
  expect(first.error).toBeUndefined();
  expect((await capability("publications.publish", { id: draft.id })).value).toEqual(first.value);
  expect((await capability("ads.forOwner", { userId: "owner" }, false)).value).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id, status: "active", createdAt: now })]));
  expect((await capability("publications.mine", {}, false)).value).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ad" })]));
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect((await capability("publications.publish", { id: draft.id })).value).toEqual(first.value);
});
test("API distrusts caller ownership, email and roles; saving a draft does not publish", async () => {
  expect((await capability("publications.profile", { publicationId: "ad", profileId: "profile", title: "Invasão", contacts: [{ number: "22999998888", isWhatsapp: false }] }, true, { actor: account("intruder") })).error).toBe("AdOperationError");
  expect((await capability("publications.publish", { id: "ad", emailVerified: true }, true, { actor: account("owner", false) })).error).toBe("PublicationRequirementError");
  expect((await capability("ads.all", {}, false, { actor: account("owner", true, false) })).error).toBe("AdOperationError");
  expect((await capability("publications.save", { ...draft, userId: "intruder" }, true, { actor: account("owner", false) })).value).toMatchObject({ userId: "owner" });
  expect((await capability("ads.forOwner", { userId: "owner" }, false)).value).toEqual([]);
});
test("publication confirms R2 and atomically rejects a draft changed after the proof", async () => {
  await call({ action: "upload", request: upload() });
  let entered!: () => void;
  const arrived = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set("publication-proof", { entered, wait });
  const attempt = capability("publications.publish", { id: "ad" }, true, { gate: "publication-proof" });
  await arrived;
  expect((await capability("publications.save", { ...draft, id: "ad", advertiserProfileId: "profile", title: "Conteúdo atualizado" })).error).toBeUndefined();
  release();
  expect((await attempt).error).toBe("AdOperationError");
  expect((await capability("publications.read", { id: "ad" }, false)).value).toMatchObject({ title: "Conteúdo atualizado", published: false });
});
test("missing R2 bytes preserve the draft; successful publication exposes the confirmed photograph", async () => {
  const linked = photo.parse((await call({ action: "upload", request: upload() })).value);
  const bucket = await runtime.getR2Bucket("PHOTOS");
  await bucket.delete(linked.path);
  expect((await capability("publications.publish", { id: "ad" })).error).toBe("PhotoError");
  expect((await capability("publications.read", { id: "ad" }, false)).value).toMatchObject({ completed: false });
});
test("management rejects stolen profiles and pending ads, preserves pause recovery and current eligibility", async () => {
  expect((await capability("ads.owned", { id: "missing" }, false))).toMatchObject({ error: "AdOperationError", code: "not-found" });
  expect((await capability("ads.owned", { id: "ad" }, false))).toMatchObject({ error: "AdOperationError", code: "not-found" });
  expect((await capability("ads.status", { id: "ad", status: "active" })).error).toBeDefined();
  await capability("publications.publish", { id: "ad" });
  expect((await capability("ads.status", { id: "ad", status: "paused" })).error).toBeUndefined();
  expect((await capability("publications.publish", { id: "ad" })).error).toBeDefined();
  expect((await capability("ads.status", { id: "ad", status: "active" }, true, { actor: account("owner", false) })).error).toBe("PublicationRequirementError");
  expect((await capability("ads.status", { id: "ad", status: "active" })).error).toBeUndefined();
  expect((await capability("ads.delete", { id: "ad" }, true, { actor: account("intruder") })).error).toBe("AdOperationError");
  await capability("ads.delete", { id: "ad" });
  expect((await capability("ads.owned", { id: "ad" }, false))).toMatchObject({ error: "AdOperationError", code: "not-found" });
});

test("repeated photo removal hands cleanup to durable jobs without growing the ad transaction", async () => {
  await capability("publications.publish", { id: "ad" });
  const store = { read: readRecord, page: readRecords };
  let lastPath = "";
  for (let index = 0; index < 18; index++) {
    const owned = z.object({ revision: z.number() }).parse((await capability("ads.owned", { id: "ad" }, false)).value);
    const request = { ...upload(), expectedRevision: owned.revision };
    lastPath = photo.parse((await call({ action: "upload", request })).value).path;
    expect((await capability("ads.update", { ...draft, id: "ad", images: [], observedImageIds: [request.operationId] })).error).toBeUndefined();
    expect((await store.read("ad", "ad"))?.body.pendingImageCleanupPaths).toEqual([]);
    // A failed external purge must keep the durable intent without blocking later edits.
    if (index === 0) {
      expect((await call({ action: "sweep", fault: "purge" })).value).toMatchObject({ completed: 0 });
      expect((await store.page({ kind: "adCleanup" })).items[0]?.body.status).toBe("pending");
    }
  }
  expect((await store.page({ kind: "adCleanup" })).items).toHaveLength(18);
  expect((await capability("ads.delete", { id: "ad" })).error).toBeUndefined();
  expect(await store.read("ad", "ad")).toBeNull();
  expect((await call({ action: "sweep", now: now + 60_000 })).value).toMatchObject({ completed: 18, pending: 0 });
  expect((await call({ action: "read", path: lastPath })).value).toBeNull();
});
