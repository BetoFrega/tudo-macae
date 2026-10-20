import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { Media } from "@tudomacae/media/model";
import { getMediaPreviewUrl } from "../storage/mediaStorage";
import { MediaRequestError } from "@tudomacae/editorial-media/client";
import { workerMedia } from "@/packages/media-api";
import { getMediaOptions } from "./getMediaOptions";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("../storage/mediaStorage", () => ({ getMediaPreviewUrl: vi.fn() }));
vi.mock("@/packages/media-api", async importOriginal => ({ ...await importOriginal<typeof import("@/packages/media-api")>(), workerMedia: vi.fn() }));

const media: Media = {
  id: "media-orla",
  kind: "article-image",
  alt: "Praia dos Cavaleiros ao amanhecer",
  caption: "",
  provenance: {
    origin: "own-production",
    creator: "Maria Souza",
    credit: "Foto: Maria Souza/Tudo Macaé",
    displayBasis: "own-production",
    acquiredAt: 1_777_000_000_000,
  },
  status: "staged",
  revision: 1,
  storagePath: "media/orla.webp",
  mimeType: "image/webp",
  createdAt: 1_777_000_000_000,
  updatedAt: 1_777_000_000_000,
};

function signedInAs(roles: { isAdmin?: boolean; isEditor?: boolean }) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "user-1",
    email: "pessoa@example.com",
    emailVerified: true,
    isAdmin: false,
    isEditor: false,
    ...roles,
  });
}

const read = vi.fn();

describe("getMediaOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workerMedia).mockResolvedValue({ read } as never);
    read.mockResolvedValue({
      media: [media],
      nextCursor: "next-page",
    });
    vi.mocked(getMediaPreviewUrl).mockResolvedValue(
      "https://storage.test/media/orla.webp",
    );
  });

  test("returns a bounded canonical page to an editor with preview URLs", async () => {
    signedInAs({ isEditor: true });
    const result = await getMediaOptions("article-image", "current-page");
    expect(result).toEqual({
      success: true,
      options: [{
        ...media,
        storagePath: undefined,
        url: "https://storage.test/media/orla.webp",
      }],
      nextCursor: "next-page",
    });
    if (result.success) expect(result.options[0]).not.toHaveProperty("storagePath");
    expect(read).toHaveBeenCalledWith("search", {
      kind: "article-image",
      limit: 50,
      cursor: "current-page",
    });
  });

  test("builds each preview from the complete canonical Media", async () => {
    signedInAs({ isEditor: true });
    vi.mocked(getMediaPreviewUrl).mockImplementation(async candidate => (
      `preview:${candidate.id}:${candidate.storagePath}:${candidate.revision}`
    ));

    await expect(getMediaOptions("article-image")).resolves.toMatchObject({
      success: true,
      options: [{
        id: "media-orla",
        url: "preview:media-orla:media/orla.webp:1",
      }],
    });
  });

  test("refuses visitors and people without an acervo role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getMediaOptions("article-image")).resolves.toMatchObject({
      success: false,
    });
    signedInAs({});
    await expect(getMediaOptions("article-image")).resolves.toMatchObject({
      success: false,
    });
    expect(read).not.toHaveBeenCalled();
  });

  test("hides technical read failures", async () => {
    signedInAs({ isAdmin: true });
    const technicalMessage = "index provider detail";
    read.mockRejectedValue(new Error(technicalMessage));
    const failureLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getMediaOptions("article-image")).resolves.toEqual({
      success: false,
      error: "Não foi possível ler o acervo.",
    });
    expect(failureLog).toHaveBeenCalledTimes(1);
    const log = JSON.parse(String(failureLog.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(log).toMatchObject({
      event: "media.options.read.failed",
      service: "nextjs",
      environment: expect.any(String),
      release: expect.any(String),
      route: "server-action:getMediaOptions",
      executionId: expect.any(String),
      operation: "media.options.read",
      outcome: "error",
      statusClass: "5xx",
      errorType: "Error",
    });
    expect(JSON.stringify(log)).not.toContain(technicalMessage);
  });

  test("a Worker authorization refusal is answered without an outage log", async () => {
    signedInAs({ isEditor: true });
    vi.mocked(workerMedia).mockResolvedValue({ read: vi.fn().mockRejectedValue(new MediaRequestError("forbidden")) } as never);
    const failureLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getMediaOptions("article-image")).resolves.toMatchObject({ success: false });
    expect(failureLog).not.toHaveBeenCalled();
    failureLog.mockRestore();
  });

  test("correlates canonical media resolution failures without exposing details", async () => {
    signedInAs({ isEditor: true });
    read.mockRejectedValue(new Error("private storage/path?token=secret"));
    const failureLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getMediaOptionById } = await import("./getMediaOptions");
    await expect(getMediaOptionById("media-orla")).resolves.toBeNull();
    expect(failureLog).toHaveBeenCalledTimes(1);
    const log = JSON.parse(String(failureLog.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(log).toMatchObject({
      event: "media.options.resolve.failed",
      service: "nextjs",
      environment: expect.any(String),
      release: expect.any(String),
      route: "server-action:getMediaOptionById",
      executionId: expect.any(String),
      statusClass: "5xx",
    });
    expect(JSON.stringify(log)).not.toMatch(/private storage|token=secret/);
  });
});
