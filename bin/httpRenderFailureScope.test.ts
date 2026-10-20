import { expect, test } from "vitest";
import { createExpectedRenderFailureScope, httpFailureSchema, isNextPrefetch } from "../tests/e2e/_helpers/httpDiagnostics";

test("owned render failure scope accepts only its current exact GET and ends on failure", async () => {
  const scope = createExpectedRenderFailureScope();
  expect(scope.matches("GET", "/admin/anuncios", false)).toBe(false);
  await expect(scope.during("/admin/anuncios", async () => {
    expect(scope.matches("GET", "/admin/anuncios", false)).toBe(true);
    expect(scope.matches("POST", "/admin/anuncios", false)).toBe(false);
    expect(scope.matches("GET", "/admin/anuncios/other", false)).toBe(false);
    expect(scope.matches("GET", "/admin/anuncios", true)).toBe(false);
    throw new Error("fixture assertion failed");
  })).rejects.toThrow("fixture assertion failed");
  expect(scope.matches("GET", "/admin/anuncios", false)).toBe(false);
});

test("scope rejects wildcard, remote, query and overlapping declarations", async () => {
  const scope = createExpectedRenderFailureScope();
  for (const path of ["**", "https://example.test/admin", "//example.test/admin", "/admin?query=private", "/admin/*"]) {
    await expect(scope.during(path, async () => {})).rejects.toThrow("exact local pathname");
  }
  await scope.during("/admin", async () => {
    await expect(scope.during("/redacao", async () => {})).rejects.toThrow("cannot overlap");
    expect(scope.matches("GET", "/admin", false)).toBe(true);
  });
});

test("an expected HTTP failure still retains its sanitized diagnostic shape", () => {
  const failure = httpFailureSchema.parse({
    at: new Date().toISOString(), status: 500, method: "GET", path: "/admin/anuncios?token=private",
    rsc: false, prefetch: false, bodyKind: "html", expected: "malformed-emulator-fixture",
  });
  expect(failure.path).toBe("/admin/anuncios");
  expect(failure.expected).toBe("malformed-emulator-fixture");
  expect(JSON.stringify(failure)).not.toContain("private");
});

test("all Next prefetch variants stay unexpected even within an owned render window", async () => {
  const scope = createExpectedRenderFailureScope();
  await scope.during("/admin/anuncios", async () => {
    const prefetchHeaders: Record<string, string>[] = [
      { "next-router-prefetch": "1" }, { "next-router-prefetch": "2" }, { "next-router-prefetch": "3" },
      { "next-router-segment-prefetch": "/_tree" },
    ];
    for (const headers of prefetchHeaders) {
      expect(isNextPrefetch(headers)).toBe(true);
      expect(scope.matches("GET", "/admin/anuncios", isNextPrefetch(headers))).toBe(false);
    }
    expect(isNextPrefetch({ rsc: "1" })).toBe(false);
    expect(scope.matches("GET", "/admin/anuncios", isNextPrefetch({ rsc: "1" }))).toBe(true);
  });
  expect(scope.matches("GET", "/admin/anuncios", false)).toBe(false);
  expect(httpFailureSchema.safeParse({
    at: new Date().toISOString(), status: 401, method: "GET", path: "/admin/anuncios",
    rsc: false, prefetch: false, bodyKind: "html", expected: "malformed-emulator-fixture",
  }).success).toBe(false);
});
