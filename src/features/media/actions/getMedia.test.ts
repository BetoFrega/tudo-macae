import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { Media } from "@tudomacae/media/model";
import { workerMedia } from "@/packages/media-api";
import { getMedia, getUnreferencedStagedMedia } from "./getMedia";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/packages/media-api", async importOriginal => ({ ...await importOriginal<typeof import("@/packages/media-api")>(), workerMedia: vi.fn() }));
vi.mock("../mediaOptions", () => ({
  toMediaOption: vi.fn(async (media: Media) => ({
    ...media,
    storagePath: undefined,
    url: `/midia/${media.id}`,
  })),
}));

const stagedMedia = {
  id: "media-1",
  kind: "article-image",
  status: "staged",
  revision: 1,
  alt: "Orla dos Cavaleiros",
  caption: "",
  provenance: {
    origin: "own-production",
    creator: "Maria Souza",
    credit: "Foto: Maria Souza/Tudo Macaé",
    displayBasis: "own-production",
    acquiredAt: 1_777_000_000_000,
  },
  storagePath: "media-staged/orla.webp",
  mimeType: "image/webp",
  createdAt: 1_777_000_000_000,
  updatedAt: 1_777_000_000_000,
} satisfies Media;

function signedInAs(roles: { isAdmin?: boolean; isEditor?: boolean }) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    uid: "admin-1",
    email: "admin@example.com", emailVerified: true,
    isAdmin: roles.isAdmin ?? false,
    isEditor: roles.isEditor ?? false,
  });
}

const read = vi.fn();

describe("admin Media reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workerMedia).mockResolvedValue({ read } as never);
    read.mockImplementation(async (operation: string) => ({
      media: [stagedMedia],
      nextCursor: operation === "search" ? "next-page" : "report-next-page",
    }));
  });

  test("returns no collection data to visitors or non-administrators", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getMedia()).resolves.toEqual({
      media: [],
      requiresCorrectionReason: false,
    });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    signedInAs({});
    vi.mocked(getCurrentUser).mockClear();
    await expect(getMedia()).resolves.toEqual({
      media: [],
      requiresCorrectionReason: false,
    });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    vi.mocked(getCurrentUser).mockClear();
    await expect(getUnreferencedStagedMedia()).resolves.toEqual({ media: [] });

    expect(read).not.toHaveBeenCalled();
  });

  test("returns a canonical page with its continuation cursor", async () => {
    signedInAs({ isAdmin: true });

    await expect(getMedia("current-page")).resolves.toEqual({
      media: [{
        ...stagedMedia,
        storagePath: undefined,
        url: "/midia/media-1",
      }],
      requiresCorrectionReason: false,
      nextCursor: "next-page",
    });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("search", { limit: 50, cursor: "current-page" });
  });

  test("returns the Worker's report page", async () => {
    signedInAs({ isAdmin: true });

    await expect(getUnreferencedStagedMedia("current-report-page"))
      .resolves.toEqual({
        media: [{
          ...stagedMedia,
          storagePath: undefined,
          url: "/midia/media-1",
        }],
        nextCursor: "report-next-page",
      });
    expect(read).toHaveBeenCalledWith("unreferenced", { limit: 50, cursor: "current-report-page" });
  });

  test("allows an Editor to read the paginated catalog", async () => {
    signedInAs({ isEditor: true });
    await expect(getMedia()).resolves.toMatchObject({
      media: [{ id: "media-1" }],
      requiresCorrectionReason: true,
      nextCursor: "next-page",
    });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    await expect(getUnreferencedStagedMedia()).resolves.toEqual({ media: [] });
    expect(read.mock.calls).toEqual([["search", { limit: 50 }]]);
  });

  test("gives an Editor who is also an Admin the editorial correction capability", async () => {
    signedInAs({ isAdmin: true, isEditor: true });
    await expect(getMedia()).resolves.toMatchObject({
      media: [{ id: "media-1" }],
      requiresCorrectionReason: true,
    });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  test("an unreachable Worker is reported where the catalog read fails", async () => {
    signedInAs({ isAdmin: true });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(workerMedia).mockRejectedValueOnce(new Error("authority unreachable"));
    await expect(getMedia()).rejects.toThrow("authority unreachable");
    expect(JSON.parse(String(errorLog.mock.calls[0]![0]))).toMatchObject({ event: "media.action.failed", operation: "media.catalog.search" });
    errorLog.mockRestore();
  });
});
