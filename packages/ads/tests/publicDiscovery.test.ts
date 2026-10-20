import { describe, expect, test, vi } from "vitest";
import { createPublicAdDiscovery, isPublicAdProfileId, InvalidAdCursorError, PUBLIC_AD_PAGE_SIZE } from "../publicDiscovery";

function fixture() {
  const read = vi.fn().mockResolvedValue({ items: [], scanned: 0, hasMore: false });
  const discovery = createPublicAdDiscovery({
    store: { read },
    taxonomy: async () => [{ id: "category", subcategories: [{ id: "subcategory" }] }],
  });
  return { discovery, read };
}

describe("public ad discovery", () => {
  test("reconstructs identical accepted query inputs without caller-only fields", async () => {
    const { discovery } = fixture();
    const ordinary = await discovery.filtered({ categoryId: "category", subcategoryId: "subcategory" });
    const additional = await discovery.filtered({ categoryId: "category", subcategoryId: "subcategory", noise: crypto.randomUUID() });
    expect(additional).toEqual(ordinary);
    expect(ordinary).toEqual({ scope: { kind: "subcategory", categoryId: "category", subcategoryId: "subcategory" }, limit: PUBLIC_AD_PAGE_SIZE });
  });

  test("rejects mismatched taxonomy, aliases and malformed values before reading", async () => {
    const { discovery, read } = fixture();
    for (const input of [
      { categoryId: "other", subcategoryId: "subcategory" },
      { categoryId: "category", subcategoryId: "other" },
      { categoryId: ["category"] },
      { categoryId: "category/other" },
    ]) await expect(discovery.filtered(input)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  test.each([0, 31, Infinity, NaN, 1.5])("rejects unsafe page limit %s instead of dropping or reinterpreting it", async (limit) => {
    const { discovery, read } = fixture();
    expect(() => discovery.canonical({ scope: { kind: "all" }, limit })).toThrow();
    await expect(discovery.read({ scope: { kind: "all" }, limit })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  test("advances across an entirely filtered page and binds canonical cursors to the query", async () => {
    const { discovery, read } = fixture();
    read.mockResolvedValueOnce({ items: [], scanned: 31, hasMore: true, lastScanned: { createdAt: 100, id: "pending" } });
    const request = discovery.canonical({ scope: { kind: "category", categoryId: "category" } });
    const page = await discovery.read(request);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeDefined();
    const next = discovery.canonical({ scope: request.scope, cursor: page.nextCursor });
    expect(next.after).toEqual({ createdAt: 100, id: "pending" });
    await discovery.read(next);
    expect(read).toHaveBeenLastCalledWith({ scope: request.scope, limit: 30, after: next.after });
    expect(() => discovery.canonical({ scope: { kind: "profile", profileId: "profile" }, cursor: page.nextCursor })).toThrow();
    expect(() => discovery.canonical({ scope: request.scope, cursor: page.nextCursor + "=" })).toThrow();
  });

  test("preserves a requested homepage limit and refuses an adapter exceeding it", async () => {
    const { discovery, read } = fixture();
    const input = discovery.canonical({ scope: { kind: "all" }, limit: 6 });
    expect(input.limit).toBe(6);
    read.mockResolvedValue({ items: [], scanned: 8, hasMore: false });
    await expect(discovery.read(input)).rejects.toThrow("page budget");
  });
});

test.each(["broken", "", "x".repeat(1025), ["first", "second"], null])("rejects invalid cursor %j with a recoverable error before reading", async (cursor) => {
  const { discovery, read } = fixture();
  expect(() => discovery.canonical({ scope: { kind: "all" }, cursor })).toThrow(InvalidAdCursorError);
  await expect(discovery.filtered({ categoryId: "category", cursor })).rejects.toBeInstanceOf(InvalidAdCursorError);
  expect(read).not.toHaveBeenCalled();
});

test("does not offer a continuation when exactly one full source page remains", async () => {
  const { discovery, read } = fixture();
  read.mockResolvedValue({ items: [], scanned: 30, hasMore: false, lastScanned: { createdAt: 1, id: "last" } });
  expect(await discovery.read(discovery.canonical({ scope: { kind: "all" } }))).toEqual({ items: [] });
});

test("route profile identifiers use the same validation as the discovery scope", () => {
  const { discovery } = fixture();
  for (const value of ["profile", "p".repeat(200), "publication-" + "p".repeat(200)]) {
    expect(isPublicAdProfileId(value)).toBe(true);
    expect(() => discovery.canonical({ scope: { kind: "profile", profileId: value } })).not.toThrow();
  }
  for (const value of ["", ".", "..", "profile/other", "p".repeat(213), null, ["profile"]]) {
    expect(isPublicAdProfileId(value)).toBe(false);
    expect(() => discovery.canonical({ scope: { kind: "profile", profileId: value } })).toThrow();
  }
});

test.each(["a".repeat(200), "漢".repeat(200), "\u0001".repeat(200)])("round-trips the server cursor for a writable long ad ID", async (id) => {
  const { discovery, read } = fixture();
  const request = await discovery.filtered({ categoryId: "category", subcategoryId: "subcategory" });
  read.mockResolvedValueOnce({ items: [], scanned: 31, hasMore: true, lastScanned: { createdAt: 100, id } });
  const page = await discovery.read(request);
  expect(page.nextCursor).toBeDefined();
  const next = await discovery.filtered({ categoryId: "category", subcategoryId: "subcategory", cursor: page.nextCursor });
  expect(next.after).toEqual({ createdAt: 100, id });
  await discovery.read(next);
  expect(read).toHaveBeenLastCalledWith({ scope: request.scope, limit: 30, after: { createdAt: 100, id } });
});

test.each([".", "..", "__invalid__", "__\n__", "ad/other", "\ud800", "__id0__", "__id01__", "__id9223372036854775808__", "__id" + "9".repeat(80) + "__"])("recovers an impossible cursor document ID before querying", async (id) => {
  const { discovery, read } = fixture();
  const scope = { kind: "all" as const };
  const key = JSON.stringify([scope, PUBLIC_AD_PAGE_SIZE]);
  const cursor = Buffer.from(JSON.stringify({ key, after: { createdAt: 100, id } })).toString("base64url");
  expect(() => discovery.canonical({ scope, cursor })).toThrow(InvalidAdCursorError);
  expect(read).not.toHaveBeenCalled();
  expect(isPublicAdProfileId(id)).toBe(false);
});

test.each(["__id123__", "__id9223372036854775807__"])("accepts numeric IDs exposed by Datastore imports", (id) => {
  const { discovery } = fixture();
  const scope = { kind: "all" as const };
  const key = JSON.stringify([scope, PUBLIC_AD_PAGE_SIZE]);
  const after = { createdAt: 100, id };
  const cursor = Buffer.from(JSON.stringify({ key, after })).toString("base64url");
  expect(discovery.canonical({ scope, cursor }).after).toEqual(after);
});
