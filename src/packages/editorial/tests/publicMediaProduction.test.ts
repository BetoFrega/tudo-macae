import { afterEach, expect, test, vi } from "vitest";
import { PublicMediaReadFailure } from "@tudomacae/editorial-blog/publicMediaContent";
import { PublicBlogRequestError } from "@tudomacae/editorial-blog/publicClient";

const { editorialImage, articleMedia } = vi.hoisted(() => ({ editorialImage: vi.fn(), articleMedia: vi.fn() }));
vi.mock("../publicBlogProduction", () => ({ publicBlogClient: () => ({ editorialImage, articleMedia }) }));
afterEach(() => vi.resetAllMocks());

const digest = "a".repeat(64);

test("the origin and article image reads are the Worker's answers", async () => {
  const { readPublicMediaContent } = await import("../publicMediaProduction");
  const { readPublishedArticleMedia } = await import("../articleLifecycleProduction");
  editorialImage.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "image/webp" });
  articleMedia.mockResolvedValue(null);
  expect(await readPublicMediaContent("photo", digest, "request")).toEqual({ bytes: new Uint8Array([1]), mimeType: "image/webp" });
  expect(editorialImage).toHaveBeenCalledWith("photo", digest, "request", "GET");
  await readPublicMediaContent("photo", digest, "request", "HEAD");
  expect(editorialImage).toHaveBeenLastCalledWith("photo", digest, "request", "HEAD");
  expect(await readPublishedArticleMedia("post", "photo", "request")).toBeNull();
  expect(articleMedia).toHaveBeenCalledWith("post", "photo", "request");
});

test("a Worker that cannot answer is an origin failure of its own stage", async () => {
  const { readPublicMediaContent } = await import("../publicMediaProduction");
  editorialImage.mockRejectedValue(new Error("unavailable"));
  await expect(readPublicMediaContent("photo", digest)).rejects.toEqual(new PublicMediaReadFailure("worker"));
});

test("a failure the Worker already logged keeps that mark through the origin", async () => {
  const { readPublicMediaContent } = await import("../publicMediaProduction");
  editorialImage.mockRejectedValue(new PublicBlogRequestError("unavailable", 502, true));
  await expect(readPublicMediaContent("photo", digest)).rejects.toMatchObject({ stage: "worker", reportedByWorker: true });
});
