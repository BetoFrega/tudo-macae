import { beforeEach, expect, test, vi } from "vitest";
import { readAccountReminderFromBrowser, readEmailVerificationFromBrowser } from "./readAccountStatus";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());

test("account reminders use a private GET and reject malformed navigation", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ text: "Confirme seu e-mail", label: "Verificar", href: "/minha-conta/verificar-email" }));
  await expect(readAccountReminderFromBrowser("publication-1")).resolves.toMatchObject({ href: "/minha-conta/verificar-email" });
  expect(fetchMock).toHaveBeenCalledWith("/api/autenticacao/lembrete?publication=publication-1", {
    method: "GET", credentials: "same-origin", cache: "no-store",
  });

  fetchMock.mockResolvedValueOnce(Response.json({ text: "Unsafe", label: "Open", href: "//elsewhere.example" }));
  await expect(readAccountReminderFromBrowser()).rejects.toThrow("Invalid account reminder response");
});

test("verification reads encode continuation and preserve failed HTTP responses", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ uid: "ana", email: "ana@example.com", emailVerified: false, nextSendAt: 0, destination: "/minha-conta/anuncios" }));
  await expect(readEmailVerificationFromBrowser({ ad: "ad-1" })).resolves.toMatchObject({ uid: "ana" });
  expect(fetchMock).toHaveBeenCalledWith("/api/autenticacao/verificacao-email?ad=ad-1", {
    method: "GET", credentials: "same-origin", cache: "no-store",
  });

  fetchMock.mockResolvedValueOnce(Response.json({ error: "Falha" }, { status: 503 }));
  await expect(readEmailVerificationFromBrowser()).rejects.toThrow("Account status request failed");
});
