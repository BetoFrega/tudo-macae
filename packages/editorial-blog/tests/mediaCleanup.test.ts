import { expect, test, vi } from "vitest";
import { createArticleMediaCleanup, type ArticleMediaCleanupDependencies } from "../mediaCleanup";

const key = `editorial/photo/${"a".repeat(64)}`;

function fixture() {
  let pending = { version: 1, keys: [key, key] };
  const isPublic = vi.fn(async () => false);
  const purge = vi.fn<ArticleMediaCleanupDependencies["purge"]>(async () => ({ success: true }));
  const failed = vi.fn();
  const complete = vi.fn(async (_id: string, version: number) => {
    if (pending.version !== version) return false;
    pending = { ...pending, keys: [] };
    return true;
  });
  return { workflow: createArticleMediaCleanup({ readPending: async () => ({ ...pending, keys: [...pending.keys] }), isPublic, purge, complete, failed }), isPublic, purge, complete, failed, change: () => {
    pending.version++;
  }, pending: () => pending };
}

test("retires the last public use once and repeating a confirmed cleanup is a no-op", async () => {
  const f = fixture();
  expect(await f.workflow.synchronize("article")).toEqual({ status: "confirmed" });
  expect(f.purge).toHaveBeenCalledExactlyOnceWith([key]);
  expect(await f.workflow.synchronize("article")).toEqual({ status: "confirmed" });
  expect(f.purge).toHaveBeenCalledTimes(1);
});

test("another effective public use preserves the shared image without purging", async () => {
  const f = fixture();
  f.isPublic.mockResolvedValue(true);
  expect(await f.workflow.synchronize("article")).toEqual({ status: "confirmed" });
  expect(f.purge).not.toHaveBeenCalled();
});

test("purge failure retains the intent for a successful manual retry", async () => {
  const f = fixture();
  f.purge.mockResolvedValueOnce({ success: false });
  expect(await f.workflow.synchronize("article", "correlation")).toEqual({ status: "unconfirmed" });
  expect(f.failed).toHaveBeenCalledExactlyOnceWith("purge", "correlation", "provider", "article");
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.pending().keys).toContain(key);
  expect(await f.workflow.synchronize("article")).toEqual({ status: "confirmed" });
});

test("concurrent editorial mutation cannot have its pending cleanup acknowledged", async () => {
  const f = fixture();
  f.purge.mockImplementation(async () => {
    f.change();
    return { success: true };
  });
  expect(await f.workflow.synchronize("article")).toEqual({ status: "unconfirmed" });
  expect(f.pending().keys).toContain(key);
  expect(f.failed).toHaveBeenCalledExactlyOnceWith("completion", undefined, "conflict", "article");
});

test("an unconfirmed probe retains correlated boundary diagnostics and the durable retry intent", async () => {
  const f = fixture();
  const verification = { requestId: "cleanup-operation", boundary: "worker", outcome: "response", statusClass: "2xx", width: 750, format: "avif" } as const;
  f.purge.mockResolvedValueOnce({ success: false, cause: "verification", verification });
  expect(await f.workflow.synchronize("article", "cleanup-operation")).toEqual({ status: "unconfirmed" });
  expect(f.purge).toHaveBeenCalledExactlyOnceWith([key]);
  expect(f.failed).toHaveBeenCalledExactlyOnceWith("purge", "cleanup-operation", "verification", "article", verification);
  expect(f.pending().keys).toContain(key);
  expect(f.complete).not.toHaveBeenCalled();
});

test("public-use dependency failure fails safe before purging", async () => {
  const f = fixture();
  f.isPublic.mockRejectedValue(new Error("private diagnostic"));
  expect(await f.workflow.synchronize("article")).toEqual({ status: "unconfirmed" });
  expect(f.purge).not.toHaveBeenCalled();
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.failed).toHaveBeenCalledExactlyOnceWith("public-use", undefined, "dependency", "article");
});

test.each(["configuration", "authorization", "rate_limit", "provider", "timeout", "transport", "verification"] as const)("preserves bounded purge cause %s for operational recovery", async (cause) => {
  const f = fixture();
  f.purge.mockResolvedValueOnce({ success: false, cause });
  expect(await f.workflow.synchronize("article", "correlation")).toEqual({ status: "unconfirmed" });
  expect(f.failed).toHaveBeenCalledExactlyOnceWith("purge", "correlation", cause, "article");
  expect(f.complete).not.toHaveBeenCalled();
});
