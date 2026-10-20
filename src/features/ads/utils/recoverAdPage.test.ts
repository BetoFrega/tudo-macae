import { expect, test, vi } from "vitest";
import { createPublicAdDiscovery, InvalidAdCursorError } from "@tudomacae/ads/publicDiscovery";
import { adPageRedirectPath, recoverAdPage, validatedAdPageRedirectPath } from "./recoverAdPage";

test("recovers only an invalid cursor without reissuing a first-page read", async () => {
  expect(await recoverAdPage(async () => {
    throw new InvalidAdCursorError();
  })).toEqual({ items: [], invalidCursor: true });
  const outage = new Error("unavailable");
  await expect(recoverAdPage(async () => {
    throw outage;
  })).rejects.toBe(outage);
  const page = { items: [{ id: "ad" }], nextCursor: "next" };
  expect(await recoverAdPage(async () => page)).toBe(page);
});

test.each(["/negocio/profile/titulo-atual", "/categoria/category/titulo-atual", "/categoria/category/titulo/subcategory/atual"])("canonical slug recovery preserves the accepted continuation and ads anchor for %s", (path) => {
  expect(adPageRedirectPath(path, "cursor+/=", {})).toBe(path + "?adCursor=cursor%2B%2F%3D#anuncios");
});

test.each(["/negocio/profile/titulo-atual", "/categoria/category/titulo-atual", "/categoria/category/titulo/subcategory/atual"])("canonical slug recovery drops a rejected or absent continuation for %s", (path) => {
  expect(adPageRedirectPath(path, "broken", { invalidCursor: true })).toBe(path);
  for (const cursor of [undefined, [], ""]) expect(adPageRedirectPath(path, cursor, {})).toBe(path);
});

test("redirect validation accepts the scoped cursor without issuing an ad or taxonomy read", () => {
  const read = vi.fn();
  const taxonomy = vi.fn();
  const discovery = createPublicAdDiscovery({ store: { read }, taxonomy });
  const scope = { kind: "category", categoryId: "category" } as const;
  const cursor = Buffer.from(JSON.stringify({ key: JSON.stringify([scope, 30]), after: { createdAt: 1, id: "ad" } })).toString("base64url");
  const path = "/categoria/category/current";
  expect(validatedAdPageRedirectPath(path, cursor, () => discovery.canonical({ scope, cursor }))).toBe(path + "?adCursor=" + encodeURIComponent(cursor) + "#anuncios");
  for (const invalid of ["broken", "", ["one", "two"]]) {
    expect(validatedAdPageRedirectPath(path, invalid, () => discovery.canonical({ scope, cursor: invalid }))).toBe(path);
  }
  expect(read).not.toHaveBeenCalled();
  expect(taxonomy).not.toHaveBeenCalled();
  const outage = new Error("unavailable");
  expect(() => validatedAdPageRedirectPath(path, cursor, () => {
    throw outage;
  })).toThrow(outage);
});
