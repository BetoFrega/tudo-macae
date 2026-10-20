import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { workerMedia } from "@/packages/media-api";
import { GET } from "./route";

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/packages/media-api", async importOriginal => ({ ...await importOriginal<typeof import("@/packages/media-api")>(), workerMedia: vi.fn() }));

const context = { params: Promise.resolve({ id: "media-1" }) };
const editor = { uid: "editor-1", email: "editora@example.com", emailVerified: true, isAdmin: false, isEditor: true };
const content = vi.fn<(id: string) => Promise<Response>>();

describe("private Media preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workerMedia).mockResolvedValue({ content } as never);
  });

  test("refuses an anonymous request before reading the Media", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/midia/media-1"), context);

    expect(response.status).toBe(401);
    expect(content).not.toHaveBeenCalled();
  });

  test("refuses a signed-in person without an acervo role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...editor, uid: "user-1", isEditor: false });

    const response = await GET(new Request("http://localhost/midia/media-1"), context);

    expect(response.status).toBe(403);
    expect(content).not.toHaveBeenCalled();
  });

  test("does not expose a missing Media", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...editor, isAdmin: true, isEditor: false });
    content.mockResolvedValueOnce(new Response("{\"error\":\"not found\"}", { status: 404 }));

    const response = await GET(new Request("http://localhost/midia/missing"), { params: Promise.resolve({ id: "missing" }) });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  test("serves the Worker's sanitized bytes privately and hides its failures", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(editor);
    content
      .mockResolvedValueOnce(new Response("webp-bytes", { headers: { "content-type": "image/webp" } }))
      .mockResolvedValueOnce(new Response("{\"error\":\"internal detail\"}", { status: 500 }))
      .mockRejectedValueOnce(new Error("timeout"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const served = await GET(new Request("http://localhost/midia/media-1"), context);
    expect(content).toHaveBeenCalledWith("media-1");
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await served.text()).toBe("webp-bytes");
    const failed = await GET(new Request("http://localhost/midia/media-1"), context);
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe("");
    expect(failed.headers.get("cache-control")).toBe("private, no-store");
    const unreachable = await GET(new Request("http://localhost/midia/media-1"), context);
    expect(unreachable.status).toBe(503);
    vi.mocked(workerMedia).mockRejectedValueOnce(new Error("configuration missing"));
    const unconfigured = await GET(new Request("http://localhost/midia/media-1"), context);
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.text()).toBe("");
    // The unmarked 500, the rejected fetch and the missing configuration; none reached a Worker log.
    expect(errorLog).toHaveBeenCalledTimes(3);
    errorLog.mockRestore();
  });
});
