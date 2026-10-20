// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { readPendingPublication } from "./readPendingPublication";
afterEach(() => vi.unstubAllGlobals());
test("recovery uses an ordinary private GET instead of posting a Server Action", async () => {
  const data = { publication: { id: "draft" }, profiles: [] };
  const fetch = vi.fn().mockResolvedValue(Response.json(data));
  vi.stubGlobal("fetch", fetch);
  expect(await readPendingPublication("draft")).toEqual(data);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/publicacoes-pendentes/draft", { cache: "no-store" });
});
test("an inaccessible draft produces a visible recovery failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Publicação não encontrada nesta conta." }, { status: 404 })));
  await expect(readPendingPublication("draft")).rejects.toThrow("Publicação não encontrada nesta conta.");
});

test("a transport failure never exposes infrastructure details in the visible error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));
  await expect(readPendingPublication("draft")).rejects.toThrow("Não foi possível retomar a publicação. Recarregue a página e tente novamente.");
});
