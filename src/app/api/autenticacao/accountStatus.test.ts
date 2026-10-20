import { beforeEach, expect, test, vi } from "vitest";

const reads = vi.hoisted(() => ({ reminder: vi.fn(), verification: vi.fn() }));
vi.mock("@/features/authentication/emailVerificationReads", () => ({
  readAccountReminder: reads.reminder,
  readEmailVerificationState: reads.verification,
}));

import { GET as reminderGET } from "./lembrete/route";
import { GET as verificationGET } from "./verificacao-email/route";

beforeEach(() => vi.clearAllMocks());

test("anonymous reminder stays null and account responses cannot be cached", async () => {
  reads.reminder.mockResolvedValue(null);
  const response = await reminderGET(new Request("https://example.test/api/autenticacao/lembrete?publication=owned"));
  expect(reads.reminder).toHaveBeenCalledWith("owned");
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/u);
});

test("verification forwards continuation through the authenticated read and keeps failures private", async () => {
  reads.verification.mockResolvedValueOnce({ uid: "ana" }).mockRejectedValueOnce(new Error("provider unavailable"));
  const url = "https://example.test/api/autenticacao/verificacao-email?publication=pub-1&ad=ad-1";
  const response = await verificationGET(new Request(url));
  expect(reads.verification).toHaveBeenCalledWith({ publication: "pub-1", ad: "ad-1" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");

  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failed = await verificationGET(new Request(url));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "Não foi possível consultar a verificação." });
    const logged = JSON.parse(String(errorLog.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({
      event: "authentication.verification.read_failed",
      outcome: "failed",
      route: "/api/autenticacao/verificacao-email",
      statusClass: "5xx",
      failureCategory: "unexpected",
      requestId: failed.headers.get("x-request-id"),
    });
    expect(JSON.stringify(logged)).not.toContain("provider unavailable");
  }
  finally { errorLog.mockRestore(); }
});
