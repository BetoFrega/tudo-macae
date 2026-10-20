import { afterEach, expect, test, vi } from "vitest";
import type { PendingAdPublication } from "@tudomacae/ads/client";
import type { PhotoUpload } from "@tudomacae/classifieds-photos";

const fixture = vi.hoisted(() => ({
  publication: undefined as PendingAdPublication | undefined,
  upload: vi.fn(async (input: PhotoUpload) => input),
  sync: vi.fn(async () => []),
}));
vi.mock("./publication", () => ({ readPublication: async () => fixture.publication }));
vi.mock("@/packages/classifieds-api/photos", () => ({
  classifiedsPhotos: () => ({ upload: fixture.upload }), classifiedsPhotoCredential: async () => ({ session: "fixture-session" }),
}));
vi.mock("@/packages/classifieds-api/route", () => ({ route: () => fixture.sync }));
import { syncPendingPublicationImages } from "./publicationPhotos";

afterEach(() => vi.clearAllMocks());

test.each([true, false])("sync preserves a prior regular upload mode (%s)", async (existing) => {
  const id = "11111111-1111-4111-8111-111111111111";
  fixture.publication = { id: "draft", userId: "owner", title: "Anúncio", text: "Descrição", categoryId: "category", subcategoryId: "subcategory", createdAt: 1, revision: 3,
    images: existing ? [{ id, path: "ad-images/draft/pending/photo.png", order: 0, pending: true, uploadRevision: 1 }] : [] };
  const form = new FormData();
  const operationId = crypto.randomUUID();
  form.set("operationId", operationId);
  form.set("images", JSON.stringify([{ id, title: "Photo", description: "", order: 0 }]));
  form.set("observedImages", "[]");
  form.set("file-0", new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" }));
  await syncPendingPublicationImages("owner", "draft", form, "correlation");
  const uploaded = fixture.upload.mock.calls[0]![0];
  expect(uploaded.expectedRevision).toBe(existing ? 1 : 3);
  expect(uploaded.pendingPublication).toBe(existing ? undefined : true);
  expect(fixture.sync).toHaveBeenCalledOnce();
  expect(fixture.sync).toHaveBeenCalledWith(expect.objectContaining({ operationId }));
});
